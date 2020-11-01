class Deck extends AudioWorkletProcessor {

    constructor(args) {

        super();

        const { dataOffset, dataLength, module } = args.processorOptions;
        const pages = Math.ceil((1024 + dataLength * 8) / 64000);
        const options = {initial: pages, maximum: pages, shared: true};
        const memory = new WebAssembly.Memory(options);

        const imports = {audio: {memory, dataOffset, dataLength}};
        this.memory = new Float32Array(memory.buffer);
        this.instantiate = null;
        this.drop = null;
        this.hold = true;

        WebAssembly.instantiate(module, imports).then(wasm => {
            this.interpolate = wasm.instance.exports.interpolate;
            this.drop = wasm.instance.exports.drop;
        });

        this.port.postMessage(memory);

        this.port.onmessage = event => {
            const { command, data } = event.data;
            if (command === "drop") this.drop(data);
            else if (command === "ready") this.hold = false;
        };
    }

    process(inputs, outputs, params) {

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
