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

        this.sendPlay(0);
        this.sendLength(audio.length);
        this.sendOffset(1044 + audio.length * 4);
        this.floats.set(audio.getChannelData(0), 261);
        this.floats.set(audio.getChannelData(1), 261 + audio.length);

        return this;
    }

    sendPlay(state) {

        /* This method takes a boolean that describes a play state,
        where `true` (or `1`) means *play*, and `false` (or `0`)
        means *stop*.

        Note: The Wasm module tracks the value in the play inbox,
        checking it on every iteration of the main loop. Whenever
        it changes, the state of the deck is updated accordingly,
        and the loop is reset (to minimize latency). */

        this.integers[0] = state;
    }

    sendDrop(position) {

        /* This method takes a floating point drop position (in
        samples), writes it to the drop position inbox, and then
        increments the integer in the drop counter inbox.

        Note: The Wasm module tracks the value in the drop counter
        inbox, checking it on every iteration of the main loop. If
        its value changes, the module immediately updates the sty-
        lus position to the value in the drop position inbox (and
        resets the loop (to minimize latency). */

        this.floats[258] = position; // TODO: do these statements       ??
        this.integers[1]++;          // need to be explicitly atomic    ??
    }

    sendLength(length) { this.floats[259] = length }
    sendOffset(offset) { this.integers[4] = offset }
}
