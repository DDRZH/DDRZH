const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const EMAILJS_PUBLIC_KEY = defineSecret("EMAILJS_PUBLIC_KEY");
const EMAILJS_PRIVATE_KEY = defineSecret("EMAILJS_PRIVATE_KEY");
const EMAILJS_SERVICE_ID = defineSecret("EMAILJS_SERVICE_ID");
const EMAILJS_TEMPLATE_ID = defineSecret("EMAILJS_TEMPLATE_ID");
const CONTACT_TO_EMAIL = defineSecret("CONTACT_TO_EMAIL");

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";
const MINIMUM_FORM_TIME_MS = 6000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_FIELD_LENGTH = 4000;
const ALLOWED_ORIGINS = new Set([
  "https://ddrzh.com",
  "https://www.ddrzh.com",
  "https://ddrzh-31cb8.web.app",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

const requestCounts = new Map();

function getClientIp(request) {
  const forwardedFor = request.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.ip || "unknown";
}

function isRateLimited(key) {
  const now = Date.now();
  const bucket = requestCounts.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  requestCounts.set(key, bucket);
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

function normalizeText(value) {
  return String(value || "").trim().slice(0, MAX_FIELD_LENGTH);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function reject(response, status, message) {
  response.status(status).json({ ok: false, message });
}

exports.contact = onRequest(
  {
    region: "us-central1",
    maxInstances: 3,
    secrets: [
      EMAILJS_PUBLIC_KEY,
      EMAILJS_PRIVATE_KEY,
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      CONTACT_TO_EMAIL
    ]
  },
  async (request, response) => {
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      reject(response, 405, "Method not allowed.");
      return;
    }

    const origin = request.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      reject(response, 403, "Origin not allowed.");
      return;
    }

    const body = parseBody(request);
    if (!body) {
      reject(response, 400, "Invalid request.");
      return;
    }

    const website = normalizeText(body.website);
    if (website) {
      response.status(200).json({ ok: true });
      return;
    }

    const elapsedMs = Number(body.elapsedMs || 0);
    if (!Number.isFinite(elapsedMs) || elapsedMs < MINIMUM_FORM_TIME_MS) {
      reject(response, 429, "Please wait a moment before sending.");
      return;
    }

    const email = normalizeText(body.email).toLowerCase();
    const projectGoal = normalizeText(body.projectGoal);
    const businessName = normalizeText(body.businessName);
    const subject = normalizeText(body.subject) || "Project enquiry";
    const message = normalizeText(body.message);

    if (!projectGoal || !businessName || !message || !isValidEmail(email)) {
      reject(response, 400, "Please complete the enquiry form.");
      return;
    }

    const ip = getClientIp(request);
    if (isRateLimited(`ip:${ip}`) || isRateLimited(`email:${email}`)) {
      reject(response, 429, "Too many requests. Please try again later.");
      return;
    }

    const emailJsResponse = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID.value(),
        template_id: EMAILJS_TEMPLATE_ID.value(),
        user_id: EMAILJS_PUBLIC_KEY.value(),
        accessToken: EMAILJS_PRIVATE_KEY.value(),
        template_params: {
          to_email: CONTACT_TO_EMAIL.value(),
          from_name: businessName,
          from_email: email,
          reply_to: email,
          project_goal: projectGoal,
          business_name: businessName,
          subject,
          message
        }
      })
    });

    if (!emailJsResponse.ok) {
      const details = await emailJsResponse.text();
      console.error("EmailJS send failed", emailJsResponse.status, details);
      reject(response, 502, "The enquiry could not be sent.");
      return;
    }

    response.status(200).json({ ok: true });
  }
);
