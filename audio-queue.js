class AudioQueue {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.queue = [];
    this.activeSources = [];
    this.nextStartTime = 0;
  }

  enqueue(base64Pcm) {
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

    const buffer = this.ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    this.queue.push(buffer);
    this.#drain();
  }

  #drain() {
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now;
    }

    while (this.queue.length > 0) {
      const buffer = this.queue.shift();
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.activeSources.push(source);
      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index !== -1) this.activeSources.splice(index, 1);
      };
    }
  }

  stop() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Source is already stopped or not yet started.
      }
    }

    this.activeSources.length = 0;
    this.queue.length = 0;
    this.nextStartTime = 0;
    this.ctx.close().catch(() => {});
  }
}

window.AudioQueue = AudioQueue;
