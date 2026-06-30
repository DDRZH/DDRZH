const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { createRenCloneHandler } = require("./ren-clone-handler");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const OPENAI_MODEL = defineSecret("OPENAI_MODEL");
const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID = defineSecret("ELEVENLABS_VOICE_ID");

exports.renClone = onRequest(
  {
    region: "us-central1",
    maxInstances: 4,
    secrets: [
      OPENAI_API_KEY,
      OPENAI_MODEL,
      ELEVENLABS_API_KEY,
      ELEVENLABS_VOICE_ID
    ]
  },
  createRenCloneHandler({
    llmApiKey: () => OPENAI_API_KEY.value(),
    llmModel: () => OPENAI_MODEL.value(),
    elevenApiKey: () => ELEVENLABS_API_KEY.value(),
    elevenVoiceId: () => ELEVENLABS_VOICE_ID.value()
  })
);
