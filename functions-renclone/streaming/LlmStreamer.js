const { readSkillInstructions } = require("../ren-clone-runtime");

class LlmStreamer {
  constructor({ apiKey, baseUrl, model, mode, instructions }) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || "").replace(/\/+$/, "");
    this.model = model;
    this.mode = mode;
    this.instructions = instructions || "";
  }

  async *stream(message, history) {
    const instructions = this.instructions || (await readSkillInstructions());
    if (this.mode === "chat-completions") {
      yield* this.#streamChatCompletions(message, history, instructions);
      return;
    }
    yield* this.#streamResponses(message, history, instructions);
  }

  async *#streamChatCompletions(message, history, instructions) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: instructions },
          ...history,
          { role: "user", content: message }
        ],
        stream: true
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Chat completions request failed: ${response.status} ${text}`);
    }

    yield* this.#parseSseTokens(response.body);
  }

  async *#streamResponses(message, history, instructions) {
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

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Responses request failed: ${response.status} ${text}`);
    }

    yield* this.#parseSseTokens(response.body);
  }

  async *#parseSseTokens(body) {
    if (!body) {
      throw new Error("Response body is null");
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const token = extractTokenFromSseBlock(block);
          if (token) yield token;
        }
      }

      if (buffer) {
        const token = extractTokenFromSseBlock(buffer);
        if (token) yield token;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

function extractTokenFromSseBlock(block) {
  const lines = block
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6).trim())
    .filter(Boolean);

  for (const data of lines) {
    if (data === "[DONE]") continue;

    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }

    const token =
      parsed.choices?.[0]?.delta?.content ??
      parsed.output_text?.delta ??
      parsed.delta ??
      parsed.output?.[0]?.content?.[0]?.text ??
      parsed.response?.output_text?.delta;

    if (typeof token === "string" && token.length > 0) {
      return token;
    }
  }

  return "";
}

module.exports = { LlmStreamer };
