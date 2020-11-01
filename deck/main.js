const context = new AudioContext();

context.audioWorklet.addModule("/deck/deck.js");

export default class Deck {

    constructor(trackname, autoconnect=true) {

        console.log("launching...");

        this.trackname = trackname;
        this.context = context;

        this.$autoconnect = autoconnect;
        this.$node = null;
        this.$boot();
    }

    async $boot() {

        const binary = await fetch("deck.wasm");
        const module = await binary.arrayBuffer();

        const track = await fetch(this.trackname);
        const buffer = await track.arrayBuffer();
        const audio = await context.decodeAudioData(buffer);

        const dataLength = audio.length;
        const dataOffset = 1024 + dataLength * 4;

        this.$node = new AudioWorkletNode(context, "deck", {
            processorOptions: {module, dataLength, dataOffset},
            outputChannelCount: [2],
        });

        this.$node.port.onmessage = event => {

            const { command, data } = event.data;

            if (command === "init") {

                const memory = new Float32Array(data.buffer);

                memory.set(audio.getChannelData(0), 256);
                memory.set(audio.getChannelData(1), 256 + audio.length);

                if (this.$autoconnect) this.$node.connect(context.destination);

                console.log("ready!")

            } else if (command === "news") console.log(data);
        };

    }

    $post(command, data=null) {

        this.$node.port.postMessage({command, data});
    }

    play() { this.$post("play") }
    stop() { this.$post("stop") }
    drop(position=0) { this.$post("drop", position) }
}
