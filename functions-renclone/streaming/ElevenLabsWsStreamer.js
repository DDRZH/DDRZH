const { EventEmitter } = require("node:events");

const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.8,
  use_speaker_boost: false
};

const DEFAULT_GENERATION_CONFIG = {
  chunk_length_schedule: [120, 160, 250, 290]
};

class ElevenLabsWsStreamer extends EventEmitter {
  constructor({ apiKey, voiceId, modelId, createWs, logger, requestContext } = {}) {
    super();
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.modelId = modelId;
    this.logger = logger;
    this.requestContext = requestContext || {};
    this.createWs =
      createWs ||
      ((url) => {
        const WebSocket = require("ws");
        return new WebSocket(url);
      });
    this.socket = null;
  }

  connect() {
    const url = buildStreamUrl(this.voiceId, this.modelId);
    this.#log("debug", "ren_clone_eleven_ws_connecting", {
      modelId: this.modelId,
      hasVoiceId: Boolean(this.voiceId)
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      let opened = false;
      const socket = this.createWs(url);
      this.socket = socket;

      const handleOpen = () => {
        opened = true;
        this.#log("info", "ren_clone_eleven_ws_opened", {
          modelId: this.modelId
        });

        try {
          this.socket.send(
            JSON.stringify({
              text: " ",
              voice_settings: DEFAULT_VOICE_SETTINGS,
              generation_config: DEFAULT_GENERATION_CONFIG,
              xi_api_key: this.apiKey
            })
          );
          settled = true;
          resolve();
        } catch (error) {
          settled = true;
          reject(error);
        }
      };

      const handleMessage = (rawMessage) => {
        let payload;

        try {
          payload = JSON.parse(normalizeMessage(rawMessage));
        } catch (error) {
          emitError(this, createProtocolError("Invalid JSON message received from ElevenLabs.", error));
          return;
        }

        if (payload.audio) {
          this.emit("audio", payload.audio);
        }

        if (payload.isFinal === true) {
          this.#log("debug", "ren_clone_eleven_ws_final");
          this.emit("final", payload.isFinal);
        }

        if (payload.error) {
          this.#log("warn", "ren_clone_eleven_ws_error_payload", {
            errorMessage: payload.error
          });
          emitError(this, createProtocolError(payload.error));
        }
      };

      const handleError = (error) => {
        if (!opened && !settled) {
          this.#log("warn", "ren_clone_eleven_ws_connect_failed", this.#errorMetadata(error));
          settled = true;
          reject(error);
          return;
        }

        this.#log("warn", "ren_clone_eleven_ws_transport_error", this.#errorMetadata(error));
        emitError(this, normalizeError(error, "ElevenLabs WebSocket error."));
      };

      attachSocketListener(socket, "open", handleOpen);
      attachSocketListener(socket, "message", handleMessage);
      attachSocketListener(socket, "error", handleError);
    });
  }

  sendText(text, options = {}) {
    const payload = { text };

    if (options.flush) {
      payload.flush = true;
    }

    this.socket.send(JSON.stringify(payload));
  }

  sendEnd() {
    this.socket.send(JSON.stringify({ text: "" }));
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
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
}

function attachSocketListener(socket, eventName, handler) {
  if (typeof socket.on === "function") {
    socket.on(eventName, handler);
    return;
  }

  socket.addEventListener(eventName, handler);
}

function buildStreamUrl(voiceId, modelId) {
  return `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input?model_id=${encodeURIComponent(modelId)}&output_format=mp3_44100_128`;
}

function emitError(streamer, error) {
  if (streamer.listenerCount("error") > 0) {
    streamer.emit("error", error);
  }
}

function createProtocolError(message, cause) {
  const error = normalizeError(message, "ElevenLabs protocol error.");

  if (cause) {
    error.cause = cause;
  }

  return error;
}

function normalizeError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(
    typeof error === "string" && error.length > 0 ? error : fallbackMessage
  );
}

function normalizeMessage(rawMessage) {
  if (Buffer.isBuffer(rawMessage)) {
    return rawMessage.toString("utf8");
  }

  if (typeof rawMessage === "string") {
    return rawMessage;
  }

  if (rawMessage && typeof rawMessage.data === "string") {
    return rawMessage.data;
  }

  if (rawMessage && Buffer.isBuffer(rawMessage.data)) {
    return rawMessage.data.toString("utf8");
  }

  throw new TypeError("Unsupported WebSocket message payload.");
}

module.exports = {
  ElevenLabsWsStreamer
};
