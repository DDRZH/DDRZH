const test = require("node:test");
const assert = require("node:assert/strict");

const { createRenCloneLiveHandler } = require("../ren-clone-live-handler");

function createRequest(body, options = {}) {
  return {
    method: options.method || "POST",
    body,
    ip: options.ip || "127.0.0.1",
    get(name) {
      const headers = {
        origin: options.origin || "http://127.0.0.1:3000"
      };
      return headers[String(name).toLowerCase()] || undefined;
    }
  };
}

function createResponseRecorder() {
  return {
    statusCode: 200,
    jsonBody: undefined,
    headers: new Map(),
    ended: false,
    set(name, value) {
      this.headers.set(name, value);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      this.ended = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      this.writeHeadHeaders = headers;
      return this;
    },
    write(chunk) {
      this.chunks = this.chunks || [];
      this.chunks.push(chunk);
      return true;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

test("createRenCloneLiveHandler returns 401 when password is incorrect", async () => {
  const handler = createRenCloneLiveHandler();
  const request = createRequest({
    password: "wrong-password",
    message: "hello"
  });
  const response = createResponseRecorder();

  await handler(request, response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.jsonBody, {
    ok: false,
    message: "Password is incorrect."
  });
});

test("createRenCloneLiveHandler rate limits repeated wrong passwords before rejecting password again", async () => {
  const handler = createRenCloneLiveHandler();
  const ip = "127.0.0.2";
  let finalResponse;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const request = createRequest(
      {
        password: "wrong-password",
        message: "hello"
      },
      { ip }
    );
    const response = createResponseRecorder();
    await handler(request, response);
    assert.equal(response.statusCode, 401);
  }

  const finalRequest = createRequest(
    {
      password: "wrong-password",
      message: "hello"
    },
    { ip }
  );
  finalResponse = createResponseRecorder();
  await handler(finalRequest, finalResponse);

  assert.equal(finalResponse.statusCode, 429);
  assert.deepEqual(finalResponse.jsonBody, {
    ok: false,
    message: "Too many requests. Please try again later."
  });
});

test("createRenCloneLiveHandler streams text-only mode when voice is disabled", async () => {
  const infoLogs = [];
  const handler = createRenCloneLiveHandler(
    {
      llmApiKey: () => "key",
      llmModel: () => "gpt-4.1-mini",
      llmBaseUrl: () => "https://api.openai.com/v1",
      llmApiMode: () => "responses",
      voiceEnabled: () => "false"
    },
    {
      logger: {
        info(message, metadata) {
          infoLogs.push({ message, metadata });
        },
        warn() {},
        error() {},
        debug() {}
      },
      createLlmStreamer: () => ({
        async *stream() {
          yield "Hello";
        }
      })
    }
  );

  const request = createRequest({
    password: "ddrzh",
    message: "hello",
    history: [],
    voiceEnabled: false
  });
  const response = createResponseRecorder();

  await handler(request, response);

  const output = (response.chunks || []).join("");
  assert.match(output, /event: token/);
  assert.match(output, /event: done/);
  assert(infoLogs.some((entry) => entry.message === "ren_clone_live_request_started"));
  assert(
    infoLogs.some(
      (entry) =>
        entry.message === "ren_clone_live_session_created" &&
        entry.metadata?.wantsVoice === false
    )
  );
});

test("createRenCloneLiveHandler allows Firebase Hosting preview channel origins", async () => {
  const handler = createRenCloneLiveHandler(
    {
      llmApiKey: () => "key",
      llmModel: () => "gpt-4.1-mini",
      llmBaseUrl: () => "https://api.openai.com/v1",
      llmApiMode: () => "responses",
      voiceEnabled: () => "false"
    },
    {
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {}
      },
      createLlmStreamer: () => ({
        async *stream() {
          yield "Hello";
        }
      })
    }
  );

  const request = createRequest(
    {
      password: "ddrzh",
      message: "hello",
      history: [],
      voiceEnabled: false
    },
    {
      origin: "https://ddrzh-31cb8--preview-voice.web.app"
    }
  );
  const response = createResponseRecorder();

  await handler(request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://ddrzh-31cb8--preview-voice.web.app");
  assert.match((response.chunks || []).join(""), /event: done/);
});
