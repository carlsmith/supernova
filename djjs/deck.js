export default class Deck {

    constructor(deckname, minutes) {

        this.deckname = deckname;
        this.pages = Math.ceil(minutes * 60 * 44100 * 8 / 2 ** 16);
        this.dropCounter = 1;
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

        this.pitch = this.node.parameters.get("pitch");

        this.node.port.onmessage = event => {

            this.floats = new Float32Array(event.data.buffer);
            this.integers = new Uint32Array(event.data.buffer, 1024, 5);
            this.node.connect(this.context.destination);
        };

        return this;
    }

    async load(trackname) {

        const track = await fetch(trackname);
        const buffer = await track.arrayBuffer();
        const audio = await this.context.decodeAudioData(buffer);

        this.play(0);
        this.setLength(audio.length);
        this.setOffset(1048 + audio.length * 4);
        this.floats.set(audio.getChannelData(0), 262);
        this.floats.set(audio.getChannelData(1), 262 + audio.length);

        return this;
    }

    read() { return this.floats[261] }
    play(state) { this.integers[0] = state }
    setLength(length) { this.floats[259] = length }
    setOffset(offset) { this.integers[4] = offset }
    drop(position) {
        this.floats[258] = position;
        Atomics.store(this.integers, 1, this.dropCounter);
        this.dropCounter++;
    }
}
