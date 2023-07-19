# node-music-discord-rpc

![example](https://github.com/patryk-ku/node-music-discord-rpc/assets/38609910/8e664517-8841-42fa-9a1e-876fc5ee4c30)

Discord music rich presence status with **support for album covers**. Written in JavaScript. It can be used without locally installed node.js because it is packaged as a stand-alone executable file.

**Currently only Linux is supported.** Support for Windows maybe in the future but not sure.

> **⚠️ Notice:** It's in pre-alpha state of development and may not work properly. Expect bugs, errors etc.

## Supported players
Any player or app with [MPRIS](https://wiki.archlinux.org/title/MPRIS) support, also including both Google Chrome and Firefox.

## Requirements
To work, it needs the [playerctl](https://github.com/altdesktop/playerctl) package installed. On it's github page you can find instructions on how to install it for your distribution, but it should be available in the  repositories of the majority of distributions.

## Installation
Download the executable from the [Releases](https://github.com/patryk-ku/node-music-discord-rpc/releases) page.

Then simply execute the `./node-music-discord-rpc` file in terminal. ~~For now script will crash without Discord running in the background. This will be fixed later so you will be able to launch it at the system start-up but it's not ready yet.~~ ([fixed here](https://github.com/patryk-ku/node-music-discord-rpc/commit/ace9612a5eb39008b540a7c51c0d09113dbbb115)). Now it's safe to run the script at the system startup. It will wait and check every 15 seconds if Discord is running. Also it is safe to exit Discord while script is running and it will reconnect automatically latter.

## Configuration

During startup, the script will check for the presence of a configuration file `node-rpc-config.json` in the running directory. Without a configuration file, it will use the default settings. An example configuration file with default settings can be found here or in the repository under the same name.

```
{
    "refreshRate": 15,
    "profileButton": false,
    "lastfmNickname": "your-lastfm-nickname",
    "searchSongButton": true,
    "placeholderCover": true
}
```
Config options description:

*wip*

## System usage

As this is written in JavaScript and run using node.js you might think that the system usage might be very high for such a simple script, but actually it's not. Depending on what you consider too high, of course. It uses about **78 MiB** of ram and CPU load of my *powerful* i5-4460 is around **0.2%** every 15 seconds while it's updating status.

## Running with locally installed node.js

*wip*

## Compile from source

Dependencies: node.js and npm installed.

> You will need [last.fm API key](https://www.last.fm/api#getting-started) and [Discord Client ID](https://discord.com/developers/docs/intro).

Clone the repository and run:

```
npm install
```

Next edit the file `credentials.js.original`, add the API key and Discord Client ID in the appropriate places. Then rename the file to `credentials.js`.

When all node packages have been installed, use the command:

```
npm run build
```
Packaged executable file will be in the `./build` directory.
