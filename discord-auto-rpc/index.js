const DiscordRPC = require("discord-rpc");

class AutoClient extends DiscordRPC.Client {
    constructor(options) {
        super(options);

        if (options.transport == "ipc") {
            this.transport.on("close", this.onClose.bind(this));
        }
    }

    onClose() {
        // console.log('Lost connection with Discord.');
        if (!this.closeinterval) {
            this.closeinterval = setInterval(() => {
                this.transport
                    .connect()
                    .then(() => {
                        this.closeinterval && clearInterval(this.closeinterval);
                        this.closeinterval = undefined;
                        // console.log('Reconnected with Discord.');
                        // this.emit("rpcReconnected");
                    })
                    .catch(() => { });
            }, 10 * 1000);
            // this.closeinterval.unref();
        }
    }

    async endlessConnect(clientId) {
        return new Promise((res) => {
            this.clientId = clientId;
            const fn = () => {
                this.transport
                    .connect(this.clientId)
                    .then(() => {
                        clearInterval(interval);
                    })
                    .catch(() => { });
            };
            const interval = setInterval(fn, 10 * 1000);
            // interval.unref();
            fn();

            this.once("connected", () => {
                // console.log('Connected with Discord.');
                res();
            });
        });
    }

    async endlessLogin(options) {
        if (this.options.transport != "ipc") {
            throw new Error(
                "Endless login is currently only supported on the IPC transport"
            );
        }

        await this.endlessConnect(options.clientId);

        if (!options.scopes) {
            this.emit("ready");
            return this;
        }
        if (!options.accessToken) {
            options.accessToken = await this.authorize(options);
        }
        return this.authenticate(options.accessToken);
    }
}

module.exports = AutoClient;
