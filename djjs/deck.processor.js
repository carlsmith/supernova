class Deck extends AudioWorkletProcessor {

    constructor(args) {

        /* This constructor expects the caller to provide a hash that
        contain a Wasm module (named `module`) and a memory size, as a
        number of 64KB pages (named `pages`). That hash must be passed
        by the caller using the `processorOptions` feature of the API.

        The method initializes the Wasm module with a shared memory of
        the given size, and shares the memory with the main thread.

        The `interpolate` function is assigned to the instance by the
        callback (as Wasm module instantiation is async). We can not
        prevent the `process` method calling `interpolate` before
        it is available, so the `process` method is swapped for
        a placeholder till `interpolate` is ready. */

        super(args);

        const { module, pages } = args.processorOptions;
        const options = {initial: pages, maximum: pages, shared: true};
        const memory = new WebAssembly.Memory(options);

        this.processor = this.process;
        this.process = (inputs, outputs, params) => true;
        this.memory = new Float32Array(memory.buffer);
        this.port.postMessage(memory);
        this.interpolate = null;

        WebAssembly.instantiate(module, {audio: {memory}}).then(wasm => {
            this.interpolate = wasm.instance.exports.interpolate;
            this.process = this.processor;
        });
    }

    process(inputs, outputs, params) {

        /* This is a generic method of the WebAudio API. It calls
        the `interpolate` function, passing the current value of the
        `pitch` param. If the function returns a truthy result, this
        method will copy the results from the memory to the output
        arrays. In either case, `true` is always returned. */

        if (this.interpolate(params.pitch[0])) {

            const [L, R] = outputs[0];

            L.set(this.memory.slice(0, 128));
            R.set(this.memory.slice(128, 256));

        } return true;
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
