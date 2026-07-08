require("dotenv").config();
const { randomUUID } = require("node:crypto");
const functionsLogger = require("firebase-functions/logger");

const {
  answerWithLocalRules,
  applyRenCloneRequestGate,
  getClientIp,
  getRuntimeConfig,
  normalizeText,
  sanitizeHistory,
  shouldUseVoice
} = require("./ren-clone-runtime");
const { createRequestLogger, errorMetadata } = require("./logger");
const { LlmStreamer } = require("./streaming/LlmStreamer");
const { LiveSession } = require("./streaming/LiveSession");
const { ElevenLabsWsStreamer } = require("./streaming/ElevenLabsWsStreamer");

function createRenCloneLiveHandler(configOverrides = {}, deps = {}) {
  const baseLogger = deps.logger || functionsLogger;
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
    ((config, logger, requestContext) => {
      if (!config.elevenApiKey || !config.elevenVoiceId) return null;
      return new ElevenLabsWsStreamer({
        apiKey: config.elevenApiKey,
        voiceId: config.elevenVoiceId,
        modelId: config.elevenModelId,
        logger,
        requestContext
      });
    });
  const LiveSessionClass = deps.LiveSessionClass || LiveSession;

  return async function handleRenCloneLiveRequest(request, response) {
    const config = getRuntimeConfig(configOverrides);
    const requestContext = {
      requestId: randomUUID(),
      route: "renCloneLive",
      ip: getClientIp(request)
    };
    const logger = createRequestLogger(baseLogger, requestContext);
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
    logger.info("ren_clone_live_request_started", {
      method: request.method,
      historyLength: history.length,
      wantsVoice,
      voiceGloballyEnabled: config.voiceGloballyEnabled,
      hasElevenCredentials: Boolean(config.elevenApiKey && config.elevenVoiceId),
      llmApiMode: config.llmApiMode
    });

    if (!message) {
      logger.warn("ren_clone_live_request_rejected_empty_message");
      response.status(400).json({ ok: false, message: "Please enter a message." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    });

    const llmStreamer = createLlmStreamer(config);
    const elevenLabs = wantsVoice ? createElevenLabs(config, logger, requestContext) : null;
    logger.info("ren_clone_live_session_created", {
      wantsVoice,
      hasElevenLabs: Boolean(elevenLabs),
      elevenModelId: config.elevenModelId || ""
    });
    const session = new LiveSessionClass({
      res: response,
      llmStreamer,
      elevenLabs,
      logger,
      requestContext
    });

    try {
      await session.run(message, history);
    } catch (error) {
      logger.error("ren_clone_live_handler_failed", errorMetadata(error));
      if (!response.ended) {
        response.end();
      }
    }
  };
}

module.exports = {
  createRenCloneLiveHandler,
  handleRenCloneLiveRequest: createRenCloneLiveHandler()
};
