class LiveSession {
  constructor({ res, llmStreamer, elevenLabs, logger, requestContext } = {}) {
    this.res = res;
    this.llmStreamer = llmStreamer;
    this.elevenLabs = elevenLabs;
    this.logger = logger;
    this.requestContext = requestContext || {};
    this.buffer = "";
    this.answer = "";
    this.closed = false;
    this.startedAt = Date.now();
    this.tokenCount = 0;
    this.audioChunkCount = 0;
    this.voiceConnected = false;
    this.closeReason = "completed";
    this.summaryLogged = false;
    this.res.on?.("close", () => {
      if (this.closed) return;
      this.closeReason = "client_disconnected";
      this.#log("warn", "ren_clone_live_client_disconnected", {
        answerLength: this.answer.length,
        audioChunkCount: this.audioChunkCount
      });
      this.#close(false);
    });
  }

  async run(message, history) {
    this.#log("info", "ren_clone_live_stream_started", {
      historyLength: history.length,
      wantsVoice: Boolean(this.elevenLabs)
    });
    this.#sendEvent("status", { stage: "thinking" });

    if (this.elevenLabs) {
      this.elevenLabs.on("audio", (chunk) => {
        if (this.closed) return;
        this.audioChunkCount += 1;
        if (this.audioChunkCount === 1) {
          this.#log("info", "ren_clone_voice_first_chunk", {
            audioChunkCount: this.audioChunkCount,
            firstAudioMs: Date.now() - this.startedAt
          });
        }
        this.#sendEvent("audio", { chunk });
      });
      this.elevenLabs.on("final", () => {
        if (this.audioChunkCount === 0 && !this.closed) {
          this.#log("warn", "ren_clone_voice_completed_without_audio", {
            audioChunkCount: this.audioChunkCount
          });
          this.#sendEvent("audioError", { message: "Voice stream completed without audio." });
        }
        this.closeReason = "voice_final";
        this.#sendEvent("done", { answer: this.answer });
        this.#close();
      });
      this.elevenLabs.on("error", (error) => {
        if (!this.closed) {
          this.#log("warn", "ren_clone_voice_error", this.#errorMetadata(error));
          this.#sendEvent("audioError", { message: this.#friendlyAudioError(error) });
        }
      });

      try {
        await this.elevenLabs.connect();
        this.voiceConnected = true;
        this.#log("info", "ren_clone_voice_connect_succeeded");
      } catch (error) {
        this.#log("warn", "ren_clone_voice_connect_failed", this.#errorMetadata(error));
        this.#sendEvent("audioError", { message: this.#friendlyAudioError(error) });
      }
    }

    try {
      for await (const token of this.llmStreamer.stream(message, history)) {
        if (this.closed) break;
        this.answer += token;
        this.tokenCount += 1;
        this.#sendEvent("token", { token });
        this.#appendText(token);
      }
    } catch (error) {
      this.closeReason = "llm_error";
      this.#log("error", "ren_clone_text_stream_failed", this.#errorMetadata(error));
      this.#sendEvent("error", { error: error instanceof Error ? error.message : String(error) });
      this.#close();
      return;
    }

    this.#log("info", "ren_clone_text_stream_completed", {
      tokenCount: this.tokenCount,
      answerLength: this.answer.length
    });
    this.#sendEvent("textDone", { answer: this.answer });
    this.#flushBuffer(true);

    if (this.elevenLabs) {
      this.elevenLabs.sendEnd();
    } else {
      this.closeReason = "text_only_done";
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
    } catch (error) {
      this.#log("warn", "ren_clone_voice_send_failed", this.#errorMetadata(error));
    }

    return true;
  }

  #sendEvent(event, data) {
    if (this.closed) return;
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  #close(shouldEndResponse = true) {
    if (this.closed) return;
    this.closed = true;
    this.#logSummary();
    this.elevenLabs?.close?.();
    if (shouldEndResponse) {
      this.res.end();
    }
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

  #log(level, message, metadata = {}) {
    const method = this.logger?.[level];
    if (typeof method !== "function") return;
    method(message, {
      ...this.requestContext,
      ...metadata
    });
  }

  #errorMetadata(error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      errorMessage: err.message,
      errorName: err.name
    };
  }

  #logSummary() {
    if (this.summaryLogged) return;
    this.summaryLogged = true;
    this.#log("info", "ren_clone_live_stream_finished", {
      closeReason: this.closeReason,
      durationMs: Date.now() - this.startedAt,
      tokenCount: this.tokenCount,
      answerLength: this.answer.length,
      voiceConnected: this.voiceConnected,
      audioChunkCount: this.audioChunkCount
    });
  }
}

module.exports = { LiveSession };
