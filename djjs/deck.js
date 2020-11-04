export default class Deck {

    constructor(name, minutes) {

        this.deckname = name;
        this.pages = Math.ceil(minutes * 60 * 44100 * 8 / 2 ** 16);
        this.context = null;
        this.memory = null;
        this.node = null;
    }

    async boot(context) {

        const binary = await fetch("/djjs/deck.wasm");
        const module = await binary.arrayBuffer();

        this.context = context;

        await context.audioWorklet.addModule("/djjs/deck.processor.js");

        this.node = new AudioWorkletNode(context, "deck", {
            processorOptions: {module, pages: this.pages},
            outputChannelCount: [2],
        });

        this.node.port.onmessage = event => {

            const command = event.data[0];

            if (command === "init") {

                this.memory = new Float32Array(event.data[1].buffer);
                this.node.connect(this.context.destination);

            } else if (command === "news") console.log(event.data);
        };

        return this;
    }

    async load(trackname) {

        this.stop();

        const track = await fetch(trackname);
        const buffer = await track.arrayBuffer();
        const audio = await this.context.decodeAudioData(buffer);

        const dataLength = audio.length;
        const dataOffset = 1024 + dataLength * 4;

        this.memory.set(audio.getChannelData(0), 256);
        this.memory.set(audio.getChannelData(1), 256 + audio.length);

        this.node.port.postMessage(["sync", dataOffset, dataLength]);

        return this;
    }

    news() { this.node.port.postMessage(["news"]) }

    play() { this.node.port.postMessage(["play"]) }

    stop() { this.node.port.postMessage(["stop"]) }

    drop(position=0) { this.node.port.postMessage(["drop", position]) }
}
