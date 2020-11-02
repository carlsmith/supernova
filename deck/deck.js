class Deck extends AudioWorkletProcessor {

    constructor(args) {

        /* This class contains the boilerplate for the audio processor
        that implements the deck.

        The `args` hash must use `processorOptions` (as defined by the
        WebAudio API) to pass the `dataLength` and `dataOffset` values
        (that are imported by the Wasm module), and the Wasm module as
        the `processorOptions.module` attribute.

        This constructor creates an empty memory of the required size,
        as a shared memory, then passes it (as a shared array buffer)
        to the main thread, which fills it with audio data. This is
        convoluted, but that much data stalls whichever thread it
        is sent to (but not the thread it is sent from).

        Given that the main thread must work with this thread to init-
        ialize everything, this directory exports a `Deck` class from
        the `main.js` file that wraps this class, and provides a user
        friendly API.                                               */

        super();

        const { dataOffset, dataLength, module } = args.processorOptions;
        const pages = Math.ceil((1024 + dataLength * 8) / 64000);
        const options = {initial: pages, maximum: pages, shared: true};
        const memory = new WebAssembly.Memory(options);
        const imports = {audio: {memory, dataOffset, dataLength}};

        this.memory = new Float32Array(memory.buffer);
        this.interpolate = null;
        this.news = null;
        this.drop = null;
        this.hold = true;

        WebAssembly.instantiate(module, imports).then(wasm => {

            /* This callback just stashes the functions exported by
            the Wasm module as instance attributes. */

            this.interpolate = wasm.instance.exports.interpolate;
            this.news = wasm.instance.exports.news;
            this.drop = wasm.instance.exports.drop;
        });

        this.port.postMessage(["init", memory]);

        this.port.onmessage = event => {

            /* This callback handles all incoming messages from the
            main thread. Messages are always packaged as a hash with
            a `command` name string and a `data` value. */

            const command = event.data[0];

            if (command === "drop") this.drop(event.data[1]);
            else if (command === "stop") this.hold = true;
            else if (command === "play") this.hold = false;
            else if (command === "news") this.port.postMessage(["news", this.news()]);
        };
    }

    process(inputs, outputs, params) {

        /* This is the method that the WebAudio API calls whenever it
        needs another block of 128 samples (for each channel). If the
        instance is holding, the method outputs silence.

        If the instance is active, the `interpolate` method is called
        to run the code inside the Wasm module, that writes the block
        of samples to the lowest 1KB of memory.

        Note: The module maintains the stylus position internally. */

        if (this.hold) return true;

        this.interpolate(params.pitch[0]);

        outputs[0][0].set(this.memory.slice(0, 128));
        outputs[0][1].set(this.memory.slice(128, 256));

        return true;
    }

    static get parameterDescriptors() {

        return [{
            name: "pitch",
            defaultValue: 1,
            automationRate: "k-rate",
        }];
    }
}

registerProcessor("deck", Deck);
