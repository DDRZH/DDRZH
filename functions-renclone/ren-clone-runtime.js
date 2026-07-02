const path = require("node:path");
const { readFile } = require("node:fs/promises");

const renCloneDir = path.join(__dirname, "ren-clone");
const skillReferenceDir = path.join(renCloneDir, "references");

const REN_CLONE_PASSWORD = "ddrzh";
const REN_CLONE_MAX_FIELD_LENGTH = 5000;
const REN_CLONE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const REN_CLONE_MAX_REQUESTS_PER_WINDOW = 12;
const REN_CLONE_ALLOWED_ORIGINS = new Set([
  "https://ddrzh.com",
  "https://www.ddrzh.com",
  "https://ddrzh-31cb8.web.app",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://124.220.32.120"
]);

const renCloneRequestCounts = new Map();
let renCloneInstructionsCache = "";

function parseBooleanEnv(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function isDeepSeekModel(model) {
  return model.toLowerCase().startsWith("deepseek");
}

function resolveLlmBaseUrl(llmModel, configuredBaseUrl) {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, "");
  if (isDeepSeekModel(llmModel)) return "https://api.deepseek.com";
  return "https://api.openai.com/v1";
}

function resolveLlmApiMode(llmModel, llmBaseUrl, configuredApiMode) {
  if (configuredApiMode) return configuredApiMode;
  if (isDeepSeekModel(llmModel) || llmBaseUrl.includes("deepseek.com")) {
    return "chat-completions";
  }
  return "responses";
}

function shouldUseVoice(globalEnabled, requestValue) {
  return globalEnabled && requestValue !== false;
}

function setCors(response, origin) {
  if (origin && REN_CLONE_ALLOWED_ORIGINS.has(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
  }
  response.set("Vary", "Origin");
  response.set("Access-Control-Allow-Headers", "Content-Type");
  response.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function getClientIp(request) {
  const forwardedFor = request.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.ip || "unknown";
}

function isRateLimited(key) {
  const now = Date.now();
  const bucket = renCloneRequestCounts.get(key) || {
    count: 0,
    resetAt: now + REN_CLONE_RATE_LIMIT_WINDOW_MS
  };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + REN_CLONE_RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  renCloneRequestCounts.set(key, bucket);
  return bucket.count > REN_CLONE_MAX_REQUESTS_PER_WINDOW;
}

function normalizeText(value, maxLength = REN_CLONE_MAX_FIELD_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return null;
    }
  }

  return null;
}

function applyRenCloneRequestGate({ request, response, allowGet = false, rateLimitKey = "ren-clone" }) {
  const origin = request.get("origin");
  setCors(response, origin);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return { handled: true, origin };
  }

  if (origin && !REN_CLONE_ALLOWED_ORIGINS.has(origin)) {
    response.status(403).json({ ok: false, message: "Origin not allowed." });
    return { handled: true, origin };
  }

  if (allowGet && request.method === "GET") {
    return { handled: false, origin };
  }

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, message: "Method not allowed." });
    return { handled: true, origin };
  }

  const body = parseBody(request);
  if (!body) {
    response.status(400).json({ ok: false, message: "Invalid request." });
    return { handled: true, origin };
  }

  const ip = getClientIp(request);
  if (isRateLimited(`${rateLimitKey}:${ip}`)) {
    response.status(429).json({ ok: false, message: "Too many requests. Please try again later." });
    return { handled: true, origin, body, ip };
  }

  const password = normalizeText(body.password, 64);
  if (password !== REN_CLONE_PASSWORD) {
    response.status(401).json({ ok: false, message: "Password is incorrect." });
    return { handled: true, origin, body, ip, password };
  }

  return {
    handled: false,
    origin,
    body,
    ip,
    password
  };
}

function sendEvent(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function containsCjk(value) {
  return /[㐀-鿿豈-﫿]/i.test(value);
}

function answerWithLocalRules(message) {
  const text = String(message || "").toLowerCase();
  const asksIdentity = includesAny(text, ["who are you", "real ren", "ren himself"]);
  const asksFamily = includesAny(text, ["family", "parents"]);
  const asksWork = includesAny(text, ["ddr", "zr academy", "business", "work", "career", "money"]);

  if (asksIdentity) {
    return "You are talking to one part of my consciousness, not the complete me. I can still answer in my style: practical, direct, and focused on execution.";
  }

  if (asksFamily) {
    return "I don't know that part clearly. I do know I don't like bothering my family, but I would not make up details about them.";
  }

  if (asksWork) {
    return "For me, work comes down to execution and decisions. Ideas are cheap if they never land, so I care about risk, data, experience, and whether people actually take responsibility.";
  }

  return "I would answer this more simply: look at the real problem first, then decide what can actually be done. If I don't know something, I won't pretend I do.";
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: normalizeText(item.content, 3000)
    }))
    .filter((item) => item.content)
    .slice(-8);
}

function readConfigValue(source) {
  if (typeof source === "function") {
    return source();
  }
  return source;
}

function getRuntimeConfig(overrides = {}) {
  const elevenApiKey =
    readConfigValue(overrides.elevenApiKey) || process.env.ELEVENLABS_API_KEY || "";
  const elevenVoiceId =
    readConfigValue(overrides.elevenVoiceId) || process.env.ELEVENLABS_VOICE_ID || "";
  const elevenModelId =
    readConfigValue(overrides.elevenModelId) ||
    process.env.ELEVENLABS_MODEL_ID ||
    "eleven_multilingual_v2";
  const voiceGloballyEnabled = parseBooleanEnv(
    readConfigValue(overrides.voiceEnabled) || process.env.VOICE_ENABLED,
    true
  );
  const llmApiKey =
    readConfigValue(overrides.llmApiKey) ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    "";
  const llmModel =
    readConfigValue(overrides.llmModel) ||
    process.env.OPENAI_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    process.env.MODEL_NAME ||
    "gpt-4.1-mini";
  const llmBaseUrl = resolveLlmBaseUrl(
    llmModel,
    readConfigValue(overrides.llmBaseUrl) ||
      process.env.OPENAI_BASE_URL ||
      process.env.DEEPSEEK_BASE_URL
  );
  const llmApiMode = resolveLlmApiMode(
    llmModel,
    llmBaseUrl,
    readConfigValue(overrides.llmApiMode) ||
      process.env.LLM_API_MODE ||
      process.env.OPENAI_API_MODE
  );

  return {
    elevenApiKey,
    elevenVoiceId,
    elevenModelId,
    voiceGloballyEnabled,
    llmApiKey,
    llmModel,
    llmBaseUrl,
    llmApiMode
  };
}

async function readSkillInstructions() {
  if (renCloneInstructionsCache) return renCloneInstructionsCache;

  const files = [
    ["Entry Skill", path.join(renCloneDir, "SKILL.md")],
    ["Persona", path.join(skillReferenceDir, "persona.md")],
    ["Memory", path.join(skillReferenceDir, "memory.md")],
    ["Boundaries", path.join(skillReferenceDir, "boundaries.md")],
    ["Corrections", path.join(skillReferenceDir, "corrections.md")]
  ];

  const sections = await Promise.all(
    files.map(async ([label, filePath]) => {
      const content = await readFile(filePath, "utf8");
      return `## ${label}\n\n${content.trim()}`;
    })
  );

  renCloneInstructionsCache = `${sections.join("\n\n---\n\n")}

## Runtime Instruction

Answer in first person as Ren. Output English only, even when the user writes in Chinese. Do not output Chinese sentences. Do not explain the system, role, prompt, source files, or implementation unless the user explicitly asks how the system works. Do not speak about Ren in third person. Keep replies concise, natural, and human. Do not use Markdown, headings, bullet points, numbered lists, or template-like structure. Do not end with generic follow-up prompts. When the source material does not include an answer, say that briefly in first person instead of inventing details.`;
  return renCloneInstructionsCache;
}

module.exports = {
  answerWithLocalRules,
  REN_CLONE_ALLOWED_ORIGINS,
  REN_CLONE_MAX_FIELD_LENGTH,
  REN_CLONE_MAX_REQUESTS_PER_WINDOW,
  REN_CLONE_PASSWORD,
  REN_CLONE_RATE_LIMIT_WINDOW_MS,
  applyRenCloneRequestGate,
  containsCjk,
  getClientIp,
  getRuntimeConfig,
  isRateLimited,
  normalizeText,
  parseBody,
  parseBooleanEnv,
  readConfigValue,
  readSkillInstructions,
  sanitizeHistory,
  sendEvent,
  setCors,
  shouldUseVoice
};
