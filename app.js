'use strict';
const { exec } = require("child_process");
const DiscordRPC = require('discord-rpc');
const querystring = require("querystring");

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
    // array = array.map(str => str.split(':')[1]);
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

// fetch album image link from last fm api
async function fetchAlbumUrl(artist, album) {
    const url = `http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${lastfmApiKey}&artist=${querystring.escape(artist)}&album=${querystring.escape(album)}&autocorrect=0&format=json`;
    const response = await fetch(url).then(res => res.json());
    // console.log(response.album.tracks);
    // todo: add error handling and no image provided situation

    // console.log(' - fetched image url for: ' + album + ' by ' + artist);
    console.log(' - fetched album data from last.fm api');
    return response.album.image[3]['#text'];
}

//rpc

let rpc = new DiscordRPC.Client({ transport: 'ipc' });

let nowPlaying = {
    album: '',
    artist: '',
    title: '',
    time: 0,
    timeElapsed: 0,
    url: '',
    status: 'playing'
}

async function updateStatus(nowPlaying, refreshInterval) {
    if (!rpc) {
        console.log('Cant connect to discord');
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
        console.log('Failed to fetch metadata from current track');
        rpc.clearActivity();
        return
    }
    if (!metadata.title) {
        if (metadata.title.length < 1) {
            console.warn('Missing track name');
            rpc.clearActivity();
            return;
        }
    }
    if (!metadata.album) {
        if (metadata.album.length < 1) {
            console.warn('Missing album name');
            rpc.clearActivity();
            return;
            // to do: there are track without albums, fix this later
        }
    }
    if (!metadata.artist) {
        if (metadata.artist.length < 1) {
            console.warn('Missing artist name');
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
        console.log(`${metadata.title} - ${metadata.album} - ${metadata.artist}`);
    }

    // Checking if music is playing or stopped
    let isStatusUpdated = false;
    if (playerStatus != nowPlaying.status) {
        isStatusUpdated = true;
        nowPlaying.status = playerStatus;
        console.log(nowPlaying.status);
        if (nowPlaying.status == 'playing' && !isMetadataUpdated) {
            nowPlaying.time = Number(new Date()) - nowPlaying.timeElapsed;
        } else if (nowPlaying.status == 'paused' && !isMetadataUpdated) {
            nowPlaying.timeElapsed += refreshInterval * 1000;
        }
    }

    // Checking if song is repeated (works only if mpris provided track length)
    let isTrackRepeated = false;
    if (metadata.length) {
        if (metadata.length > 0) {
            // console.log(nowPlaying.timeElapsed);
            // console.log(Number(metadata.length.slice(0, -3)));
            // .slice(0, -3) is temporary solution, need to check other players output for sure
            if ((Number(metadata.length.slice(0, -3)) < nowPlaying.timeElapsed && !isMetadataUpdated)) {
                console.log('track repeated');
                nowPlaying.timeElapsed = 0;
                nowPlaying.time = Number(new Date());
                isTrackRepeated = true;
            }
        } else {
            console.log('Cannot get track lenght, repeating track detection disabled');
        }
    } else {
        console.log('Cannot get track lenght, repeating track detection disabled');
    }

    // Updating timer and skipping if nothing changed
    if (!isMetadataUpdated && !isStatusUpdated && !isTrackRepeated) {
        if (nowPlaying.status == 'playing' && !isTrackRepeated) {
            nowPlaying.timeElapsed += refreshInterval * 1000;
        }
        return;
    }

    // Checking if needed to fetch new album cover url
    if (metadata.album != nowPlaying.album && isMetadataUpdated) {
        nowPlaying.url = await fetchAlbumUrl(metadata.artist, metadata.album);
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
        details: metadata.title,
        state: 'by: ' + metadata.artist,
        largeImageKey: nowPlaying.url,
        largeImageText: 'album: ' + metadata.album,
        smallImageKey: nowPlaying.status, // playing or stopped icon
        smallImageText: nowPlaying.status, // playing or stoppped
        instance: false,
    }

    if (nowPlaying.status == 'playing') {
        activityData.startTimestamp = nowPlaying.time;
    } else {
        activityData.endTimestamp = 1;
    }

    rpc.setActivity(activityData);
    console.log('Updated rich presence');
}

rpc.on('ready', () => {
    let seconds = 15;
    // let seconds = 5;

    updateStatus(nowPlaying, seconds);

    setInterval(function () {
        updateStatus(nowPlaying, seconds);
    }, seconds * 1000);
});

rpc.login({ clientId }).catch(console.error);
