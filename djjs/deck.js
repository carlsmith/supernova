export default class Deck {

    constructor(deckname, minutes) {

        /* This constructor takes a deckname string and buffer size
        in minutes, and initializes the properties of the instance.

        The method cannot fully construct the deck instance, as that
        requires some async operations, which constructors cannot do,
        so the user must call `boot` on the instance to finalize the
        process.

        Generally, only the `deckname` property is externally useful
        (along with some methods). */

        this.deckname = deckname;
        this.pages = Math.ceil(minutes * 60 * 44100 * 8 / 2 ** 16);
        this.dropCounter = 1;
        this.integers = null;
        this.context = null;
        this.floats = null;
        this.node = null;
    }

    async boot(context) {

        /* This method takes an audio context, and finishes off the
        initialization process (constructors cannot be async).

        The method is async, and returns a promise that resolves to
        the instance. It can be used like this:

            const audioContext = new AudioContext();
            deck = await new Deck("A", 8).boot(audioContext);

        The convoluted API is required, due to the way Web threads
        work (in general, and Audio Worklets in particular). */

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

            /* This handler is invoked exactly once (per instance), as
            the processor shares its Wasm memory with the main thread.
            It assigns the required (f32 and u32) views of the memory
            to the instance, and connects the node to the speakers.

            Note: See the Wasm module's docstring for more details on
            how the memory is laid out. */

            this.floats = new Float32Array(event.data.buffer);
            this.integers = new Uint32Array(event.data.buffer, 1024, 5);

            this.node.connect(this.context.destination);
        };

        return this;
    }

    async load(trackname) {

        /* This method takes a URL for a track. It fetches and decodes
        the given track, stops the deck, sets the track length and the
        channel data offset, then writes the samples to memory.

        This method is async, and returns a promise that resolves to
        the instance once the track has loaded:

            deck.load("song.mp3").then(deck => deck.play(1));    */

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

    read() {

        /* This method takes no arguments, and returns the current
        position of the stylus (with block-level accuracy). */

        return this.floats[261];
    }

    play(state) {

        /* This method takes an integer that is expected to be `0`
        or `1`, meaning *stop* and *play* respectively. The value
        is written to the play-state inbox. The result is always
        `undefined`. */

        this.integers[0] = state;
    }

    setLength(length) {

        /* This method takes an integer that is expected to be the
        length of the current track (in samples). The argument is
        written to the track length inbox, and read by the Wasm
        module (which expects a float). The result is always
        `undefined`. */

        this.floats[259] = length;
        return this;
    }

    setOffset(offset) {

        /* This method takes an integer that is expected to be the
        offset of the right channel data in memory. The integer is
        just written to the offset inbox. The result is always
        `undefined`. */

        this.integers[4] = offset;
    }

    drop(position) {

        /* This method takes a stylus position, writes it to the
        drop position inbox, then increments the value in the drop
        counter register. An atomic store is used to ensure these
        operations happen in the correct order. The result is
        always `undefined`. */

        this.floats[258] = position;
        Atomics.store(this.integers, 1, this.dropCounter++);
    }
}
