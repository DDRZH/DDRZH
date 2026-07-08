const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAudioQueue(AudioContextClass) {
  const script = fs.readFileSync(path.join(__dirname, "audio-queue.js"), "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    window: {
      AudioContext: AudioContextClass,
      webkitAudioContext: AudioContextClass
    },
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    Float32Array,
    Int16Array,
    Uint8Array,
    DataView
  };

  vm.runInNewContext(`${script}\nmodule.exports = window.AudioQueue;`, sandbox, {
    filename: "audio-queue.js"
  });

  return sandbox.module.exports;
}

function pcmChunk(sampleCount, value = 0.25) {
  const int16 = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
  }
  return Buffer.from(int16.buffer).toString("base64");
}

class FakeProcessorNode {
  constructor(bufferSize) {
    this.bufferSize = bufferSize;
    this.connectedTo = null;
    this.disconnected = false;
    this.onaudioprocess = null;
  }

  connect(target) {
    this.connectedTo = target;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeGainNode {
  constructor() {
    this.connectedTo = null;
    this.disconnected = false;
  }

  connect(target) {
    this.connectedTo = target;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeAudioContext {
  constructor(sampleRate = 24000) {
    this.state = "suspended";
    this.resumeCount = 0;
    this.closeCount = 0;
    this.destination = { kind: "destination" };
    this.processor = null;
    this.gainNode = null;
    this.sampleRate = sampleRate;
  }

  resume() {
    this.resumeCount += 1;
    this.state = "running";
    return Promise.resolve();
  }

  close() {
    this.closeCount += 1;
    return Promise.resolve();
  }

  createScriptProcessor(bufferSize) {
    this.processor = new FakeProcessorNode(bufferSize);
    return this.processor;
  }

  createGain() {
    this.gainNode = new FakeGainNode();
    return this.gainNode;
  }
}

function processFrame(ctx, frameSize) {
  const output = new Float32Array(frameSize);
  ctx.processor.onaudioprocess({
    outputBuffer: {
      getChannelData() {
        return output;
      }
    }
  });
  return output;
}

test("AudioQueue waits for startup buffer before connecting playback", async () => {
  const AudioQueue = loadAudioQueue(FakeAudioContext);
  const queue = new AudioQueue();

  queue.enqueue(pcmChunk(2048, 0.4));

  await Promise.resolve();

  assert.equal(queue.ctx.resumeCount, 1);
  assert.equal(queue.ctx.processor.connectedTo, null);
  queue.stop();
});

test("AudioQueue streams queued PCM samples through a single processor node", async () => {
  const AudioQueue = loadAudioQueue(FakeAudioContext);
  const queue = new AudioQueue();

  queue.enqueue(pcmChunk(4096, 0.25));
  queue.enqueue(pcmChunk(4096, 0.5));

  await Promise.resolve();

  assert.equal(queue.ctx.processor.connectedTo, queue.ctx.gainNode);
  assert.equal(queue.ctx.gainNode.connectedTo, queue.ctx.destination);

  const frameOne = processFrame(queue.ctx, 4096);
  const frameTwo = processFrame(queue.ctx, 4096);

  assert(frameOne[0] > 0.2 && frameOne[0] < 0.3);
  assert(frameTwo[0] > 0.45 && frameTwo[0] < 0.55);
  queue.stop();
});

test("AudioQueue stop disconnects nodes and closes the audio context", async () => {
  const AudioQueue = loadAudioQueue(FakeAudioContext);
  const queue = new AudioQueue();

  queue.enqueue(pcmChunk(8192, 0.3));
  await Promise.resolve();
  queue.stop();

  assert.equal(queue.ctx.processor.disconnected, true);
  assert.equal(queue.ctx.gainNode.disconnected, true);
  assert.equal(queue.ctx.closeCount, 1);
});

test("AudioQueue resamples 24k PCM to the audio context sample rate", async () => {
  class Fake48kAudioContext extends FakeAudioContext {
    constructor() {
      super(48000);
    }
  }

  const AudioQueue = loadAudioQueue(Fake48kAudioContext);
  const queue = new AudioQueue();
  const ramp = new Int16Array([0, 8192, 16384, 24576]);
  queue.enqueue(Buffer.from(ramp.buffer).toString("base64"));
  queue.enqueue(pcmChunk(8192, 0.5));

  await Promise.resolve();

  const frame = processFrame(queue.ctx, 8);
  assert(Math.abs(frame[0] - 0) < 0.01);
  assert(frame[1] > 0.1 && frame[1] < 0.15);
  assert(frame[2] > 0.24 && frame[2] < 0.26);
  assert(frame[3] > 0.36 && frame[3] < 0.40);
  assert(frame[4] > 0.49 && frame[4] < 0.51);
  queue.stop();
});
