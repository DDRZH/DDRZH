const MP3_MIME_TYPE = "audio/mpeg";

class Mp3StreamPlayer {
  constructor({ windowObject = window, documentObject = document } = {}) {
    const MediaSourceClass = resolveStreamingMediaSource(windowObject);
    const URLObject = windowObject.URL;

    if (!MediaSourceClass || !URLObject?.createObjectURL) {
      throw new Error(buildUnsupportedPlaybackMessage(windowObject));
    }

    if (
      typeof MediaSourceClass.isTypeSupported === "function" &&
      !MediaSourceClass.isTypeSupported(MP3_MIME_TYPE)
    ) {
      throw new Error("This browser cannot play the streaming MP3 format.");
    }

    this.URLObject = URLObject;
    this.mediaSource = new MediaSourceClass();
    this.audio = documentObject.createElement("audio");
    this.audio.autoplay = true;
    this.audio.playsInline = true;
    this.audio.preload = "auto";
    this.audio.disableRemotePlayback = true;
    this.audio.src = this.URLObject.createObjectURL(this.mediaSource);

    this.sourceBuffer = null;
    this.queue = [];
    this.closed = false;
    this.shouldEndStream = false;

    this.mediaSource.addEventListener("sourceopen", () => {
      if (this.closed || this.sourceBuffer) return;

      this.sourceBuffer = this.mediaSource.addSourceBuffer(MP3_MIME_TYPE);
      this.sourceBuffer.mode = "sequence";
      this.sourceBuffer.addEventListener("updateend", () => {
        this.#flush();
      });
      this.#flush();
    });

    this.#primePlayback();
  }

  appendChunk(base64Chunk) {
    if (this.closed || !base64Chunk) return;
    this.queue.push(decodeBase64Chunk(base64Chunk));
    this.#flush();
  }

  finish() {
    this.shouldEndStream = true;
    this.#flush();
  }

  stop() {
    if (this.closed) return;
    this.closed = true;

    try {
      this.audio.pause();
    } catch {}

    if (this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {}
    }

    this.URLObject.revokeObjectURL(this.audio.src);
    this.audio.src = "";
    this.queue.length = 0;
  }

  #primePlayback() {
    try {
      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } catch {}
  }

  #flush() {
    if (this.closed || !this.sourceBuffer || this.sourceBuffer.updating) return;

    if (this.queue.length > 0) {
      this.sourceBuffer.appendBuffer(this.queue.shift());
      return;
    }

    if (this.shouldEndStream && this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {}
    }
  }
}

function resolveStreamingMediaSource(windowObject) {
  return (
    windowObject.ManagedMediaSource ||
    windowObject.MediaSource ||
    windowObject.WebKitMediaSource ||
    null
  );
}

function buildUnsupportedPlaybackMessage(windowObject) {
  return [
    "This browser does not support streaming audio playback.",
    `MediaSource=${Boolean(windowObject.MediaSource)}`,
    `ManagedMediaSource=${Boolean(windowObject.ManagedMediaSource)}`,
    `WebKitMediaSource=${Boolean(windowObject.WebKitMediaSource)}`,
    `createObjectURL=${Boolean(windowObject.URL?.createObjectURL)}`
  ].join(" ");
}

function decodeBase64Chunk(base64Chunk) {
  const binary = atob(base64Chunk);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

window.Mp3StreamPlayer = Mp3StreamPlayer;
