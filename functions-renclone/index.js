const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { createRenCloneHandler } = require("./ren-clone-handler");
const { createRenCloneLiveHandler } = require("./ren-clone-live-handler");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const OPENAI_MODEL = defineSecret("OPENAI_MODEL");
const OPENAI_BASE_URL = defineSecret("OPENAI_BASE_URL");
const OPENAI_API_MODE = defineSecret("OPENAI_API_MODE");
const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID = defineSecret("ELEVENLABS_VOICE_ID");
const ELEVENLABS_MODEL_ID = defineSecret("ELEVENLABS_MODEL_ID");
const VOICE_ENABLED = defineSecret("VOICE_ENABLED");

exports.renclone = onRequest(
  {
    region: "us-central1",
    maxInstances: 4,
    secrets: [
      OPENAI_API_KEY,
      OPENAI_MODEL,
      OPENAI_BASE_URL,
      OPENAI_API_MODE,
      ELEVENLABS_API_KEY,
      ELEVENLABS_VOICE_ID,
      ELEVENLABS_MODEL_ID,
      VOICE_ENABLED
    ]
  },
  createRenCloneHandler({
    llmApiKey: () => OPENAI_API_KEY.value(),
    llmModel: () => OPENAI_MODEL.value(),
    llmBaseUrl: () => OPENAI_BASE_URL.value(),
    llmApiMode: () => OPENAI_API_MODE.value(),
    elevenApiKey: () => ELEVENLABS_API_KEY.value(),
    elevenVoiceId: () => ELEVENLABS_VOICE_ID.value(),
    elevenModelId: () => ELEVENLABS_MODEL_ID.value(),
    voiceEnabled: () => VOICE_ENABLED.value()
  })
);

exports.renCloneLive = onRequest(
  {
    region: "us-central1",
    maxInstances: 4,
    secrets: [
      OPENAI_API_KEY,
      OPENAI_MODEL,
      OPENAI_BASE_URL,
      OPENAI_API_MODE,
      ELEVENLABS_API_KEY,
      ELEVENLABS_VOICE_ID,
      ELEVENLABS_MODEL_ID,
      VOICE_ENABLED
    ]
  },
  createRenCloneLiveHandler({
    llmApiKey: () => OPENAI_API_KEY.value(),
    llmModel: () => OPENAI_MODEL.value(),
    llmBaseUrl: () => OPENAI_BASE_URL.value(),
    llmApiMode: () => OPENAI_API_MODE.value(),
    elevenApiKey: () => ELEVENLABS_API_KEY.value(),
    elevenVoiceId: () => ELEVENLABS_VOICE_ID.value(),
    elevenModelId: () => ELEVENLABS_MODEL_ID.value(),
    voiceEnabled: () => VOICE_ENABLED.value()
  })
);
