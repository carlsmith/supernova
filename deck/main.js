const context = new AudioContext();

context.audioWorklet.addModule("/deck/deck.js");

export default class Deck {

    constructor(deckname, trackname, autoconnect=true) {

        console.log(`Deck ${deckname}: Loading ${trackname} ...`);

        this.deckname = deckname;
        this.trackname = trackname;
        this.context = context;

        this.$autoconnect = autoconnect;
        this.$node = null;
        this.$boot();
    }

    async $boot() {

        const binary = await fetch("/deck/deck.wasm");
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

            const command = event.data[0];

            if (command === "init") {

                const memory = new Float32Array(event.data[1].buffer);

                memory.set(audio.getChannelData(0), 256);
                memory.set(audio.getChannelData(1), 256 + audio.length);

                if (this.$autoconnect) this.$node.connect(context.destination);

                console.log(`Deck ${this.deckname}: Ready.`);

            } else if (command === "news") console.log(event.data);
        };
    }

    news() { this.$node.port.postMessage(["news"]) }

    play() { this.$node.port.postMessage(["play"]) }

    stop() { this.$node.port.postMessage(["stop"]) }

    drop(position=0) { this.$node.port.postMessage(["drop", position]) }
}
