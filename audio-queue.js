const AUDIO_SAMPLE_RATE = 24000;
const PROCESSOR_FRAME_SIZE = 4096;
const STARTUP_BUFFER_SECONDS = 0.34;

class AudioQueue {
  constructor() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (typeof AudioContextClass !== "function") {
      throw new Error("Web Audio is unavailable in this browser.");
    }

    this.ctx = new AudioContextClass();
    this.processor = this.ctx.createScriptProcessor(PROCESSOR_FRAME_SIZE, 0, 1);
    this.gainNode = this.ctx.createGain();
    this.chunks = [];
    this.queuedSamples = 0;
    this.currentChunk = null;
    this.currentOffset = 0;
    this.readCursor = 0;
    this.playbackStarted = false;
    this.stopped = false;
    this.startupBufferSamples = Math.round(AUDIO_SAMPLE_RATE * STARTUP_BUFFER_SECONDS);
    this.playbackRate = AUDIO_SAMPLE_RATE / this.ctx.sampleRate;
    this.processor.onaudioprocess = (event) => this.#handleAudioProcess(event);
  }

  enqueue(base64Pcm) {
    if (this.stopped) return;

    const samples = decodeBase64Pcm(base64Pcm);
    if (!samples.length) return;

    this.chunks.push(samples);
    this.queuedSamples += samples.length;
    this.#resumeContext();
    this.#startPlaybackIfReady();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.processor.onaudioprocess = null;

    try {
      this.processor.disconnect();
    } catch {}

    try {
      this.gainNode.disconnect();
    } catch {}

    this.chunks.length = 0;
    this.currentChunk = null;
    this.currentOffset = 0;
    this.readCursor = 0;
    this.queuedSamples = 0;
    this.ctx.close().catch(() => {});
  }

  #resumeContext() {
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  #startPlaybackIfReady() {
    if (this.playbackStarted || this.queuedSamples < this.startupBufferSamples) return;
    this.playbackStarted = true;
    this.processor.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
  }

  #handleAudioProcess(event) {
    const output = event.outputBuffer.getChannelData(0);
    output.fill(0);
    if (this.stopped) return;

    let writeIndex = 0;
    while (writeIndex < output.length) {
      if (!this.currentChunk || this.readCursor >= this.currentChunk.length) {
        this.currentChunk = this.chunks.shift() || null;
        this.currentOffset = 0;
        this.readCursor = 0;
        if (!this.currentChunk) break;
      }

      output[writeIndex] = this.#readSample();
      writeIndex += 1;
    }
  }

  #readSample() {
    const index = Math.floor(this.readCursor);
    const nextIndex = Math.min(index + 1, this.currentChunk.length - 1);
    const fraction = this.readCursor - index;
    const sample =
      this.currentChunk[index] + (this.currentChunk[nextIndex] - this.currentChunk[index]) * fraction;

    const nextCursor = this.readCursor + this.playbackRate;
    const consumed = Math.floor(nextCursor) - Math.floor(this.readCursor);
    if (consumed > 0) {
      this.currentOffset += consumed;
      this.queuedSamples = Math.max(0, this.queuedSamples - consumed);
    }
    this.readCursor = nextCursor;

    return sample;
  }
}

function decodeBase64Pcm(base64Pcm) {
  const binary = atob(base64Pcm);
  const uint8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    uint8[i] = binary.charCodeAt(i);
  }

  const view = new DataView(uint8.buffer);
  const int16 = new Int16Array(uint8.length / 2);
  for (let i = 0; i < int16.length; i += 1) {
    int16[i] = view.getInt16(i * 2, true);
  }

  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) {
    float32[i] = int16[i] / 32768;
  }

  return float32;
}

window.AudioQueue = AudioQueue;
