const test = require("node:test");
const assert = require("node:assert/strict");

const { LiveSession } = require("../streaming/LiveSession");

test("LiveSession relays tokens and audio chunks to SSE", async () => {
  const events = [];
  const infoLogs = [];
  const handlers = new Map();
  const res = {
    write: (data) => events.push(String(data)),
    end: () => events.push("END"),
    on() {}
  };
  const llmStreamer = {
    async *stream() {
      yield "Hello ";
      yield "world";
    }
  };
  const elevenLabs = {
    async connect() {},
    sendText() {},
    sendEnd() {},
    close() {},
    on(event, cb) {
      handlers.set(event, cb);
    }
  };

  const session = new LiveSession({
    res,
    llmStreamer,
    elevenLabs,
    logger: {
      info(message, metadata) {
        infoLogs.push({ message, metadata });
      },
      warn() {},
      error() {},
      debug() {}
    },
    requestContext: { requestId: "req-1" }
  });
  const runPromise = session.run("hello", []);
  await new Promise((resolve) => setTimeout(resolve, 10));
  handlers.get("audio")?.("YWFh");
  handlers.get("final")?.();
  await runPromise;

  assert(events.some((line) => line.includes("event: token")));
  assert(events.some((line) => line.includes("event: audio")));
  assert(events.some((line) => line.includes("event: done")));
  assert(infoLogs.some((entry) => entry.message === "ren_clone_voice_connect_succeeded"));
  assert(
    infoLogs.some(
      (entry) =>
        entry.message === "ren_clone_voice_first_chunk" &&
        entry.metadata?.audioChunkCount === 1
    )
  );
});

test("LiveSession sends done when ElevenLabs is not configured", async () => {
  const events = [];
  const res = {
    write: (data) => events.push(String(data)),
    end: () => events.push("END"),
    on() {}
  };
  const llmStreamer = {
    async *stream() {
      yield "ok";
    }
  };

  const session = new LiveSession({ res, llmStreamer, elevenLabs: null });
  await session.run("hello", []);

  assert(events.some((line) => line.includes("event: done")));
  assert(events.includes("END"));
});

test("LiveSession sends error and ends on LLM stream failure", async () => {
  const events = [];
  const res = {
    write: (data) => events.push(String(data)),
    end: () => events.push("END"),
    on() {}
  };
  const llmStreamer = {
    async *stream() {
      throw new Error("llm fail");
    }
  };

  const session = new LiveSession({ res, llmStreamer, elevenLabs: null });
  await session.run("hello", []);

  assert(events.some((line) => line.includes("event: error")));
  assert(events.includes("END"));
});

test("LiveSession flushes buffer to ElevenLabs at sentence boundaries", async () => {
  const flushed = [];
  const handlers = new Map();
  const res = {
    write() {},
    end() {},
    on() {}
  };
  const llmStreamer = {
    async *stream() {
      yield "Hello world. ";
      yield "Next sentence.";
    }
  };
  const elevenLabs = {
    async connect() {},
    sendText(text, options) {
      flushed.push({ text, options });
    },
    sendEnd() {
      flushed.push({ end: true });
    },
    close() {},
    on(event, cb) {
      handlers.set(event, cb);
    }
  };

  const session = new LiveSession({ res, llmStreamer, elevenLabs });
  const runPromise = session.run("hello", []);
  await new Promise((resolve) => setTimeout(resolve, 10));
  handlers.get("final")?.();
  await runPromise;

  assert(flushed.some(({ text, options }) => text?.includes("Hello world.") && options === undefined));
  assert(flushed.some(({ text }) => text?.includes("Next sentence.")));
  assert.equal(flushed.at(-1)?.end, true);
});

test("LiveSession flushes short clauses at comma boundaries for earlier speech", async () => {
  const flushed = [];
  const handlers = new Map();
  const res = {
    write() {},
    end() {},
    on() {}
  };
  const llmStreamer = {
    async *stream() {
      yield "Hello, ";
      yield "how are you";
    }
  };
  const elevenLabs = {
    async connect() {},
    sendText(text, options) {
      flushed.push({ text, options });
    },
    sendEnd() {
      flushed.push({ end: true });
    },
    close() {},
    on(event, cb) {
      handlers.set(event, cb);
    }
  };

  const session = new LiveSession({ res, llmStreamer, elevenLabs });
  const runPromise = session.run("hello", []);
  await new Promise((resolve) => setTimeout(resolve, 10));
  handlers.get("final")?.();
  await runPromise;

  assert(flushed.some(({ text, options }) => text === "Hello, " && options === undefined));
});

test("LiveSession sends end marker after flushing final buffered text", async () => {
  const flushed = [];
  const handlers = new Map();
  const res = {
    write() {},
    end() {},
    on() {}
  };
  const llmStreamer = {
    async *stream() {
      yield "No punctuation at the end";
    }
  };
  const elevenLabs = {
    async connect() {},
    sendText(text, options) {
      flushed.push({ text, options });
    },
    sendEnd() {
      flushed.push({ end: true });
    },
    close() {},
    on(event, cb) {
      handlers.set(event, cb);
    }
  };

  const session = new LiveSession({ res, llmStreamer, elevenLabs });
  const runPromise = session.run("hello", []);
  await new Promise((resolve) => setTimeout(resolve, 10));
  handlers.get("final")?.();
  await runPromise;

  assert(
    flushed.some(({ text, options }) => text === "No punctuation at the end" && options?.flush === true)
  );
  assert.equal(flushed.at(-1)?.end, true);
});

test("LiveSession marks a voice stream that ends without audio chunks", async () => {
  const events = [];
  const warnLogs = [];
  const handlers = new Map();
  const res = {
    write: (data) => events.push(String(data)),
    end() {},
    on() {}
  };
  const llmStreamer = {
    async *stream() {
      yield "Hello";
    }
  };
  const elevenLabs = {
    async connect() {},
    sendText() {},
    sendEnd() {},
    close() {},
    on(event, cb) {
      handlers.set(event, cb);
    }
  };

  const session = new LiveSession({
    res,
    llmStreamer,
    elevenLabs,
    logger: {
      info() {},
      warn(message, metadata) {
        warnLogs.push({ message, metadata });
      },
      error() {},
      debug() {}
    },
    requestContext: { requestId: "req-no-audio" }
  });

  const runPromise = session.run("hello", []);
  await new Promise((resolve) => setTimeout(resolve, 10));
  handlers.get("final")?.();
  await runPromise;

  assert(events.some((line) => line.includes("event: audioError")));
  assert(
    warnLogs.some(
      (entry) =>
        entry.message === "ren_clone_voice_completed_without_audio" &&
        entry.metadata?.audioChunkCount === 0
    )
  );
});
