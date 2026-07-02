require("dotenv").config();

const path = require("node:path");
const { mkdir, writeFile } = require("node:fs/promises");
const crypto = require("node:crypto");
const {
  answerWithLocalRules,
  applyRenCloneRequestGate,
  containsCjk,
  getRuntimeConfig,
  normalizeText,
  readSkillInstructions,
  sanitizeHistory,
  sendEvent,
  shouldUseVoice
} = require("./ren-clone-runtime");

const audioDir = process.env.REN_CLONE_AUDIO_DIR || path.join("/tmp", "ren-clone-audio");

async function answerWithLLM(message, history, config) {
  let answer = "";
  if (config.llmApiMode === "chat-completions") {
    answer = await answerWithChatCompletions(message, history, config);
  } else {
    answer = await answerWithResponsesApi(message, history, config);
  }
  return containsCjk(answer) ? rewriteAnswerInEnglish(answer, config) : answer;
}

async function answerWithResponsesApi(message, history, config) {
  const instructions = await readSkillInstructions();
  const input = [...history, { role: "user", content: message }];
  const response = await fetch(`${config.llmBaseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.llmModel,
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

async function answerWithChatCompletions(message, history, config) {
  const instructions = await readSkillInstructions();
  const messages = [
    { role: "system", content: instructions },
    ...history,
    { role: "user", content: message }
  ];
  const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.llmModel,
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

async function rewriteAnswerInEnglish(answer, config) {
  const rewriteInstruction = [
    "Rewrite this reply in natural concise English only.",
    "Keep first person.",
    "Keep the same meaning and tone.",
    "Do not add a disclaimer.",
    "Do not add a follow-up question.",
    "Use plain text only, no Markdown."
  ].join(" ");

  if (config.llmApiMode === "chat-completions") {
    const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.llmApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.llmModel,
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

  const response = await fetch(`${config.llmBaseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.llmModel,
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

async function createSpeech(text, config) {
  if (!config.elevenApiKey || !config.elevenVoiceId) {
    throw new Error("ElevenLabs API key or voice ID is missing.");
  }

  await mkdir(audioDir, { recursive: true });
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenVoiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": config.elevenApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenModelId,
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

function createRenCloneHandler(configOverrides = {}) {
  return async function handleRenCloneRequest(request, response) {
    const config = getRuntimeConfig(configOverrides);
    const gate = applyRenCloneRequestGate({ request, response, allowGet: true });
    if (gate.handled) return;

    if (request.method === "GET") {
      response.status(200).json({
        voiceAvailable: Boolean(config.elevenApiKey && config.elevenVoiceId),
        voiceConfigured: Boolean(config.elevenApiKey && config.elevenVoiceId),
        voiceGloballyEnabled: config.voiceGloballyEnabled,
        llmMode: config.llmApiKey ? `distilled-persona:${config.llmApiMode}` : "local-demo",
        llmModel: config.llmApiKey ? config.llmModel : ""
      });
      return;
    }

    const { body } = gate;
    const message = normalizeText(body.message, 3000);
    const history = sanitizeHistory(body.history);
    const voiceEnabled = shouldUseVoice(config.voiceGloballyEnabled, body.voiceEnabled);

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
      const answer = config.llmApiKey
        ? await answerWithLLM(message, history, config)
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
          audioUrl = await createSpeech(answer, config);
        } catch (error) {
          audioError = error instanceof Error ? error.message : "Could not generate audio.";
        }
      }

      sendEvent(response, "done", {
        answer,
        audioUrl,
        audioError,
        voiceEnabled,
        llmMode: config.llmApiKey ? `distilled-persona:${config.llmApiMode}` : "local-demo",
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
  };
}

module.exports = {
  createRenCloneHandler,
  handleRenCloneRequest: createRenCloneHandler()
};
