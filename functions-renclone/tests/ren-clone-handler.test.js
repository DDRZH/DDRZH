const test = require("node:test");
const assert = require("node:assert/strict");

const { createRenCloneHandler } = require("../ren-clone-handler");

function createRequest(options = {}) {
  return {
    method: options.method || "GET",
    body: options.body,
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

test("createRenCloneHandler GET config does not expose model or prompt details", async () => {
  const handler = createRenCloneHandler({
    llmApiKey: () => "key",
    llmModel: () => "gpt-4.1-mini"
  });
  const request = createRequest({ method: "GET" });
  const response = createResponseRecorder();

  await handler(request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.jsonBody, {
    voiceAvailable: false,
    voiceConfigured: false,
    voiceGloballyEnabled: true
  });
  assert.equal("llmMode" in response.jsonBody, false);
  assert.equal("llmModel" in response.jsonBody, false);
});
