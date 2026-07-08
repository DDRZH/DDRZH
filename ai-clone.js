const PASSWORD_VALUE = "ddrzh";
const PASSWORD_STORAGE_KEY = "ddrzh-ai-clone-password";
const API_URL = "api/ren-clone";
const API_URL_LIVE = "api/ren-clone-live";

const gateShell = document.querySelector("#gateShell");
const gateForm = document.querySelector("#gateForm");
const gatePasswordInput = document.querySelector("#gatePassword");
const gateError = document.querySelector("#gateError");
const appShell = document.querySelector("#appShell");
const form = document.querySelector("#askForm");
const messageInput = document.querySelector("#message");
const askButton = document.querySelector("#askButton");
const clearButton = document.querySelector("#clearButton");
const conversationEl = document.querySelector("#conversation");
const voiceToggle = document.querySelector("#voiceToggle");
const voiceHint = document.querySelector("#voiceHint");

const conversationHistory = [];
let activeAudioPlayer = null;
let activeTextStream = null;
let config = {
  voiceAvailable: false,
  voiceGloballyEnabled: true
};
const voicePreferenceKey = "virtual-ren-voice-enabled";

gateForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  unlockApp(gatePasswordInput.value.trim());
});

bootstrap();

async function bootstrap() {
  const savedPassword = sessionStorage.getItem(PASSWORD_STORAGE_KEY);
  if (savedPassword === PASSWORD_VALUE) {
    unlockApp(savedPassword);
    return;
  }

  gatePasswordInput?.focus();
}

async function init() {
  try {
    const response = await fetch(API_URL);
    config = await response.json();
    syncVoiceToggle();
  } catch {
    syncVoiceToggle();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  appendMessage("user", "You", message);
  conversationHistory.push({ role: "user", content: message });
  trimHistory();

  messageInput.value = "";
  setLoading(true);

  const pending = appendMessage("assistant", "Ren", "Thinking...", { pending: true });

  try {
    stopActiveStreams();

    const data = await askLive(
      message,
      conversationHistory.slice(0, -1),
      pending,
      getVoiceEnabled(),
      sessionStorage.getItem(PASSWORD_STORAGE_KEY) || ""
    );

    pending.classList.remove("pending");
    pending.querySelector(".audio-status")?.remove();
    if (data.answer) {
      activeTextStream?.flushNow();
    }
    if (data.audioError) {
      appendAudioError(pending, data.audioError);
    }
    conversationHistory.push({ role: "assistant", content: data.answer });
    trimHistory();
  } catch (error) {
    pending.remove();
    appendMessage(
      "assistant",
      "Ren",
      error instanceof Error ? error.message : "Something went wrong.",
      { isError: true }
    );
  } finally {
    setLoading(false);
    messageInput.focus();
  }
});

clearButton.addEventListener("click", () => {
  conversationHistory.length = 0;
  stopActiveStreams();
  conversationEl.querySelectorAll(".message.dynamic").forEach((message) => message.remove());
  messageInput.value = "";
  messageInput.focus();
});

voiceToggle?.addEventListener("change", () => {
  setStoredVoiceEnabled(voiceToggle.checked);
  if (!voiceToggle.checked) {
    stopActiveStreams();
  }
  syncVoiceToggle();
});

function showConversationView({
  gateShell,
  appShell,
  messageInput,
  gatePasswordInput,
  windowObject,
  documentObject
}) {
  if (gateShell) gateShell.hidden = true;
  if (appShell) appShell.hidden = false;
  if (gatePasswordInput) gatePasswordInput.value = "";

  if (windowObject && typeof windowObject.scrollTo === "function") {
    windowObject.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  if (documentObject?.documentElement) {
    documentObject.documentElement.scrollTop = 0;
  }

  if (documentObject?.body) {
    documentObject.body.scrollTop = 0;
  }

  if (messageInput && typeof messageInput.focus === "function") {
    messageInput.focus();
  }
}

function appendMessage(role, label, text, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message dynamic ${
    role === "user" ? "user-preview" : "assistant"
  }${options.pending ? " pending" : ""}`;

  const labelEl = document.createElement("span");
  labelEl.className = "message-label";
  labelEl.textContent = label;

  const textEl = document.createElement("div");
  textEl.className = options.isError ? "answer-text error-text" : "answer-text";
  textEl.textContent = text;

  wrapper.append(labelEl, textEl);

  if (options.audioError) {
    const audioError = document.createElement("p");
    audioError.className = "audio-error";
    audioError.textContent = friendlyAudioError(options.audioError);
    wrapper.append(audioError);
  }

  conversationEl.append(wrapper);
  wrapper.scrollIntoView({ behavior: "smooth", block: "end" });
  return wrapper;
}

function unlockApp(password) {
  if (password !== PASSWORD_VALUE) {
    gateError.hidden = false;
    gatePasswordInput.focus();
    gatePasswordInput.select();
    return;
  }

  gateError.hidden = true;
  sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
  showConversationView({
    gateShell,
    appShell,
    messageInput,
    gatePasswordInput,
    windowObject: window,
    documentObject: document
  });
  init();
}

async function askLive(message, history, pendingEl, voiceEnabled, password) {
  if (voiceEnabled && !activeAudioPlayer && typeof Mp3StreamPlayer === "function") {
    try {
      activeAudioPlayer = new Mp3StreamPlayer();
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `Audio playback failed: ${error.message}`
          : "Audio playback is unavailable in this browser.";
      appendAudioError(pendingEl, message);
    }
  }

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
  let resolved = false;
  const textEl = pendingEl.querySelector(".answer-text");
  const textStream = createTextStreamController(textEl);
  activeTextStream = textStream;

  return new Promise((resolve, reject) => {
    const finish = () => {
      if (resolved) return;
      resolved = true;
      textStream.flushNow();
      if (activeTextStream === textStream) activeTextStream = null;
      resolve({ answer, audioError });
    };

    const fail = (error) => {
      resolved = true;
      textStream.stop();
      if (activeTextStream === textStream) activeTextStream = null;
      reader.cancel().catch(() => {});
      reject(error);
    };

    const read = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          finish();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const rawEvent of events) {
          const parsed = parseServerEvent(rawEvent);
          if (!parsed) continue;

          if (parsed.event === "status") {
            applyStatus(pendingEl, parsed.data);
          } else if (parsed.event === "token") {
            const token = parsed.data.token || "";
            answer += token;
            textStream.push(token);
          } else if (parsed.event === "audio") {
            try {
              if (!activeAudioPlayer) {
                if (typeof Mp3StreamPlayer !== "function") {
                  audioError = "Audio playback is unavailable in this browser.";
                  appendAudioError(pendingEl, audioError);
                  continue;
                }
                activeAudioPlayer = new Mp3StreamPlayer();
              }
              activeAudioPlayer.appendChunk(parsed.data.chunk);
            } catch (error) {
              audioError =
                error instanceof Error && error.message
                  ? `Audio playback failed: ${error.message}`
                  : "Audio playback failed in this browser.";
              appendAudioError(pendingEl, audioError);
              stopActiveAudioPlayback();
            }
          } else if (parsed.event === "audioError") {
            audioError = parsed.data.message || "";
            appendAudioError(pendingEl, audioError);
          } else if (parsed.event === "error") {
            fail(new Error(parsed.data.error || "Request failed."));
            return;
          } else if (parsed.event === "done") {
            answer = parsed.data.answer || answer;
            activeAudioPlayer?.finish();
            reader.cancel().catch(() => {});
            finish();
            return;
          }
        }
      }
    };

    read().catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
  });
}

function createTextStreamController(textEl) {
  let target = "";
  let rendered = "";
  let timer = null;

  const tick = () => {
    timer = null;
    const remaining = target.length - rendered.length;
    if (remaining <= 0) return;

    const chunkSize = rendered.length < 24 ? 4 : 2;
    rendered = target.slice(0, rendered.length + Math.min(chunkSize, remaining));
    if (textEl) textEl.textContent = rendered;

    if (rendered.length < target.length) {
      timer = setTimeout(tick, rendered.length < 24 ? 25 : 40);
    }
  };

  return {
    push(token) {
      target += token;
      if (!timer) tick();
    },
    flushNow() {
      target = target || rendered;
      rendered = target;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (textEl) textEl.textContent = rendered;
    },
    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
  };
}

function parseServerEvent(rawEvent) {
  const eventLine = rawEvent.split("\n").find((line) => line.startsWith("event: "));
  const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));
  if (!eventLine || !dataLine) return null;

  try {
    return {
      event: eventLine.slice("event: ".length),
      data: JSON.parse(dataLine.slice("data: ".length))
    };
  } catch {
    return null;
  }
}

function applyStatus(messageEl, data) {
  const textEl = messageEl.querySelector(".answer-text");
  if (data.message && textEl && data.stage !== "speaking") {
    textEl.textContent = data.message;
  }

  if (data.stage === "speaking") {
    let audioStatus = messageEl.querySelector(".audio-status");
    if (!audioStatus) {
      audioStatus = document.createElement("p");
      audioStatus.className = "audio-status";
      messageEl.append(audioStatus);
    }
    audioStatus.textContent = data.message || "Generating voice...";
  }
}

function appendAudioError(messageEl, message) {
  if (messageEl.querySelector(".audio-error")) return;
  const audioError = document.createElement("p");
  audioError.className = "audio-error";
  audioError.textContent = friendlyAudioError(message);
  messageEl.append(audioError);
}

function trimHistory() {
  while (conversationHistory.length > 10) {
    conversationHistory.shift();
  }
}

function getVoiceEnabled() {
  if (!config.voiceGloballyEnabled) return false;
  if (!voiceToggle) return config.voiceAvailable;
  return voiceToggle.checked;
}

function syncVoiceToggle() {
  if (!voiceToggle || !voiceHint) return;

  const stored = readStoredVoiceEnabled();
  const enabled = config.voiceGloballyEnabled && (stored ?? config.voiceAvailable);
  voiceToggle.checked = enabled;
  voiceToggle.disabled = !config.voiceGloballyEnabled;

  if (!config.voiceGloballyEnabled) {
    voiceHint.textContent = "Disabled by server config";
    return;
  }

  voiceHint.textContent = voiceToggle.checked
    ? "Stream speech as the reply is generated"
    : "Text only. Turn this back on when the voice service is available.";
}

function readStoredVoiceEnabled() {
  const value = localStorage.getItem(voicePreferenceKey);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function setStoredVoiceEnabled(value) {
  localStorage.setItem(voicePreferenceKey, String(Boolean(value)));
}

function setLoading(isLoading) {
  askButton.disabled = isLoading;
  askButton.textContent = isLoading ? "Generating..." : "Send";
}

function stopActiveStreams() {
  stopActiveAudioPlayback();
  if (activeTextStream) {
    activeTextStream.stop();
    activeTextStream = null;
  }
}

function stopActiveAudioPlayback() {
  if (!activeAudioPlayer) return;
  activeAudioPlayer.stop();
  activeAudioPlayer = null;
}

function friendlyAudioError(message) {
  if (message.includes("missing_permissions") || message.includes("401")) {
    return "The text reply was generated, but the voice service rejected the API key. Update the ElevenLabs key with Text to Speech permission, then restart the server.";
  }
  if (message.includes("fetch failed")) {
    return "The text reply was generated, but the server could not connect to the voice service. Check the network and try again.";
  }
  if (message.includes("missing")) {
    return "The text reply was generated, but the voice model does not have an API key or voice ID configured.";
  }
  return `The text reply was generated, but voice generation failed: ${message}`;
}
