'use strict';
const { exec } = require("child_process");
const querystring = require("querystring");
const AutoClient = require("./discord-auto-rpc/index.js");
const { readFileSync, writeFileSync } = require("fs");

// credentials:
const { lastfmApiKey, clientId } = require('./credentials.js');

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

    console.log(' - fetched album data from last.fm api');
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
let rpcOptions;
try {
    rpcOptions = readFileSync('./node-rpc-config.json');
    rpcOptions = JSON.parse(rpcOptions);
    console.log('[info] Config file found.');
} catch (error) {
    console.log('[info] Config file not found, using default options.');
    rpcOptions = {
        refreshRate: 15,
        profileButton: false,
        lastfmNickname: "",
        searchSongButton: true,
        placeholderCover: true,
        disableCache: false
    };
}
// todo: add validation
console.log(rpcOptions);

// Rich Presence
const rpc = new AutoClient({ transport: "ipc" });

let isConnected = false;
let nowPlaying = {
    album: '',
    artist: '',
    title: '',
    time: 0,
    timeElapsed: 0,
    url: '',
    status: 'playing'
};

async function updateStatus(nowPlaying) {
    if (!rpc) {
        console.log('[warn] Cant connect to discord');
        return;
    }

    //tmp (song time is not updating with this while discord is closed)
    if (!isConnected) {
        return;
    }

    let playerStatus;
    try {
        playerStatus = await playerctl('status');
    } catch (error) {
        console.log(error.message);
        rpc.clearActivity();
        return;
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
    if (!metadata.title) {
        if (metadata.title.length < 1) {
            console.warn('[warn] Missing track name');
            rpc.clearActivity();
            return;
        }
    }
    if (!metadata.album) {
        if (metadata.album.length < 1) {
            console.warn('[warn] Missing album name');
            rpc.clearActivity();
            return;
            // todo: there are track without albums, fix this later
        }
    }
    if (!metadata.artist) {
        if (metadata.artist.length < 1) {
            console.warn('[warn] Missing artist name');
            rpc.clearActivity();
            return;
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
        console.log(`[song] ${metadata.title} - ${metadata.album} - ${metadata.artist}`);
    }

    // Checking if music is playing or stopped
    let isStatusUpdated = false;
    if (playerStatus != nowPlaying.status) {
        isStatusUpdated = true;
        nowPlaying.status = playerStatus;
        console.log(' music ' + nowPlaying.status);
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
                console.log('track repeated');
                nowPlaying.timeElapsed = 0;
                nowPlaying.time = Number(new Date());
                isTrackRepeated = true;
            }
        } else {
            if (isMetadataUpdated) { //tmp
                console.log(' Cannot get track lenght, repeating track detection disabled');
            }
        }
    } else {
        if (isMetadataUpdated) { //tmp
            console.log(' Cannot get track lenght, repeating track detection disabled');
        }
    }

    // todo: when reconnecting should skip this:
    // Updating timer and skipping if nothing changed
    if (!isMetadataUpdated && !isStatusUpdated && !isTrackRepeated) {
        if (nowPlaying.status == 'playing' && !isTrackRepeated) {
            nowPlaying.timeElapsed += rpcOptions.refreshRate * 1000;
        }
        return;
    }

    // Checking if needed to fetch new album cover url
    if (metadata.album != nowPlaying.album && isMetadataUpdated) {
        nowPlaying.url = urlCache(metadata.artist, metadata.album);
        if (nowPlaying.url == '') {
            nowPlaying.url = await fetchAlbumUrl(metadata.artist, metadata.album);
        } else {
            console.log(' - album url loaded from cache');
        }

        if (nowPlaying.url == '') {
            nowPlaying.url = 'missing-cover';
            console.log(' - no image for given album');
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

    //tmp todo: if its not connected skip entire function
    if (isConnected) {
        rpc.setActivity(activityData);
        console.log(' updated rich presence');
    }
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
});

rpc.on('connected', () => {
    console.log('[info] Connected with Discord.');
    isConnected = true;
    updateStatus(nowPlaying);
});

console.log('[info] Waiting for Discord to start...');
rpc.endlessLogin({ clientId }).catch(console.error);
