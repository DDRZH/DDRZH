const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadMp3StreamPlayer({
  MediaSourceClass,
  ManagedMediaSourceClass,
  WebKitMediaSourceClass,
  AudioClass,
  URLObject
}) {
  const script = fs.readFileSync(path.join(__dirname, "audio-stream-player.js"), "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    window: {
      MediaSource: MediaSourceClass,
      ManagedMediaSource: ManagedMediaSourceClass,
      WebKitMediaSource: WebKitMediaSourceClass,
      URL: URLObject
    },
    document: {
      createElement(tagName) {
        assert.equal(tagName, "audio");
        return new AudioClass();
      }
    },
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    Uint8Array
  };

  vm.runInNewContext(`${script}\nmodule.exports = window.Mp3StreamPlayer;`, sandbox, {
    filename: "audio-stream-player.js"
  });

  return sandbox.module.exports;
}

class FakeSourceBuffer {
  constructor() {
    this.mode = "segments";
    this.updating = false;
    this.appended = [];
    this.listeners = new Map();
  }

  addEventListener(eventName, handler) {
    this.listeners.set(eventName, handler);
  }

  appendBuffer(chunk) {
    this.updating = true;
    this.appended.push(Array.from(chunk));
    this.updating = false;
    this.listeners.get("updateend")?.();
  }
}

class FakeMediaSource {
  constructor() {
    this.readyState = "closed";
    this.listeners = new Map();
    this.sourceBuffer = null;
    FakeMediaSource.instances.push(this);
  }

  addEventListener(eventName, handler) {
    this.listeners.set(eventName, handler);
  }

  addSourceBuffer(mimeType) {
    this.mimeType = mimeType;
    this.sourceBuffer = new FakeSourceBuffer();
    return this.sourceBuffer;
  }

  endOfStream() {
    this.readyState = "ended";
  }

  open() {
    this.readyState = "open";
    this.listeners.get("sourceopen")?.();
  }
}

FakeMediaSource.instances = [];
FakeMediaSource.isTypeSupported = (mimeType) => mimeType === "audio/mpeg";

class FakeAudioElement {
  constructor() {
    this.autoplay = false;
    this.preload = "";
    this.playsInline = false;
    this.src = "";
    this.playCalls = 0;
    this.pauseCalls = 0;
  }

  play() {
    this.playCalls += 1;
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
  }
}

const FakeURL = {
  created: [],
  revoked: [],
  createObjectURL(value) {
    this.created.push(value);
    return "blob:stream";
  },
  revokeObjectURL(value) {
    this.revoked.push(value);
  }
};

test("Mp3StreamPlayer appends queued chunks once the media source opens", async () => {
  const Mp3StreamPlayer = loadMp3StreamPlayer({
    MediaSourceClass: FakeMediaSource,
    ManagedMediaSourceClass: undefined,
    WebKitMediaSourceClass: undefined,
    AudioClass: FakeAudioElement,
    URLObject: FakeURL
  });

  const player = new Mp3StreamPlayer();
  player.appendChunk(Buffer.from([1, 2, 3]).toString("base64"));

  assert.equal(FakeMediaSource.instances.length, 1);
  assert.equal(player.audio.src, "blob:stream");
  assert.equal(player.audio.playCalls, 1);

  FakeMediaSource.instances[0].open();
  await Promise.resolve();

  assert.equal(FakeMediaSource.instances[0].mimeType, "audio/mpeg");
  assert.deepEqual(FakeMediaSource.instances[0].sourceBuffer.appended, [[1, 2, 3]]);
  assert.equal(player.audio.playCalls, 1);
});

test("Mp3StreamPlayer appends subsequent chunks in order", async () => {
  const Mp3StreamPlayer = loadMp3StreamPlayer({
    MediaSourceClass: FakeMediaSource,
    ManagedMediaSourceClass: undefined,
    WebKitMediaSourceClass: undefined,
    AudioClass: FakeAudioElement,
    URLObject: FakeURL
  });

  const player = new Mp3StreamPlayer();
  const mediaSource = FakeMediaSource.instances.at(-1);
  mediaSource.open();

  player.appendChunk(Buffer.from([4, 5]).toString("base64"));
  player.appendChunk(Buffer.from([6, 7]).toString("base64"));

  await Promise.resolve();

  assert.deepEqual(mediaSource.sourceBuffer.appended, [[4, 5], [6, 7]]);
});

test("Mp3StreamPlayer stop pauses playback, closes the media source, and revokes the object URL", () => {
  const Mp3StreamPlayer = loadMp3StreamPlayer({
    MediaSourceClass: FakeMediaSource,
    ManagedMediaSourceClass: undefined,
    WebKitMediaSourceClass: undefined,
    AudioClass: FakeAudioElement,
    URLObject: FakeURL
  });

  const player = new Mp3StreamPlayer();
  const mediaSource = FakeMediaSource.instances.at(-1);
  mediaSource.open();

  player.stop();

  assert.equal(player.audio.pauseCalls, 1);
  assert.equal(mediaSource.readyState, "ended");
  assert.deepEqual(FakeURL.revoked, ["blob:stream"]);
});

test("Mp3StreamPlayer supports Safari ManagedMediaSource when MediaSource is unavailable", async () => {
  class FakeManagedMediaSource extends FakeMediaSource {}
  FakeManagedMediaSource.isTypeSupported = (mimeType) => mimeType === "audio/mpeg";

  const Mp3StreamPlayer = loadMp3StreamPlayer({
    MediaSourceClass: undefined,
    ManagedMediaSourceClass: FakeManagedMediaSource,
    WebKitMediaSourceClass: undefined,
    AudioClass: FakeAudioElement,
    URLObject: FakeURL
  });

  const player = new Mp3StreamPlayer();
  player.appendChunk(Buffer.from([8, 9]).toString("base64"));

  const mediaSource = player.mediaSource;
  mediaSource.open();
  await Promise.resolve();

  assert.equal(player.audio.disableRemotePlayback, true);
  assert.deepEqual(mediaSource.sourceBuffer.appended, [[8, 9]]);
});

test("Mp3StreamPlayer supports Safari WebKitMediaSource when standard interfaces are unavailable", async () => {
  class FakeWebKitMediaSource extends FakeMediaSource {}
  FakeWebKitMediaSource.isTypeSupported = (mimeType) => mimeType === "audio/mpeg";

  const Mp3StreamPlayer = loadMp3StreamPlayer({
    MediaSourceClass: undefined,
    ManagedMediaSourceClass: undefined,
    WebKitMediaSourceClass: FakeWebKitMediaSource,
    AudioClass: FakeAudioElement,
    URLObject: FakeURL
  });

  const player = new Mp3StreamPlayer();
  player.appendChunk(Buffer.from([10, 11]).toString("base64"));

  const mediaSource = player.mediaSource;
  mediaSource.open();
  await Promise.resolve();

  assert.deepEqual(mediaSource.sourceBuffer.appended, [[10, 11]]);
});

test("Mp3StreamPlayer reports missing browser capabilities in the error message", () => {
  const Mp3StreamPlayer = loadMp3StreamPlayer({
    MediaSourceClass: undefined,
    ManagedMediaSourceClass: undefined,
    WebKitMediaSourceClass: undefined,
    AudioClass: FakeAudioElement,
    URLObject: {}
  });

  assert.throws(
    () => new Mp3StreamPlayer(),
    /MediaSource=false ManagedMediaSource=false WebKitMediaSource=false createObjectURL=false/
  );
});
