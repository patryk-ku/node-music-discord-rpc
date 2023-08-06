'use strict';
const { exec } = require("child_process");
const querystring = require("querystring");
const AutoClient = require("./discord-auto-rpc/index.js");
const { readFileSync, writeFileSync } = require("fs");

// credentials:
const { lastfmApiKey, clientId } = require('./credentials.js');

// process.removeAllListeners('warning'); // to disable fetch warning, tmp until node 20 pkg update

// passing given options and parameters to playerctl command
function playerctl(command) {
    return new Promise((resolve, reject) => {
        exec('playerctl ' + command, (error, stdout, stderr) => {
            if (error) {
                // console.log('error: ' + error.message);
                reject(error);
                return;
            }
            if (stderr) {
                // console.log('stderr: ' + stderr);
                reject(stderr);
                return;
            }
            resolve(stdout);
        });
    });
}

// parsing metadata from playerctl command
async function getMetadata() {
    let output = await playerctl('metadata');
    let array = output.split("\n");

    array = array.filter(str => str.search(':') > -1);
    array = array.map(str => str.slice(str.search(':') + 1));
    let metadata = {};
    array = array.forEach(str => {
        let space = str.search(' ');
        if (space > -1) {
            let name = str.slice(0, space);
            let value = str.slice(space).trim();
            metadata[name] = value;
        }
    });

    return metadata;
}

// fetch album image link from last fm api and save it to cache
async function fetchAlbumUrl(artist, album) {
    const url = `http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${lastfmApiKey}&artist=${querystring.escape(artist)}&album=${querystring.escape(album)}&autocorrect=0&format=json`;
    const response = await fetch(url).then(res => res.json()).catch(error => { return error });
    // console.log(response.album.tracks);

    if (response.error) {
        return '';
    }
    if (!response.album) {
        return '';
    }
    if (!response.album.image) {
        return '';
    }

    // save url to cache
    if (!rpcOptions.disableCache) {
        let cacheFile;
        try {
            cacheFile = readFileSync('./node-rpc-cache.json');
            cacheFile = JSON.parse(cacheFile);
        } catch {
            console.log('[info] Cache file not found, creating new one');
            cacheFile = {};
        }

        // todo: add error handling for corupted/unsupported files
        if (cacheFile.hasOwnProperty(artist)) {
            cacheFile[artist][album] = response.album.image[3]['#text'];
        } else {
            cacheFile[artist] = {};
            cacheFile[artist][album] = response.album.image[3]['#text'];
        }

        cacheFile = JSON.stringify(cacheFile);
        writeFileSync('./node-rpc-cache.json', cacheFile);
    }

    console.log(' -> fetched album data from last.fm api');
    return response.album.image[3]['#text'];
}

// Try to load album art url from cache file if exist
function urlCache(artist, album) {
    if (rpcOptions.disableCache) {
        return '';
    }
    let cacheFile;
    try {
        cacheFile = readFileSync('./node-rpc-cache.json');
        cacheFile = JSON.parse(cacheFile);
    } catch {
        return '';
    }

    let url = '';
    if (cacheFile.hasOwnProperty(artist)) {
        if (cacheFile[artist].hasOwnProperty(album)) {
            url = cacheFile[artist][album];
        }
    }

    return url;
}

// Loading config file if exist
const rpcOptionsDefault = {
    refreshRate: 15,
    profileButton: false,
    lastfmNickname: "your-lastfm-nickname",
    searchSongButton: true,
    placeholderCover: true,
    disableCache: false
};
let rpcOptions;
try {
    rpcOptions = readFileSync('./node-rpc-config.json');
    rpcOptions = JSON.parse(rpcOptions);
    console.log('[info] Config file found.');
} catch (error) {
    console.log("[info] Config file not found or it's not valid .json file, using default options.");
    rpcOptions = rpcOptionsDefault;
}

// Config file validation:
const validation = {
    refreshRate: false,
    profileButton: false,
    lastfmNickname: false,
    searchSongButton: false,
    placeholderCover: false,
    disableCache: false
};

if (typeof rpcOptions !== 'object') {
    console.log('[warn] Problem with config file, using default options.')
    rpcOptions = rpcOptionsDefault;
} else {
    if (rpcOptions.refreshRate) {
        if (typeof rpcOptions.refreshRate === 'number') {
            if (rpcOptions.refreshRate >= 5) {
                validation.refreshRate = true;
            }
        }
    }

    if (typeof rpcOptions.profileButton === 'boolean') {
        validation.profileButton = true;
    }

    if (rpcOptions.lastfmNickname) {
        if (typeof rpcOptions.lastfmNickname === 'string' && rpcOptions.lastfmNickname.length > 0) {
            validation.lastfmNickname = true;
        }
    }

    if (typeof rpcOptions.searchSongButton === 'boolean') {
        validation.searchSongButton = true;
    }

    if (typeof rpcOptions.placeholderCover === 'boolean') {
        validation.placeholderCover = true;
    }

    if (typeof rpcOptions.disableCache === 'boolean') {
        validation.disableCache = true;
    }

}

// setting default if value from user config is wrong
if (!validation.refreshRate) {
    rpcOptions.refreshRate = rpcOptionsDefault.refreshRate;
    console.log('[error] Error in the configuration file. The value of "refreshRate" can only be a number equal to or greater than 5. Using default value.');
}

if (!validation.profileButton) {
    rpcOptions.profileButton = rpcOptionsDefault.profileButton;
    console.log('[error] Error in the configuration file. The value of "profileButton" can only be true or false. Using default value.');
}

if (!validation.lastfmNickname) {
    rpcOptions.lastfmNickname = rpcOptionsDefault.lastfmNickname;
    rpcOptions.profileButton = false;
    console.log('[error]  Error in the configuration file. The value of "lastfmNickname" can only be a text and cannot be empty.');
}

if (!validation.searchSongButton) {
    rpcOptions.searchSongButton = rpcOptionsDefault.searchSongButton;
    console.log('[error] Error in the configuration file. The value of "searchSongButton" can only be true or false. Using default value.');
}

if (!validation.placeholderCover) {
    rpcOptions.placeholderCover = rpcOptionsDefault.placeholderCover;
    console.log('[error] Error in the configuration file. The value of "placeholderCover" can only be true or false. Using default value.');
}

if (!validation.disableCache) {
    rpcOptions.disableCache = rpcOptionsDefault.disableCache;
    console.log('[error] Error in the configuration file. The value of "disableCache" can only be true or false. Using default value.');
}

console.log(rpcOptions);

// Rich Presence
const rpc = new AutoClient({ transport: "ipc" });

let isConnected = false;
let isPlayerOpen = true;
let nowPlaying = {
    album: '',
    artist: '',
    title: '',
    time: 0,
    timeElapsed: 0,
    url: '',
    status: 'playing'
};

async function updateStatus(nowPlaying, isForced = false) {
    if (!rpc) {
        console.log('[error] Cant connect to discord');
        return;
    }

    // save resources, function end here without connection with Discord, drawback: song time is not updating
    if (!isConnected) {
        return;
    }

    let playerStatus;
    try {
        playerStatus = await playerctl('status');
    } catch (error) {
        if (isPlayerOpen) {
            console.log('[info] No players found by playerctl. Waiting for any player with MPRIS support to start...');
            console.log(error.message);
            rpc.clearActivity();
        }
        isPlayerOpen = false;
        return;
    }

    if (!isPlayerOpen) {
        console.log('[info] Detected player with MPRIS support. Discord Rich Presence starting.');
    }

    playerStatus = playerStatus.trim().toLowerCase();

    if (!playerStatus) {
        rpc.clearActivity();
        return;
    }

    let metadata = await getMetadata();

    // Checking if main metadata values exist
    if (!metadata) {
        console.log('[warn] Failed to fetch metadata from current track');
        rpc.clearActivity();
        return
    }

    let isMetadataMissing = false;
    let isAlbumMissing = false;
    if (!metadata.title) {
        if (metadata.title.length < 1) {
            isMetadataMissing = true;
            metadata.title = 'unknown title';
        }
    }
    if (!metadata.album) {
        if (metadata.album.length < 1) {
            isAlbumMissing = true;
            nowPlaying.url = 'missing-cover';
            metadata.album = 'unknown album';
        }
    }
    if (!metadata.artist) {
        if (metadata.artist.length < 1) {
            isMetadataMissing = true;
            metadata.artist = 'unknown artist';
        }
    }

    // Checking if current track changed
    let isMetadataUpdated = false;
    if (
        metadata.title != nowPlaying.title ||
        metadata.artist != nowPlaying.artist ||
        metadata.album != nowPlaying.album
    ) {
        isMetadataUpdated = true;
        if (!isMetadataMissing) {
            console.log(`[song] ${metadata.title} - ${metadata.artist} (album: ${metadata.album})`);
            if (isAlbumMissing) {
                console.log(' -> Missing album name');
            }
        }
    }

    // Without track or artist name rpc is disabled
    if (isMetadataMissing) {
        if (isMetadataUpdated) {
            console.log('[warn] Missing artist or song name. Discord status disabled for this track');
        }
        rpc.clearActivity();
        return;
    }

    // Checking if music is playing or stopped
    let isStatusUpdated = false;
    if (playerStatus != nowPlaying.status) {
        isStatusUpdated = true;
        nowPlaying.status = playerStatus;
        console.log('[status] music ' + nowPlaying.status);
        if (nowPlaying.status == 'playing' && !isMetadataUpdated) {
            nowPlaying.time = Number(new Date()) - nowPlaying.timeElapsed;
        } else if (nowPlaying.status == 'paused' && !isMetadataUpdated) {
            nowPlaying.timeElapsed += rpcOptions.refreshRate * 1000;
        }
    }

    // Checking if song is repeated (works only if mpris provided track length)
    let isTrackRepeated = false;
    if (metadata.length) {
        if (metadata.length > 0) {
            // console.log(nowPlaying.timeElapsed);
            // console.log(Number(metadata.length.slice(0, -3)));
            // .slice(0, -3) is temporary solution, need to check other players output for sure
            if ((Number(metadata.length.slice(0, -3)) < nowPlaying.timeElapsed + Number(rpcOptions.refreshRate) && !isMetadataUpdated)) {
                console.log('[status] track repeated');
                nowPlaying.timeElapsed = 0;
                nowPlaying.time = Number(new Date());
                isTrackRepeated = true;
            }
        } else {
            if (isMetadataUpdated) { //tmp
                console.log(' -> Cannot get track lenght, repeating track detection disabled');
            }
        }
    } else {
        if (isMetadataUpdated) { //tmp
            console.log(' -> Cannot get track lenght, repeating track detection disabled');
        }
    }

    // Update metadata if player restarted
    if (!isPlayerOpen || isForced) {
        isMetadataUpdated = true;
    }
    isPlayerOpen = true;

    // Updating timer and skipping if nothing changed
    if (!isMetadataUpdated && !isStatusUpdated && !isTrackRepeated && !isForced) {
        if (nowPlaying.status == 'playing' && !isTrackRepeated) {
            nowPlaying.timeElapsed += rpcOptions.refreshRate * 1000;
        }
        return;
    }

    // Checking if needed to fetch new album cover url
    if (metadata.album != nowPlaying.album && isMetadataUpdated && !isAlbumMissing) {
        nowPlaying.url = urlCache(metadata.artist, metadata.album);
        if (nowPlaying.url == '') {
            nowPlaying.url = await fetchAlbumUrl(metadata.artist, metadata.album);
        }

        if (nowPlaying.url == '') {
            nowPlaying.url = 'missing-cover';
            console.log(' -> no image for given album');
        }
    }

    if (isMetadataUpdated) {
        nowPlaying.time = Number(new Date());
        nowPlaying.timeElapsed = 0;
        nowPlaying.title = String(metadata.title);
        nowPlaying.album = String(metadata.album);
        nowPlaying.artist = String(metadata.artist);
    }

    // Workaround for strings with less than 2 characters
    if (metadata.title.length < 2) {
        metadata.title = metadata.title + ' ';
    }
    if (metadata.artist.length < 2) {
        metadata.artist = metadata.artist + ' ';
    }
    if (metadata.album.length < 2) {
        metadata.album = metadata.album + ' ';
    }

    let activityData = {
        details: metadata.title, // song title
        state: 'by: ' + metadata.artist, // artist name
        largeImageKey: nowPlaying.url, // cover image url
        largeImageText: 'album: ' + metadata.album, // album title on cover hover
        smallImageKey: nowPlaying.status, // playing or stopped small icon
        smallImageText: nowPlaying.status, // playing or stoppped icon hover
        instance: false
    }

    if (nowPlaying.status == 'playing') {
        activityData.startTimestamp = nowPlaying.time;
    } else {
        activityData.endTimestamp = 1;
    }

    // Rich presence buttons (max 2)
    let buttons = [];
    if (rpcOptions.profileButton) {
        buttons.push({ label: "Open user's last.fm profile", url: `https://www.last.fm/user/${querystring.escape(rpcOptions.lastfmNickname)}` });
    }
    if (rpcOptions.searchSongButton) {
        buttons.push({ label: "Search this song on YouTube", url: 'https://www.youtube.com/results?search_query=' + querystring.escape(`${nowPlaying.artist} - ${nowPlaying.title}`) });
    }
    if (rpcOptions.profileButton || rpcOptions.searchSongButton) {
        activityData.buttons = buttons;
    }

    rpc.setActivity(activityData);
    console.log(' updated rich presence');

}

// rpc.on('ready', () => { // no idea why this stopped working
rpc.once('connected', () => {
    setInterval(() => {
        updateStatus(nowPlaying);
    }, rpcOptions.refreshRate * 1000);
});

rpc.transport.on('close', () => {
    console.log('[warn] Lost connection with Discord.');
    isConnected = false;
    isPlayerOpen = true;
});

rpc.on('connected', () => {
    console.log('[info] Connected with Discord.');
    isConnected = true;
    updateStatus(nowPlaying, true);
});

console.log('[info] Waiting for Discord to start...');
rpc.endlessLogin({ clientId }).catch(console.error);
