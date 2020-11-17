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
            It assigns the required views of memory to the instance,
            and connects the node to the speakers.

            Note: See the Wasm module's docstring for more details on
            how the memory is laid out. */

            this.f32s = new Float32Array(event.data.buffer);
            this.u32s = new Uint32Array(event.data.buffer, 1024, 128);
            this.f64s = new Float64Array(event.data.buffer, 1536, 64);

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
        `undefined`. */

        const track = await fetch(trackname);
        const buffer = await track.arrayBuffer();
        const audio = await this.context.decodeAudioData(buffer);

        const attempt = (self) => {

            if (Atomics.compareExchange(self.u32s, 4, 0, 1)) return setTimeout(attempt, 0, self);

            self.play(0);
            self.drop(0);
            self.setLength(audio.length);
            self.setOffset(2048 + audio.length * 4);
            self.f32s.set(audio.getChannelData(0), 512);
            self.f32s.set(audio.getChannelData(1), 512 + audio.length);
            self.u32s[4] = 0; // release the sync lock
        };

        attempt(this);
    }

    read() {

        /* This method takes no arguments, and returns the current
        value of the Cannonical Stylus Position. */

        return this.f64s[2];
    }

    play(state) {

        /* This method takes an integer that is expected to be `0`
        or `1`, meaning *stop* and *play* respectively. The value
        is written to the play-state inbox (which is implicitly
        atomic). The result is always `undefined`. */

        this.u32s[0] = state;
    }

    setLength(length) {

        /* This method takes an integer that is expected to be the
        length of the current track (in samples). The argument is
        written to the track length inbox, and read by the Wasm
        module (which expects a float). The result is always
        `undefined`.

        This method is not threadsafe, unless called by a function
        that has acquired the Sync Lock. */

        this.f64s[0] = length;
    }

    setOffset(offset) {

        /* This method takes an integer that is expected to be the
        offset of the right channel data in memory. The integer is
        just written to the offset inbox. The result is always
        `undefined`.

        This method is not threadsafe, unless called by a function
        that has acquired the Sync Lock. */

        this.u32s[2] = offset;
    }

    drop(position) {

        /* This method takes a stylus position, and sends a drop
        message to the audio thread (using the Drop Lock). The
        result is always `undefined`. */

        while (Atomics.compareExchange(this.u32s, 3, 0, 1));

        this.f64s[1] = position;
        this.u32s[1] = this.dropCounter++;
        this.u32s[3] = 0; // this will not tear
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
