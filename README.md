# node-music-discord-rpc

> **⚠️ I have rewritten this script in Rust and I highly recommend using Rust version over this as it is way lighter and faster, link to: [Rust version](https://github.com/patryk-ku/mpris-discord-rpc)**

Discord music rich presence status with **support for album covers** and optional buttons with links to your last.fm profile and to search current song on YouTube.

![example](https://github.com/patryk-ku/node-music-discord-rpc/assets/38609910/8e664517-8841-42fa-9a1e-876fc5ee4c30)

![discord-rpc1](https://github.com/patryk-ku/node-music-discord-rpc/assets/38609910/8ae30e1d-ef0f-453c-9cca-e9f52ef45b8e)

Written in JavaScript. It can be used without locally installed node.js because it is packaged as a stand-alone executable file.

**Currently only Linux is supported.** Support for Windows/MacOS ~~in the future~~ never (because these OS's lack a universal way to detect the currently playing song).

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

```json
{
    "refreshRate": 15,
    "profileButton": false,
    "lastfmNickname": "your-lastfm-nickname",
    "searchSongButton": true,
    "placeholderCover": true,
    "disableCache": false
}
```

Config options description:

| option | description |
| ----------- | ----------- |
| `refreshRate` | Time in seconds between every status updates. The smallest allowed value is 5. |
| `profileButton` | Display a button with a link to your profile on last.fm. Allowed values: true/false. |
| `lastfmNickname` | Your last.fm nickname. It must be set for the `profileButton` button to work correctly. |
| `searchSongButton` | Display button to search for the current song on YouTube. Allowed values: true/false. |
| `placeholderCover` | If the album has no cover display the default placeholder cover. If false status will only show text. Allowed values: true/false. |
| `disableCache` | If true it will disable the script's ability to use the cache. It is recommended to set the option to false. If cache remains enabled then each new album will be added to the cache file. Then each time the album is played again, the album cover link will not need to be downloaded again from the last.fm servers. The cache file will not grow large because the cover images are not saved directly, but only the links to them. Allowed values: true/false. |

## System usage

As this is written in JavaScript and run using node.js you might think that the system usage might be very high for such a simple script, but actually it's not. Depending on what you consider too high, of course. It uses about **78 MiB** of ram and CPU load of my *powerful* i5-4460 is around **0.2%** every 15 seconds while it's updating status.

## Running with locally installed node.js

Follow steps from "Compile from source" but:

- Instead of:

   ```
   npm install
   ```

   run:

   ```
   npm install --omit=dev
   ```
- Don't build entire script but instead run it everytime using:

   ```
   node app.js
   ```

This way, the script will be running with locally installed node.js and not the one bundled with the script. The minimum version of node.js is 18. But tbh there is not much advantage of this. Only slightly less ram usage and the script will take up less disk space.

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
