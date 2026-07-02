class LiveSession {
  constructor({ res, llmStreamer, elevenLabs }) {
    this.res = res;
    this.llmStreamer = llmStreamer;
    this.elevenLabs = elevenLabs;
    this.buffer = "";
    this.answer = "";
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
        if (!this.closed) {
          this.#sendEvent("audioError", { message: this.#friendlyAudioError(error) });
        }
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
      this.#sendEvent("error", { error: error instanceof Error ? error.message : String(error) });
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

  close() {
    this.#close();
  }

  #appendText(text) {
    this.buffer += text;
    if (this.#shouldFlush()) {
      this.#flushBuffer(false);
    }
  }

  #shouldFlush() {
    const trimmed = this.buffer.trimEnd();
    if (!trimmed) return false;

    const lastChar = trimmed.slice(-1);
    if (/[.!?]/.test(lastChar)) return true;
    if (/,/.test(lastChar) && this.buffer.length >= 6) return true;
    if (this.buffer.length >= 24 && /[\s;:]/.test(lastChar)) return true;
    return this.buffer.length >= 90;
  }

  #flushBuffer(isFinal) {
    if (!this.buffer.length) return false;

    const text = isFinal ? this.buffer : this.buffer.trimEnd();
    this.buffer = "";

    try {
      const payload = text + (isFinal ? "" : " ");
      this.elevenLabs?.sendText?.(payload, isFinal ? { flush: true } : undefined);
    } catch {
      // Ignore send errors after the voice stream has been closed.
    }

    return true;
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
