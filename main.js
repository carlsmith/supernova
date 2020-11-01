window.api = async function(trackname) {

    const context = new AudioContext();
    const binary = await fetch("deck.wasm");
    const module = await binary.arrayBuffer();

    const track = await fetch(trackname);
    const buffer = await track.arrayBuffer();
    const audio = await context.decodeAudioData(buffer);

    const dataLength = audio.length;
    const dataOffset = 1024 + dataLength * 4;

    await context.audioWorklet.addModule("deck.js");

    const node = new AudioWorkletNode(context, "deck", {
        outputChannelCount: [2],
        processorOptions: {module, dataLength, dataOffset},
    });

    node.port.onmessage = event => {

        const memory = new Float32Array(event.data.buffer);

        memory.set(audio.getChannelData(0), 256);
        memory.set(audio.getChannelData(1), 256 + audio.length);

        node.port.postMessage({command: "ready", data: null});
    };

    node.connect(context.destination);
};
