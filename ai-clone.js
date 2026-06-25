const PASSWORD_VALUE = "ddrzh";
const PASSWORD_STORAGE_KEY = "ddrzh-ai-clone-password";
const API_URL = "/api/ren-clone";
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
let activeAudio = null;
let config = {
  voiceAvailable: false,
  voiceGloballyEnabled: true,
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

  const pending = appendMessage("assistant", "Virtual Ren", "Thinking...", { pending: true });

  try {
    const data = await askWithProgress(
      message,
      conversationHistory.slice(0, -1),
      pending,
      getVoiceEnabled(),
      sessionStorage.getItem(PASSWORD_STORAGE_KEY) || "",
    );
    pending.classList.remove("pending");
    pending.querySelector(".audio-status")?.remove();
    const textEl = pending.querySelector(".answer-text");
    if (textEl) textEl.textContent = data.answer;
    if (data.audioUrl) {
      attachAudio(pending, data.audioUrl);
    }
    if (data.audioError) {
      appendAudioError(pending, data.audioError);
    }
    conversationHistory.push({ role: "assistant", content: data.answer });
    trimHistory();
  } catch (error) {
    pending.remove();
    appendMessage("assistant", "Virtual Ren", error instanceof Error ? error.message : "Something went wrong.", {
      isError: true,
    });
  } finally {
    setLoading(false);
    messageInput.focus();
  }
});

clearButton.addEventListener("click", () => {
  conversationHistory.length = 0;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  conversationEl.querySelectorAll(".message.dynamic").forEach((message) => message.remove());
  messageInput.value = "";
  messageInput.focus();
});

voiceToggle?.addEventListener("change", () => {
  setStoredVoiceEnabled(voiceToggle.checked);
  if (!voiceToggle.checked && activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  syncVoiceToggle();
});

function appendMessage(role, label, text, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message dynamic ${role === "user" ? "user-preview" : "assistant"}${options.pending ? " pending" : ""}`;

  const labelEl = document.createElement("span");
  labelEl.className = "message-label";
  labelEl.textContent = label;

  const textEl = document.createElement("div");
  textEl.className = options.isError ? "answer-text error-text" : "answer-text";
  textEl.textContent = text;

  wrapper.append(labelEl, textEl);

  if (options.audioUrl) {
    if (activeAudio) activeAudio.pause();
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = options.audioUrl;
    wrapper.append(audio);
    activeAudio = audio;
    audio.play().catch(() => {});
  }

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
  gateShell.hidden = true;
  appShell.hidden = false;
  init();
  messageInput.focus();
}

async function askWithProgress(message, history, pendingEl, voiceEnabled, password) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, voiceEnabled, password }),
  });
  if (!response.ok || !response.body) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(errorPayload?.message || "Request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const parsed = parseServerEvent(rawEvent);
      if (!parsed) continue;
      if (parsed.event === "status") {
        applyStatus(pendingEl, parsed.data);
      } else if (parsed.event === "done") {
        finalData = parsed.data;
      } else if (parsed.event === "error") {
        throw new Error(parsed.data.error || "Request failed.");
      }
    }
  }

  if (!finalData) throw new Error("No response returned.");
  return finalData;
}

function parseServerEvent(rawEvent) {
  const eventLine = rawEvent.split("\n").find((line) => line.startsWith("event: "));
  const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));
  if (!eventLine || !dataLine) return null;
  return {
    event: eventLine.slice("event: ".length),
    data: JSON.parse(dataLine.slice("data: ".length)),
  };
}

function applyStatus(messageEl, data) {
  const textEl = messageEl.querySelector(".answer-text");
  if (data.message && textEl) {
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

function attachAudio(messageEl, audioUrl) {
  if (!audioUrl) return;
  if (activeAudio) activeAudio.pause();
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.src = audioUrl;
  messageEl.append(audio);
  activeAudio = audio;
  audio.play().catch(() => {});
}

function appendAudioError(messageEl, message) {
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
    ? "Generate speech after each reply"
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
