const test = require("node:test");
const assert = require("node:assert/strict");

const { LlmStreamer } = require("../streaming/LlmStreamer");

test("LlmStreamer yields tokens from chat completions SSE", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      body: createSseBody([
        'data: {"choices":[{"delta":{"content":"Hello "}}]}',
        'data: {"choices":[{"delta":{"content":"world"}}]}',
        "data: [DONE]"
      ])
    };
  };

  try {
    const streamer = new LlmStreamer({
      apiKey: "key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      mode: "chat-completions",
      instructions: "Be concise."
    });

    const tokens = [];
    for await (const token of streamer.stream("hello", [])) {
      tokens.push(token);
    }

    assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
    assert.deepEqual(tokens, ["Hello ", "world"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("LlmStreamer yields tokens from responses SSE", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      body: createSseBody([
        'data: {"output":[{"content":[{"text":"Hi "}]}]}',
        'data: {"output":[{"content":[{"text":"there"}]}]}',
        "data: [DONE]"
      ])
    };
  };

  try {
    const streamer = new LlmStreamer({
      apiKey: "key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      mode: "responses",
      instructions: "Be concise."
    });

    const tokens = [];
    for await (const token of streamer.stream("hello", [])) {
      tokens.push(token);
    }

    assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
    assert.deepEqual(tokens, ["Hi ", "there"]);
  } finally {
    global.fetch = originalFetch;
  }
});

function createSseBody(lines) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`${lines.join("\n\n")}\n\n`));
      controller.close();
    }
  });
}
