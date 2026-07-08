const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { ElevenLabsWsStreamer } = require("../streaming/ElevenLabsWsStreamer");

class FakeWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.sent = [];
    this.closed = false;
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.closed = true;
  }
}

test("ElevenLabsWsStreamer sends handshake, text payloads, and emits transport events", async () => {
  const sockets = [];
  const streamer = new ElevenLabsWsStreamer({
    apiKey: "test-api-key",
    voiceId: "voice/123",
    modelId: "eleven flash/v2.5",
    createWs(url) {
      const socket = new FakeWebSocket(url);
      sockets.push(socket);
      process.nextTick(() => socket.emit("open"));
      return socket;
    }
  });

  const audioChunks = [];
  const finalEvents = [];
  const errors = [];

  streamer.on("audio", (chunk) => {
    audioChunks.push(chunk);
  });

  streamer.on("final", (value) => {
    finalEvents.push(value);
  });

  streamer.on("error", (error) => {
    errors.push(error);
  });

  await streamer.connect();

  assert.equal(sockets.length, 1);
  assert.equal(
    sockets[0].url,
    "wss://api.elevenlabs.io/v1/text-to-speech/voice%2F123/stream-input?model_id=eleven%20flash%2Fv2.5&output_format=mp3_44100_128"
  );
  assert.deepEqual(sockets[0].sent[0], {
    text: " ",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
      use_speaker_boost: false
    },
    generation_config: {
      chunk_length_schedule: [120, 160, 250, 290]
    },
    xi_api_key: "test-api-key"
  });

  streamer.sendText("hello there");
  streamer.sendText("flush this", { flush: true });
  streamer.sendEnd();

  assert.deepEqual(sockets[0].sent[1], {
    text: "hello there"
  });
  assert.deepEqual(sockets[0].sent[2], {
    text: "flush this",
    flush: true
  });
  assert.deepEqual(sockets[0].sent[3], {
    text: ""
  });

  sockets[0].emit("message", JSON.stringify({ audio: "chunk-one" }));
  sockets[0].emit("message", Buffer.from(JSON.stringify({ audio: "chunk-two" })));
  sockets[0].emit("message", JSON.stringify({ isFinal: false }));
  sockets[0].emit("message", JSON.stringify({ isFinal: true }));
  sockets[0].emit("message", JSON.stringify({ error: "stream failed" }));
  sockets[0].emit("message", "not-json");

  assert.deepEqual(audioChunks, ["chunk-one", "chunk-two"]);
  assert.deepEqual(finalEvents, [true]);
  assert.equal(errors.length, 2);
  assert.equal(errors[0] instanceof Error, true);
  assert.equal(errors[0].message, "stream failed");
  assert.equal(errors[1] instanceof Error, true);
  assert.match(errors[1].message, /Invalid JSON message/i);

  streamer.close();
  assert.equal(sockets[0].closed, true);
});

test("ElevenLabsWsStreamer rejects connect on socket error before open without requiring error listeners", async () => {
  const streamer = new ElevenLabsWsStreamer({
    apiKey: "test-api-key",
    voiceId: "voice-123",
    modelId: "eleven_flash_v2_5",
    createWs() {
      const socket = new FakeWebSocket("ws://unused");
      process.nextTick(() => socket.emit("error", new Error("connect failed")));
      return socket;
    }
  });

  await assert.rejects(
    streamer.connect(),
    /connect failed/
  );
});
