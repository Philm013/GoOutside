/**
 * BirdNET Live - Audio Processor Worklet
 * Buffers audio frames and sends them to the main thread.
 * Source: https://github.com/birdnet-team/real-time-pwa (MIT License)
 */
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 2048;
        this._buffer = new Float32Array(this.bufferSize);
        this._index = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            for (let i = 0; i < channelData.length; i++) {
                this._buffer[this._index++] = channelData[i];
                if (this._index >= this.bufferSize) {
                    this.port.postMessage(this._buffer);
                    this._index = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
