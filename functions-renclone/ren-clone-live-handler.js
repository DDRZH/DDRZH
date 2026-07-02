require("dotenv").config();

const {
  answerWithLocalRules,
  applyRenCloneRequestGate,
  getRuntimeConfig,
  normalizeText,
  sanitizeHistory,
  shouldUseVoice
} = require("./ren-clone-runtime");
const { LlmStreamer } = require("./streaming/LlmStreamer");
const { LiveSession } = require("./streaming/LiveSession");
const { ElevenLabsWsStreamer } = require("./streaming/ElevenLabsWsStreamer");

function createRenCloneLiveHandler(configOverrides = {}, deps = {}) {
  const createLlmStreamer =
    deps.createLlmStreamer ||
    ((config) => {
      if (!config.llmApiKey) {
        return {
          async *stream(message) {
            yield answerWithLocalRules(message);
          }
        };
      }

      return new LlmStreamer({
        apiKey: config.llmApiKey,
        baseUrl: config.llmBaseUrl,
        model: config.llmModel,
        mode: config.llmApiMode
      });
    });
  const createElevenLabs =
    deps.createElevenLabs ||
    ((config) => {
      if (!config.elevenApiKey || !config.elevenVoiceId) return null;
      return new ElevenLabsWsStreamer({
        apiKey: config.elevenApiKey,
        voiceId: config.elevenVoiceId,
        modelId: config.elevenModelId
      });
    });
  const LiveSessionClass = deps.LiveSessionClass || LiveSession;

  return async function handleRenCloneLiveRequest(request, response) {
    const config = getRuntimeConfig(configOverrides);
    const gate = applyRenCloneRequestGate({
      request,
      response,
      rateLimitKey: "ren-clone-live"
    });
    if (gate.handled) return;

    const { body } = gate;
    const message = normalizeText(body.message, 3000);
    const history = sanitizeHistory(body.history);
    const wantsVoice = shouldUseVoice(config.voiceGloballyEnabled, body.voiceEnabled);

    if (!message) {
      response.status(400).json({ ok: false, message: "Please enter a message." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    });

    const llmStreamer = createLlmStreamer(config);
    const elevenLabs = wantsVoice ? createElevenLabs(config) : null;
    const session = new LiveSessionClass({
      res: response,
      llmStreamer,
      elevenLabs
    });

    await session.run(message, history);
  };
}

module.exports = {
  createRenCloneLiveHandler,
  handleRenCloneLiveRequest: createRenCloneLiveHandler()
};
