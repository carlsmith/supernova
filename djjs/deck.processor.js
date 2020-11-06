class Deck extends AudioWorkletProcessor {

    constructor(args) {

        super(args);

        const { module, pages } = args.processorOptions;
        const options = {initial: pages, maximum: pages, shared: true};
        const memory = new WebAssembly.Memory(options);

        this.memory = new Float32Array(memory.buffer);
        this.interpolate = null;

        this.port.postMessage(memory);

        WebAssembly.instantiate(module, {audio: {memory}}).then(wasm => {
            this.interpolate = wasm.instance.exports.interpolate;
        });
    }

    process(inputs, outputs, params) {

        const [L, R] = outputs[0];

        this.interpolate(params.pitch[0]);

        L.set(this.memory.slice(0, 128));
        R.set(this.memory.slice(128, 256));

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
