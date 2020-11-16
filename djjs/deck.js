 export default class Deck {

    constructor(name, pages) {

        /* This constructor takes a deck name string and buffer size
        in pages. It initializes the properties of the instance. The
        method cannot fully construct the instance, as that requires
        some async operations (and constructors cannot be async), so
        the `boot` method must be called to finalize the process.

        The convoluted initialization API cannot be avoided, so this
        module binds a static helper named `Deck.initialize` to this
        class (at the end of the file) that simplifies things. */

        this.name = name;
        this.pages = pages;
        this.dropCounter = 1;
        this.context = null;
        this.node = null;
        this.u32s = null;
        this.f32s = null;
        this.f64s = null;
    }

    async boot(context, module) {

        /* This method takes an audio context and a reference to the
        Wasm module, and uses them to finish off the initialization
        process (as constructors cannot be async).

        The method returns a promise that resolves to the instance,
        which produces this (convoluted) API:

            const context = new AudioContext();
            const binary = await fetch(wasmModuleURL);
            const module = await binary.arrayBuffer();

            new Deck("A", 3000).boot(context, module).then(onboot);

        A better API is provided by the `Deck.initialize` wrapper. */

        this.context = context;

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

            this.f32s = new Float32Array(event.data.buffer);
            this.u32s = new Uint32Array(event.data.buffer, 1024, 3);
            this.f64s = new Float64Array(event.data.buffer, 1040, 3);

            this.node.connect(this.context.destination);
        };

        return this;
    }

    async load(trackname) {

        /* This method takes a URL for a track. It fetches and decodes
        the given track, then acquires the Drop Lock, stops the deck,
        updates the Length and Offset inboxes, copies the samples to
        memory, before releasing the lock.

        This method is async, and returns a promise that resolves to
        the instance once the track has loaded. This can be used with
        the `await` syntax, but using the `then` method can be useful
        for wrapping the instance-specific operations in a callback:

            DECKA.load("song.mp3").then(deck => deck.play(1));      */

        const track = await fetch(trackname);
        const buffer = await track.arrayBuffer();
        const audio = await this.context.decodeAudioData(buffer);

        this.play(0);
        this.setLength(audio.length);
        this.setOffset(1060 + audio.length * 4);
        this.f32s.set(audio.getChannelData(0), 268);
        this.f32s.set(audio.getChannelData(1), 268 + audio.length);

        return this;
    }

    read() {

        /* This method takes no arguments, and returns the current
        value. */

        return this.f64s[2];
    }

    play(state) {

        /* This method takes an integer that is expected to be `0`
        or `1`, meaning *stop* and *play* respectively. The value
        is written to the play-state inbox (atomically). The res-
        ult is always `undefined`. */

        Atomics.store(this.u32s, 0, state);
    }

    setLength(length) {

        /* This method takes an integer that is expected to be the
        length of the current track (in samples). The argument is
        written to the track length inbox, and read by the Wasm
        module (which expects a float). The result is always
        `undefined`. */

        this.f64s[0] = length;
    }

    setOffset(offset) {

        /* This method takes an integer that is expected to be the
        offset of the right channel data in memory. The integer is
        just written to the offset inbox. The result is always
        `undefined`. */

        this.u32s[2] = offset;
    }

    drop(position) {

        /* This method takes a stylus position, writes it to the
        drop position inbox, then increments the value in the drop
        counter register. An atomic store is used to ensure these
        operations happen in the correct order. The result is
        always `undefined`. */

        this.f64s[1] = position;
        Atomics.store(this.u32s, 1, this.dropCounter++);
    }
}

let wasmModule = undefined;
let audioContext = undefined;

Deck.initialize = async function(
    name, minutes=8, context=audioContext, module=wasmModule) {

    /* This static helper was added just to simplify the initial-
    ization process. It takes four args:

    + `name` String (required) a unique name for the deck
    + `minutes` Number (optional) the buffer size (in minutes)
    + `context` AudioContext (optional) the deck audio context
    + `module` WebAssembly Module (optional) the implementation

    The `minutes` arg defaults to `8`, and `context` defaults to a
    context that is created locally (when required), then reused.
    The `module` is similarly created (from `djjs/deck.wasm`) on
    demand and reused.

    This method is async, returning a promise that resolves to the
    new deck instance:

        const deck = await Deck.initialize("A");                */

    const pages = Math.ceil(minutes * 60 * 44100 * 8 / 2 ** 16);

    if (!context) context = audioContext = new AudioContext();

    if (!module) {

        const binary = await fetch("/djjs/deck.wasm");
        module = wasmModule = await binary.arrayBuffer();
    }

    return await new Deck(name, pages).boot(context, module);
};
