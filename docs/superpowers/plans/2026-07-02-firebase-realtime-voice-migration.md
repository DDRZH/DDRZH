# Firebase Realtime Voice Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace file-based Ren clone audio playback with a new realtime Firebase endpoint that streams LLM text tokens and ElevenLabs PCM audio chunks to the browser.

**Architecture:** Keep the existing serial `/api/ren-clone` function intact as a rollback path. Add a new `/api/ren-clone-live` function in `functions-renclone/` built from small streaming modules: shared runtime/config helpers, an LLM token streamer, an ElevenLabs WebSocket streamer, and a `LiveSession` SSE coordinator. Update the browser client to consume `token` and `audio` SSE events and play audio with the Web Audio API.

**Tech Stack:** Firebase Hosting + Cloud Functions v2, Node 22 CommonJS, native `fetch`, `ws`, Server-Sent Events, Web Audio API, `node:test`.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `functions-renclone/package.json` | Add runtime/test dependencies and test script for streaming modules. |
| `functions-renclone/index.js` | Export both `renclone` and new `renCloneLive` HTTP functions. |
| `functions-renclone/ren-clone-handler.js` | Keep serial endpoint, but stop owning every helper directly. |
| `functions-renclone/ren-clone-runtime.js` | Shared config, prompt loading, origin checks, history sanitization, provider helpers. |
| `functions-renclone/ren-clone-live-handler.js` | New live request handler using SSE and streaming modules. |
| `functions-renclone/streaming/ElevenLabsWsStreamer.js` | ElevenLabs WebSocket adapter for base64 PCM chunks. |
| `functions-renclone/streaming/LiveSession.js` | SSE orchestration, buffering, lifecycle, and provider fallback. |
| `functions-renclone/streaming/LlmStreamer.js` | Token streaming from OpenAI Responses or Chat Completions compatible providers. |
| `functions-renclone/tests/ElevenLabsWsStreamer.test.js` | Transport tests for WebSocket adapter. |
| `functions-renclone/tests/LiveSession.test.js` | SSE event and phrase-flush behavior tests. |
| `functions-renclone/tests/ren-clone-live-handler.test.js` | Live endpoint behavior with text-only and voice-enabled flows. |
| `ai-clone-case.html` | Load the new browser audio queue helper before `ai-clone.js`. |
| `audio-queue.js` | Decode base64 PCM chunks and schedule playback in `AudioContext`. |
| `ai-clone.js` | Switch voice-enabled requests to `/api/ren-clone-live` and consume `token/audio/audioError/done` events. |
| `firebase.json` | Add `/api/ren-clone-live` rewrite. |

## Task 1: Extract Shared Runtime Helpers

**Files:**
- Create: `functions-renclone/ren-clone-runtime.js`
- Modify: `functions-renclone/ren-clone-handler.js`
- Test: `functions-renclone/tests/ren-clone-live-handler.test.js`

- [ ] **Step 1: Write the failing integration-oriented test for shared live-handler prerequisites**

```js
// functions-renclone/tests/ren-clone-live-handler.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRenCloneLiveHandler } = require("../ren-clone-live-handler");

function createResponseRecorder() {
  const writes = [];
  return {
    writes,
    headers: {},
    statusCode: null,
    ended: false,
    set(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      this.ended = true;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    write(chunk) {
      writes.push(String(chunk));
    },
    end() {
      this.ended = true;
    }
  };
}

test("live handler rejects wrong password before streaming", async () => {
  const handler = createRenCloneLiveHandler({
    llmApiKey: () => "key",
    voiceEnabled: () => "true"
  });
  const request = {
    method: "POST",
    body: { password: "wrong", message: "hello", history: [] },
    get(name) {
      return name.toLowerCase() === "origin" ? "https://ddrzh-31cb8.web.app" : undefined;
    },
    ip: "127.0.0.1"
  };
  const response = createResponseRecorder();

  await handler(request, response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.payload, { ok: false, message: "Password is incorrect." });
});
```

- [ ] **Step 2: Run the test to verify it fails because the live handler and shared runtime do not exist**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/ren-clone-live-handler.test.js
```

Expected: FAIL with `Cannot find module '../ren-clone-live-handler'`.

- [ ] **Step 3: Create `functions-renclone/ren-clone-runtime.js` and move shared logic out of the serial handler**

```js
// functions-renclone/ren-clone-runtime.js
require("dotenv").config();

const path = require("node:path");
const { readFile } = require("node:fs/promises");

const renCloneDir = path.join(__dirname, "ren-clone");
const skillReferenceDir = path.join(renCloneDir, "references");

const REN_CLONE_PASSWORD = "ddrzh";
const REN_CLONE_MAX_FIELD_LENGTH = 5000;
const REN_CLONE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const REN_CLONE_MAX_REQUESTS_PER_WINDOW = 12;
const REN_CLONE_ALLOWED_ORIGINS = new Set([
  "https://ddrzh.com",
  "https://www.ddrzh.com",
  "https://ddrzh-31cb8.web.app",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://124.220.32.120"
]);

let renCloneInstructionsCache = "";
const renCloneRequestCounts = new Map();

function normalizeText(value, maxLength = REN_CLONE_MAX_FIELD_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body !== "string") return null;
  try {
    return JSON.parse(request.body);
  } catch {
    return null;
  }
}

function setCors(response, origin) {
  if (origin && REN_CLONE_ALLOWED_ORIGINS.has(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
  }
  response.set("Vary", "Origin");
  response.set("Access-Control-Allow-Headers", "Content-Type");
  response.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

async function readSkillInstructions() {
  if (renCloneInstructionsCache) return renCloneInstructionsCache;
  const files = [
    ["Entry Skill", path.join(renCloneDir, "SKILL.md")],
    ["Persona", path.join(skillReferenceDir, "persona.md")],
    ["Memory", path.join(skillReferenceDir, "memory.md")],
    ["Boundaries", path.join(skillReferenceDir, "boundaries.md")],
    ["Corrections", path.join(skillReferenceDir, "corrections.md")]
  ];
  const sections = await Promise.all(
    files.map(async ([label, filePath]) => {
      const content = await readFile(filePath, "utf8");
      return `## ${label}\n\n${content.trim()}`;
    })
  );
  renCloneInstructionsCache = `${sections.join("\n\n---\n\n")}

## Runtime Instruction

Answer in first person as Ren. Output English only, even when the user writes in Chinese.`;
  return renCloneInstructionsCache;
}

module.exports = {
  REN_CLONE_ALLOWED_ORIGINS,
  REN_CLONE_MAX_REQUESTS_PER_WINDOW,
  REN_CLONE_PASSWORD,
  REN_CLONE_RATE_LIMIT_WINDOW_MS,
  normalizeText,
  parseBody,
  readSkillInstructions,
  setCors
};
```

- [ ] **Step 4: Update `functions-renclone/ren-clone-handler.js` to import shared helpers instead of owning them inline**

```js
const {
  normalizeText,
  parseBody,
  readSkillInstructions,
  setCors
} = require("./ren-clone-runtime");
```

Also keep all existing serial endpoint behavior unchanged, including:

- `audioUrl` generation
- password semantics
- origin allowlist
- history sanitization
- rate limiting

- [ ] **Step 5: Run the test again to verify shared prerequisites are now available**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/ren-clone-live-handler.test.js
```

Expected: FAIL later in the live-handler flow rather than at module resolution.

## Task 2: Add ElevenLabs WebSocket Streaming Module

**Files:**
- Modify: `functions-renclone/package.json`
- Create: `functions-renclone/streaming/ElevenLabsWsStreamer.js`
- Create: `functions-renclone/tests/ElevenLabsWsStreamer.test.js`

- [ ] **Step 1: Write the failing transport test**

```js
// functions-renclone/tests/ElevenLabsWsStreamer.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { ElevenLabsWsStreamer } = require("../streaming/ElevenLabsWsStreamer");

class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.emit("close");
  }
}

test("sends text chunks and emits audio", async () => {
  const ws = new MockWebSocket();
  const streamer = new ElevenLabsWsStreamer({
    apiKey: "key",
    voiceId: "voice1",
    modelId: "eleven_test",
    createWs: () => ws
  });

  const audioChunks = [];
  streamer.on("audio", (chunk) => audioChunks.push(chunk));

  const connected = streamer.connect();
  ws.emit("open");
  await connected;

  streamer.sendText("Hello ");
  streamer.sendText("world");
  streamer.sendEnd();

  ws.emit("message", Buffer.from(JSON.stringify({ audio: "YWFh" })));
  ws.emit("message", Buffer.from(JSON.stringify({ isFinal: true })));

  assert.deepEqual(audioChunks, ["YWFh"]);
  assert.equal(ws.sent[1].text, "Hello ");
  assert.equal(ws.sent[2].text, "world");
  assert.equal(ws.sent[3].text, "");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/ElevenLabsWsStreamer.test.js
```

Expected: FAIL with `Cannot find module '../streaming/ElevenLabsWsStreamer'`.

- [ ] **Step 3: Add the runtime dependency and test script**

```json
{
  "name": "ddrzh-functions-renclone",
  "private": true,
  "engines": {
    "node": "22"
  },
  "main": "index.js",
  "scripts": {
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "dotenv": "^16.4.7",
    "firebase-functions": "^6.4.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 4: Implement `functions-renclone/streaming/ElevenLabsWsStreamer.js`**

```js
const { EventEmitter } = require("node:events");
const WebSocket = require("ws");

class ElevenLabsWsStreamer extends EventEmitter {
  constructor({ apiKey, voiceId, modelId, createWs }) {
    super();
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.modelId = modelId;
    this.createWs = createWs;
    this.ws = null;
    this.voiceSettings = {
      stability: 0.5,
      similarity_boost: 0.8,
      use_speaker_boost: false
    };
    this.generationConfig = {
      chunk_length_schedule: [120, 160, 250, 290]
    };
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = this.createWs
        ? this.createWs()
        : new WebSocket(
            `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}/stream-input?model_id=${encodeURIComponent(this.modelId)}&output_format=pcm_24000`,
            { headers: { "xi-api-key": this.apiKey } }
          );

      this.ws.once("open", () => {
        this.ws.send(JSON.stringify({
          text: " ",
          voice_settings: this.voiceSettings,
          generation_config: this.generationConfig,
          xi_api_key: this.apiKey
        }));
        resolve();
      });
      this.ws.once("error", reject);
      this.ws.on("error", (error) => this.emit("error", error));
      this.ws.on("message", (data) => this.#handleMessage(data));
    });
  }

  sendText(text, options = {}) {
    this.ws.send(JSON.stringify({
      text,
      ...(options.flush ? { flush: true } : {})
    }));
  }

  sendEnd() {
    this.sendText("");
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }

  #handleMessage(data) {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (payload.audio) this.emit("audio", payload.audio);
    if (payload.isFinal) this.emit("final");
    if (payload.error) this.emit("error", new Error(payload.error));
  }
}

module.exports = { ElevenLabsWsStreamer };
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/ElevenLabsWsStreamer.test.js
```

Expected: PASS.

## Task 3: Add `LiveSession` and `LlmStreamer`

**Files:**
- Create: `functions-renclone/streaming/LiveSession.js`
- Create: `functions-renclone/streaming/LlmStreamer.js`
- Create: `functions-renclone/tests/LiveSession.test.js`

- [ ] **Step 1: Write the failing `LiveSession` test**

```js
// functions-renclone/tests/LiveSession.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { LiveSession } = require("../streaming/LiveSession");

test("relays tokens and audio chunks to SSE", async () => {
  const events = [];
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

  const session = new LiveSession({ res, llmStreamer, elevenLabs });
  const runPromise = session.run("hello", []);
  await new Promise((resolve) => setTimeout(resolve, 10));
  handlers.get("audio")?.("YWFh");
  handlers.get("final")?.();
  await runPromise;

  assert(events.some((line) => line.includes("event: token")));
  assert(events.some((line) => line.includes("event: audio")));
  assert(events.some((line) => line.includes("event: done")));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/LiveSession.test.js
```

Expected: FAIL with `Cannot find module '../streaming/LiveSession'`.

- [ ] **Step 3: Implement `functions-renclone/streaming/LiveSession.js`**

```js
class LiveSession {
  constructor({ res, llmStreamer, elevenLabs }) {
    this.res = res;
    this.llmStreamer = llmStreamer;
    this.elevenLabs = elevenLabs;
    this.answer = "";
    this.buffer = "";
    this.closed = false;
    this.res.on?.("close", () => this.#close());
  }

  async run(message, history) {
    this.#sendEvent("status", { stage: "thinking" });

    if (this.elevenLabs) {
      this.elevenLabs.on("audio", (chunk) => {
        if (!this.closed) this.#sendEvent("audio", { chunk });
      });
      this.elevenLabs.on("final", () => {
        this.#sendEvent("done", { answer: this.answer });
        this.#close();
      });
      this.elevenLabs.on("error", (error) => {
        this.#sendEvent("audioError", { message: this.#friendlyAudioError(error) });
      });
      try {
        await this.elevenLabs.connect();
      } catch (error) {
        this.#sendEvent("audioError", { message: this.#friendlyAudioError(error) });
      }
    }

    try {
      for await (const token of this.llmStreamer.stream(message, history)) {
        if (this.closed) break;
        this.answer += token;
        this.#sendEvent("token", { token });
        this.#appendText(token);
      }
    } catch (error) {
      this.#sendEvent("error", { error: error.message });
      this.#close();
      return;
    }

    this.#sendEvent("textDone", { answer: this.answer });
    this.#flushBuffer(true);
    if (this.elevenLabs) {
      this.elevenLabs.sendEnd();
    } else {
      this.#sendEvent("done", { answer: this.answer });
      this.#close();
    }
  }

  #appendText(text) {
    this.buffer += text;
    const trimmed = this.buffer.trimEnd();
    if (!trimmed) return;
    const lastChar = trimmed.slice(-1);
    if (/[.!?]/.test(lastChar)) return this.#flushBuffer(false);
    if (/,/.test(lastChar) && this.buffer.length >= 6) return this.#flushBuffer(false);
    if (this.buffer.length >= 24 && /[\s;:]/.test(lastChar)) return this.#flushBuffer(false);
    if (this.buffer.length >= 90) return this.#flushBuffer(false);
  }

  #flushBuffer(isFinal) {
    if (!this.buffer) return;
    const text = isFinal ? this.buffer : this.buffer.trimEnd();
    this.buffer = "";
    try {
      this.elevenLabs?.sendText?.(text + (isFinal ? "" : " "), isFinal ? { flush: true } : undefined);
    } catch {}
  }

  #sendEvent(event, data) {
    if (this.closed) return;
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  #close() {
    if (this.closed) return;
    this.closed = true;
    this.elevenLabs?.close?.();
    this.res.end();
  }

  #friendlyAudioError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("missing_permissions") || message.includes("401")) {
      return "The voice service rejected the API key.";
    }
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      return "The server could not connect to the voice service.";
    }
    if (message.includes("missing")) {
      return "Voice credentials are not configured.";
    }
    return `Voice generation failed: ${message}`;
  }
}

module.exports = { LiveSession };
```

- [ ] **Step 4: Implement `functions-renclone/streaming/LlmStreamer.js`**

```js
const { readSkillInstructions } = require("../ren-clone-runtime");

class LlmStreamer {
  constructor({ apiKey, baseUrl, model, mode }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.mode = mode;
  }

  async *stream(message, history) {
    if (this.mode === "chat-completions") {
      yield* this.#streamChatCompletions(message, history);
      return;
    }
    yield* this.#streamResponses(message, history);
  }

  async *#streamResponses(message, history) {
    const instructions = await readSkillInstructions();
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        instructions,
        input: [...history, { role: "user", content: message }],
        stream: true
      })
    });
    if (!response.ok || !response.body) {
      throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";
      for (const line of parts) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        const event = JSON.parse(payload);
        const delta = event.delta || event.output?.[0]?.content?.[0]?.text;
        if (delta) yield delta;
      }
    }
  }
}

module.exports = { LlmStreamer };
```

- [ ] **Step 5: Run the focused test suite**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/LiveSession.test.js tests/ElevenLabsWsStreamer.test.js
```

Expected: PASS.

## Task 4: Add Live Firebase Handler and Export

**Files:**
- Create: `functions-renclone/ren-clone-live-handler.js`
- Modify: `functions-renclone/index.js`
- Modify: `firebase.json`
- Test: `functions-renclone/tests/ren-clone-live-handler.test.js`

- [ ] **Step 1: Extend the live-handler test to cover text-only success**

```js
test("live handler streams text-only mode when voice is disabled", async () => {
  const handler = createRenCloneLiveHandler({
    llmApiKey: () => "key",
    llmModel: () => "gpt-4.1-mini",
    llmBaseUrl: () => "https://api.openai.com/v1",
    llmApiMode: () => "responses",
    voiceEnabled: () => "false"
  }, {
    createLlmStreamer: () => ({
      async *stream() {
        yield "Hello";
      }
    })
  });

  const request = {
    method: "POST",
    body: { password: "ddrzh", message: "hello", history: [], voiceEnabled: false },
    get(name) {
      return name.toLowerCase() === "origin" ? "https://ddrzh-31cb8.web.app" : undefined;
    },
    ip: "127.0.0.1"
  };
  const response = createResponseRecorder();

  await handler(request, response);

  assert.match(response.writes.join(""), /event: token/);
  assert.match(response.writes.join(""), /event: done/);
});
```

- [ ] **Step 2: Run the test to verify it fails because the live handler is missing**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/ren-clone-live-handler.test.js
```

Expected: FAIL at module or missing export level.

- [ ] **Step 3: Implement `functions-renclone/ren-clone-live-handler.js`**

```js
const {
  REN_CLONE_ALLOWED_ORIGINS,
  REN_CLONE_PASSWORD,
  normalizeText,
  parseBody,
  setCors
} = require("./ren-clone-runtime");
const { LlmStreamer } = require("./streaming/LlmStreamer");
const { LiveSession } = require("./streaming/LiveSession");
const { ElevenLabsWsStreamer } = require("./streaming/ElevenLabsWsStreamer");
const { getRuntimeConfig, sanitizeHistory, shouldUseVoice } = require("./ren-clone-handler");

function createRenCloneLiveHandler(configOverrides = {}, deps = {}) {
  const createLlmStreamer = deps.createLlmStreamer || ((config) => new LlmStreamer({
    apiKey: config.llmApiKey,
    baseUrl: config.llmBaseUrl,
    model: config.llmModel,
    mode: config.llmApiMode
  }));
  const createElevenLabs = deps.createElevenLabs || ((config) => {
    if (!config.elevenApiKey || !config.elevenVoiceId) return null;
    return new ElevenLabsWsStreamer({
      apiKey: config.elevenApiKey,
      voiceId: config.elevenVoiceId,
      modelId: config.elevenModelId
    });
  });

  return async function handleRenCloneLiveRequest(request, response) {
    const config = getRuntimeConfig(configOverrides);
    const origin = request.get("origin");
    setCors(response, origin);

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (origin && !REN_CLONE_ALLOWED_ORIGINS.has(origin)) {
      response.status(403).json({ ok: false, message: "Origin not allowed." });
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({ ok: false, message: "Method not allowed." });
      return;
    }

    const body = parseBody(request);
    if (!body) {
      response.status(400).json({ ok: false, message: "Invalid request." });
      return;
    }

    const password = normalizeText(body.password, 64);
    if (password !== REN_CLONE_PASSWORD) {
      response.status(401).json({ ok: false, message: "Password is incorrect." });
      return;
    }

    const message = normalizeText(body.message, 3000);
    const history = sanitizeHistory(body.history);
    const wantsVoice = shouldUseVoice(config.voiceGloballyEnabled, body.voiceEnabled);

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    });

    const session = new LiveSession({
      res: response,
      llmStreamer: createLlmStreamer(config),
      elevenLabs: wantsVoice ? createElevenLabs(config) : null
    });
    await session.run(message, history);
  };
}

module.exports = { createRenCloneLiveHandler };
```

- [ ] **Step 4: Export the new function and rewrite**

```js
// functions-renclone/index.js
const { createRenCloneLiveHandler } = require("./ren-clone-live-handler");

exports.renCloneLive = onRequest(
  {
    region: "us-central1",
    maxInstances: 4,
    secrets: [
      OPENAI_API_KEY,
      OPENAI_MODEL,
      OPENAI_BASE_URL,
      OPENAI_API_MODE,
      ELEVENLABS_API_KEY,
      ELEVENLABS_VOICE_ID,
      ELEVENLABS_MODEL_ID,
      VOICE_ENABLED
    ]
  },
  createRenCloneLiveHandler({
    llmApiKey: () => OPENAI_API_KEY.value(),
    llmModel: () => OPENAI_MODEL.value(),
    llmBaseUrl: () => OPENAI_BASE_URL.value(),
    llmApiMode: () => OPENAI_API_MODE.value(),
    elevenApiKey: () => ELEVENLABS_API_KEY.value(),
    elevenVoiceId: () => ELEVENLABS_VOICE_ID.value(),
    elevenModelId: () => ELEVENLABS_MODEL_ID.value(),
    voiceEnabled: () => VOICE_ENABLED.value()
  })
);
```

```json
// firebase.json rewrite addition
{
  "source": "/api/ren-clone-live",
  "function": "renCloneLive"
}
```

- [ ] **Step 5: Run the live-handler test**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/ren-clone-live-handler.test.js
```

Expected: PASS.

## Task 5: Update the Browser for Token + Audio Streaming

**Files:**
- Create: `audio-queue.js`
- Modify: `ai-clone-case.html`
- Modify: `ai-clone.js`

- [ ] **Step 1: Add the browser audio queue helper**

```js
// audio-queue.js
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
    for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i);

    const view = new DataView(uint8.buffer);
    const int16 = new Int16Array(uint8.length / 2);
    for (let i = 0; i < int16.length; i++) {
      int16[i] = view.getInt16(i * 2, true);
    }

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = this.ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    this.queue.push(buffer);
    this.#drain();
  }

  #drain() {
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    if (this.nextStartTime < now) this.nextStartTime = now;
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
      } catch {}
    }
    this.activeSources.length = 0;
    this.queue.length = 0;
    this.nextStartTime = 0;
    this.ctx.close().catch(() => {});
  }
}

window.AudioQueue = AudioQueue;
```

- [ ] **Step 2: Load the helper before `ai-clone.js`**

```html
<script src="audio-queue.js"></script>
<script src="ai-clone.js"></script>
```

- [ ] **Step 3: Replace final-URL voice flow in `ai-clone.js` with a live-stream consumer**

```js
let activeAudioQueue = null;
let activeTextStream = null;

async function askLive(message, history, pendingEl, voiceEnabled, password) {
  const response = await fetch(API_URL_LIVE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, voiceEnabled, password })
  });
  if (!response.ok || !response.body) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(errorPayload?.message || "Request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let audioError = "";
  const textEl = pendingEl.querySelector(".answer-text");
  const textStream = createTextStreamController(textEl);
  activeTextStream = textStream;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const parsed = parseServerEvent(rawEvent);
      if (!parsed) continue;
      if (parsed.event === "token") {
        const token = parsed.data.token || "";
        answer += token;
        textStream.push(token);
      } else if (parsed.event === "audio") {
        if (!activeAudioQueue) activeAudioQueue = new AudioQueue();
        activeAudioQueue.enqueue(parsed.data.chunk);
      } else if (parsed.event === "audioError") {
        audioError = parsed.data.message || "";
        appendAudioError(pendingEl, audioError);
      } else if (parsed.event === "status") {
        applyStatus(pendingEl, parsed.data);
      } else if (parsed.event === "done") {
        textStream.flushNow();
        return { answer: parsed.data.answer || answer, audioError };
      } else if (parsed.event === "error") {
        throw new Error(parsed.data.error || "Request failed.");
      }
    }
  }

  return { answer, audioError };
}
```

Also update submit flow to:

- stop previous `activeAudioQueue`
- prefer `askLive(...)` when the page uses the new endpoint
- no longer call `attachAudio()` on the live path

- [ ] **Step 4: Manual local verification**

Run:

```bash
cd /Users/dd/projects/DDRZH
npm run start
```

Then verify in the browser:

1. Submit a message with voice enabled.
2. Observe the answer text appear progressively.
3. Observe audio begin before the full answer is rendered.
4. Submit another message before playback completes and confirm the previous audio stops.

Expected: realtime text + realtime audio, with no `audio/*.mp3` request in the Network panel.

## Task 6: Full Verification and Firebase Rollout

**Files:**
- Modify: none
- Test: all created test files plus manual Firebase verification

- [ ] **Step 1: Run the function test suite**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
node --test tests/*.test.js
```

Expected: PASS.

- [ ] **Step 2: Install function dependencies if not already present**

Run:

```bash
cd /Users/dd/projects/DDRZH/functions-renclone
npm install
```

Expected: lockfile updated with `ws` dependency and install succeeds.

- [ ] **Step 3: Verify local serial fallback still works**

Run:

```bash
cd /Users/dd/projects/DDRZH
npm run start
```

Then manually hit the old route from the current page or a direct request and confirm:

- password validation still works
- text replies still work
- old behavior remains available for rollback

- [ ] **Step 4: Deploy and verify on Firebase**

Run:

```bash
cd /Users/dd/projects/DDRZH
npx --yes firebase-tools deploy --only functions,hosting --project ddrzh-31cb8
```

Expected: Hosting rewrite for `/api/ren-clone-live` and new `renCloneLive` function deploy successfully.

- [ ] **Step 5: Production verification checklist**

Verify on the deployed site:

1. Open the AI clone case page and unlock it.
2. Submit a voice-enabled message.
3. Confirm DevTools Network shows a long-lived request to `/api/ren-clone-live`.
4. Confirm SSE frames include `token`, `audio`, and `done`.
5. Confirm playback starts without any MP3 URL fetch.
6. Temporarily break ElevenLabs credentials and confirm text still completes with an audio error message.

## Self-Review

- **Spec coverage:** The plan covers backend streaming modules, live function export, Firebase rewrite, browser streaming playback, compatibility fallback, and validation on both local and Firebase environments.
- **Placeholder scan:** No `TODO`, `TBD`, or “handle appropriately” placeholders remain in the task list.
- **Type consistency:** Event names are consistent across tasks: `status`, `token`, `audio`, `audioError`, `textDone`, `done`, `error`. The new function name and route are consistently `renCloneLive` and `/api/ren-clone-live`.

**Plan complete and saved to `docs/superpowers/plans/2026-07-02-firebase-realtime-voice-migration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
