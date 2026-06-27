require("dotenv").config();

const path = require("node:path");
const { readFile, mkdir, writeFile } = require("node:fs/promises");
const crypto = require("node:crypto");

const renCloneDir = path.join(__dirname, "ren-clone");
const skillReferenceDir = path.join(renCloneDir, "references");
const audioDir = process.env.REN_CLONE_AUDIO_DIR || path.join("/tmp", "ren-clone-audio");
let renCloneInstructionsCache = "";

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

const elevenApiKey = process.env.ELEVENLABS_API_KEY || "";
const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID || "";
const elevenModelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const voiceGloballyEnabled = parseBooleanEnv(process.env.VOICE_ENABLED, true);
const llmApiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const llmModel = process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || process.env.MODEL_NAME || "gpt-4.1-mini";
const llmBaseUrl = resolveLlmBaseUrl();
const llmApiMode = resolveLlmApiMode();

function parseBooleanEnv(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function resolveLlmBaseUrl() {
  const configured = process.env.OPENAI_BASE_URL || process.env.DEEPSEEK_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (isDeepSeekModel(llmModel)) return "https://api.deepseek.com";
  return "https://api.openai.com/v1";
}

function resolveLlmApiMode() {
  const configured = process.env.LLM_API_MODE || process.env.OPENAI_API_MODE;
  if (configured) return configured;
  if (isDeepSeekModel(llmModel) || llmBaseUrl.includes("deepseek.com")) return "chat-completions";
  return "responses";
}

function isDeepSeekModel(model) {
  return model.toLowerCase().startsWith("deepseek");
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

function sendEvent(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function containsCjk(value) {
  return /[㐀-鿿豈-﫿]/i.test(value);
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

async function answerWithLLM(message, history) {
  let answer = "";
  if (llmApiMode === "chat-completions") {
    answer = await answerWithChatCompletions(message, history);
  } else {
    answer = await answerWithResponsesApi(message, history);
  }
  return containsCjk(answer) ? rewriteAnswerInEnglish(answer) : answer;
}

async function answerWithResponsesApi(message, history) {
  const instructions = await readSkillInstructions();
  const input = [...history, { role: "user", content: message }];
  const response = await fetch(`${llmBaseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llmApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: llmModel,
      instructions,
      input
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const output =
    data.output_text ||
    data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n");

  if (!output) {
    throw new Error("OpenAI returned no answer text.");
  }

  return output.trim();
}

async function answerWithChatCompletions(message, history) {
  const instructions = await readSkillInstructions();
  const messages = [
    { role: "system", content: instructions },
    ...history,
    { role: "user", content: message }
  ];
  const response = await fetch(`${llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llmApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: llmModel,
      messages,
      stream: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat completions request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const output = data.choices?.[0]?.message?.content;
  if (!output) {
    throw new Error("Chat completions API returned no answer text.");
  }

  return output.trim();
}

async function rewriteAnswerInEnglish(answer) {
  const rewriteInstruction = [
    "Rewrite this reply in natural concise English only.",
    "Keep first person.",
    "Keep the same meaning and tone.",
    "Do not add a disclaimer.",
    "Do not add a follow-up question.",
    "Use plain text only, no Markdown."
  ].join(" ");

  if (llmApiMode === "chat-completions") {
    const response = await fetch(`${llmBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llmApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          { role: "system", content: rewriteInstruction },
          { role: "user", content: answer }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`English rewrite request failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content;
    if (!output) {
      throw new Error("English rewrite returned no answer text.");
    }

    return output.trim();
  }

  const response = await fetch(`${llmBaseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llmApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: llmModel,
      instructions: rewriteInstruction,
      input: answer
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`English rewrite request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const output =
    data.output_text ||
    data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n");

  if (!output) {
    throw new Error("English rewrite returned no answer text.");
  }

  return output.trim();
}

function answerWithLocalRules(message) {
  const text = message.toLowerCase();
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

async function createSpeech(text) {
  if (!elevenApiKey || !elevenVoiceId) {
    throw new Error("ElevenLabs API key or voice ID is missing.");
  }

  await mkdir(audioDir, { recursive: true });
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elevenVoiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: elevenModelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs request failed: ${response.status} ${errorText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.mp3`;
  await writeFile(path.join(audioDir, filename), buffer);
  return `audio/${filename}`;
}

async function handleRenCloneRequest(request, response) {
  const origin = request.get("origin");
  setCors(response, origin);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (origin && !REN_CLONE_ALLOWED_ORIGINS.has(origin)) {
    response.status(403).json({ ok: false, message: "Origin not allowed." });
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      voiceAvailable: Boolean(elevenApiKey && elevenVoiceId),
      voiceConfigured: Boolean(elevenApiKey && elevenVoiceId),
      voiceGloballyEnabled,
      llmMode: llmApiKey ? `distilled-persona:${llmApiMode}` : "local-demo",
      llmModel: llmApiKey ? llmModel : ""
    });
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, message: "Method not allowed." });
    return;
  }

  const body = parseBody(request);
  if (!body) {
    response.status(400).json({ ok: false, message: "Invalid request." });
    return;
  }

  const password = normalizeText(body.password, 64);
  const message = normalizeText(body.message, 3000);
  const history = sanitizeHistory(body.history);
  const voiceEnabled = shouldUseVoice(voiceGloballyEnabled, body.voiceEnabled);
  const ip = getClientIp(request);

  if (isRateLimited(`ren-clone:${ip}`)) {
    response.status(429).json({ ok: false, message: "Too many requests. Please try again later." });
    return;
  }

  if (password !== REN_CLONE_PASSWORD) {
    response.status(401).json({ ok: false, message: "Password is incorrect." });
    return;
  }

  if (!message) {
    response.status(400).json({ ok: false, message: "Please enter a message." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive"
  });

  const requestStarted = Date.now();

  try {
    sendEvent(response, "status", { stage: "thinking", message: "Thinking..." });

    const answerStarted = Date.now();
    const answer = llmApiKey
      ? await answerWithLLM(message, history)
      : answerWithLocalRules(message);

    if (voiceEnabled) {
      sendEvent(response, "status", {
        stage: "speaking",
        message: "Thinking complete. Generating voice...",
        answer,
        timings: {
          answerMs: Date.now() - answerStarted
        }
      });
    }

    let audioUrl = "";
    let audioError = "";
    const speechStarted = Date.now();
    if (voiceEnabled) {
      try {
        audioUrl = await createSpeech(answer);
      } catch (error) {
        audioError = error instanceof Error ? error.message : "Could not generate audio.";
      }
    }

    sendEvent(response, "done", {
      answer,
      audioUrl,
      audioError,
      voiceEnabled,
      llmMode: llmApiKey ? `distilled-persona:${llmApiMode}` : "local-demo",
      timings: {
        speechMs: Date.now() - speechStarted,
        totalMs: Date.now() - requestStarted
      }
    });
  } catch (error) {
    sendEvent(response, "error", {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  } finally {
    response.end();
  }
}

module.exports = {
  handleRenCloneRequest
};
