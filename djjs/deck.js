export default class Deck {

    constructor(deckname, minutes) {

        this.deckname = deckname;
        this.pages = Math.ceil(minutes * 60 * 44100 * 8 / 2 ** 16);
        this.integers = null;
        this.context = null;
        this.floats = null;
        this.node = null;
    }

    async boot(context) {

        this.context = context;

        const binary = await fetch("/djjs/deck.wasm");
        const module = await binary.arrayBuffer();

        await context.audioWorklet.addModule("/djjs/deck.processor.js");

        this.node = new AudioWorkletNode(context, "deck", {
            processorOptions: {module, pages: this.pages},
            outputChannelCount: [2],
        });

        this.node.port.onmessage = event => {

            this.floats = new Float32Array(event.data.buffer);
            this.integers = new Uint32Array(event.data.buffer, 1024, 4);
            this.node.connect(this.context.destination);
        };

        return this;
    }

    async load(trackname) {

        const track = await fetch(trackname);
        const buffer = await track.arrayBuffer();
        const audio = await this.context.decodeAudioData(buffer);

        this.sendPlay(0);
        this.sendLength(audio.length);
        this.sendOffset(1040 + audio.length * 4);
        this.floats.set(audio.getChannelData(0), 260);
        this.floats.set(audio.getChannelData(1), 260 + audio.length);

        return this;
    }

    sendPlay(state) { this.integers[0] = state }
    sendDrop(position) { this.floats[257] = position }
    sendLength(length) { this.floats[258] = length }
    sendOffset(offset) { this.integers[3] = offset }
}
