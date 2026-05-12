const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const canvas = document.querySelector("[data-hero-canvas]");
const startProjectButtons = document.querySelectorAll("[data-start-project]");
const wizard = document.querySelector("[data-project-wizard]");
const wizardForm = document.querySelector("[data-project-form]");
const wizardProgress = document.querySelector("[data-wizard-progress]");
const wizardQuestion = document.querySelector("[data-wizard-question]");
const wizardHelp = document.querySelector("[data-wizard-help]");
const wizardLabel = document.querySelector("[data-wizard-label]");
const wizardInput = document.querySelector("[data-wizard-input]");
const wizardBack = document.querySelector("[data-wizard-back]");
const wizardNext = document.querySelector("[data-wizard-next]");
const wizardCloseButtons = document.querySelectorAll("[data-wizard-close]");
const gdprBanner = document.querySelector("[data-gdpr-banner]");
const gdprAccept = document.querySelector("[data-gdpr-accept]");
const gdprReject = document.querySelector("[data-gdpr-reject]");

const safeStorage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Local storage can be blocked in strict privacy modes. The page still works without it.
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Removing storage can fail in the same strict modes as writing storage.
    }
  }
};

const projectQuestions = [
  {
    label: "Your future AI assistant",
    question:
      "State your dream for the future here. If there is an AI assistant that can help you do anything in a computer, what would you like it to do?",
    help: "This survey takes 3 mins to complete. Describe the outcome you want, even if it feels ambitious."
  },
  {
    label: "Your name and/or your business name",
    question: "What is your name and/or your business name?",
    help: "This helps DDRZH understand who the project is for."
  },
  {
    label: "Your email",
    question: "What email should DDRZH use to contact you?",
    help: "Add the best email for project follow-up.",
    type: "email"
  }
];

let wizardStep = 0;
let projectAnswers = {};

const loadProjectAnswers = () => {
  if (safeStorage.get("ddrzh-gdpr-choice") !== "accepted") return;

  const saved = safeStorage.get("ddrzh-project-answers");
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === "object") {
      projectAnswers = parsed;
    }
  } catch {
    projectAnswers = {};
  }
};

const saveCurrentAnswer = () => {
  if (!wizardInput) return;
  projectAnswers[wizardStep] = wizardInput.value.trim();
  if (safeStorage.get("ddrzh-gdpr-choice") === "accepted") {
    safeStorage.set("ddrzh-project-answers", JSON.stringify(projectAnswers));
  }
};

const renderWizardStep = () => {
  const current = projectQuestions[wizardStep];
  wizardProgress.textContent = `Question ${wizardStep + 1} of ${projectQuestions.length}`;
  wizardQuestion.textContent = current.question;
  wizardHelp.textContent = current.help;
  wizardLabel.textContent = current.label;
  wizardInput.value = projectAnswers[wizardStep] || "";
  wizardInput.inputMode = current.type === "email" ? "email" : "text";
  wizardInput.placeholder = current.type === "email" ? "you@example.com" : "";
  wizardInput.setCustomValidity("");
  wizardBack.disabled = wizardStep === 0;
  wizardNext.textContent = wizardStep === projectQuestions.length - 1 ? "Send enquiry" : "Next";
  wizardInput.focus();
};

const openWizard = () => {
  loadProjectAnswers();
  wizardStep = 0;
  document.body.classList.add("wizard-open");
  wizard?.classList.add("is-open");
  wizard?.setAttribute("aria-hidden", "false");
  renderWizardStep();
};

const closeWizard = () => {
  saveCurrentAnswer();
  document.body.classList.remove("wizard-open");
  wizard?.classList.remove("is-open");
  wizard?.setAttribute("aria-hidden", "true");
  startProjectButtons[0]?.focus();
};

const isCurrentAnswerValid = () => {
  const current = projectQuestions[wizardStep];
  const value = wizardInput.value.trim();

  if (!value) {
    wizardInput.setCustomValidity("Please answer this question before continuing.");
    wizardInput.reportValidity();
    return false;
  }

  if (current.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    wizardInput.setCustomValidity("Please enter a valid email address.");
    wizardInput.reportValidity();
    return false;
  }

  wizardInput.setCustomValidity("");
  return true;
};

const sendProjectEnquiry = () => {
  const body = projectQuestions
    .map((item, index) => `${item.label}:\n${projectAnswers[index] || ""}`)
    .join("\n\n");
  const name = projectAnswers[1] ? ` from ${projectAnswers[1]}` : "";
  const subject = `Project enquiry${name}`;
  window.location.href = `mailto:info@ddrzh.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

const setHeaderState = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

navToggle?.addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

nav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    document.body.classList.remove("nav-open");
    navToggle?.setAttribute("aria-expanded", "false");
  }
});

if (safeStorage.get("ddrzh-gdpr-accepted") === "true" && !safeStorage.get("ddrzh-gdpr-choice")) {
  safeStorage.set("ddrzh-gdpr-choice", "accepted");
}

if (safeStorage.get("ddrzh-gdpr-choice")) {
  gdprBanner?.classList.add("is-hidden");
}

gdprAccept?.addEventListener("click", () => {
  safeStorage.set("ddrzh-gdpr-choice", "accepted");
  safeStorage.set("ddrzh-gdpr-accepted", "true");
  gdprBanner?.classList.add("is-hidden");
});

gdprReject?.addEventListener("click", () => {
  projectAnswers = {};
  safeStorage.set("ddrzh-gdpr-choice", "rejected");
  safeStorage.remove("ddrzh-project-answers");
  gdprBanner?.classList.add("is-hidden");
});

startProjectButtons.forEach((button) => {
  button.addEventListener("click", openWizard);
});

wizardNext?.addEventListener("click", () => {
  if (!isCurrentAnswerValid()) return;

  saveCurrentAnswer();
  if (wizardStep === projectQuestions.length - 1) {
    sendProjectEnquiry();
    closeWizard();
    return;
  }

  wizardStep += 1;
  renderWizardStep();
});

wizardBack?.addEventListener("click", () => {
  saveCurrentAnswer();
  wizardStep = Math.max(0, wizardStep - 1);
  renderWizardStep();
});

wizardForm?.addEventListener("submit", (event) => {
  event.preventDefault();
});

wizardCloseButtons.forEach((button) => {
  button.addEventListener("click", closeWizard);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && wizard?.classList.contains("is-open")) {
    closeWizard();
  }
});

if (canvas && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const context = canvas.getContext("2d");
  const nodes = [];
  let width = 0;
  let height = 0;
  let deviceRatio = 1;

  const resizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    deviceRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * deviceRatio);
    canvas.height = Math.floor(height * deviceRatio);
    context.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);

    nodes.length = 0;
    const totalNodes = width < 700 ? 32 : 56;
    for (let index = 0; index < totalNodes; index += 1) {
      nodes.push({
        x: width * (0.42 + Math.random() * 0.56),
        y: height * (0.08 + Math.random() * 0.84),
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        radius: 1.2 + Math.random() * 2.3,
        phase: Math.random() * Math.PI * 2
      });
    }
  };

  const roundedRect = (x, y, w, h, radius) => {
    if (typeof context.roundRect === "function") {
      context.roundRect(x, y, w, h, radius);
      return;
    }

    context.moveTo(x + radius, y);
    context.lineTo(x + w - radius, y);
    context.quadraticCurveTo(x + w, y, x + w, y + radius);
    context.lineTo(x + w, y + h - radius);
    context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    context.lineTo(x + radius, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
  };

  const drawPanel = (x, y, w, h, label, progress) => {
    context.save();
    context.globalAlpha = 0.82;
    context.fillStyle = "rgba(8, 28, 27, 0.72)";
    context.strokeStyle = "rgba(156, 242, 200, 0.26)";
    context.lineWidth = 1;
    context.beginPath();
    roundedRect(x, y, w, h, 8);
    context.fill();
    context.stroke();

    context.fillStyle = "rgba(255, 255, 255, 0.72)";
    context.font = "700 11px Inter, system-ui, sans-serif";
    context.fillText(label, x + 14, y + 22);

    context.fillStyle = "rgba(156, 242, 200, 0.18)";
    context.fillRect(x + 14, y + h - 22, w - 28, 5);
    context.fillStyle = "#d7ff6a";
    context.fillRect(x + 14, y + h - 22, (w - 28) * progress, 5);
    context.restore();
  };

  const draw = (time) => {
    context.clearRect(0, 0, width, height);

    const pulse = (Math.sin(time * 0.0013) + 1) / 2;
    const panelWidth = Math.min(260, width * 0.28);
    const panelX = width * 0.62;

    drawPanel(panelX, height * 0.19, panelWidth, 92, "Customer behaviour", 0.52 + pulse * 0.28);
    drawPanel(panelX + 46, height * 0.43, panelWidth, 92, "Workflow automation", 0.68 - pulse * 0.2);
    drawPanel(panelX - 34, height * 0.67, panelWidth, 92, "Trend prediction", 0.48 + pulse * 0.34);

    nodes.forEach((node, index) => {
      node.x += node.vx;
      node.y += node.vy;
      node.phase += 0.01;

      if (node.x < width * 0.4 || node.x > width * 0.98) node.vx *= -1;
      if (node.y < height * 0.04 || node.y > height * 0.96) node.vy *= -1;

      for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex += 1) {
        const next = nodes[nextIndex];
        const dx = node.x - next.x;
        const dy = node.y - next.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 138) {
          context.strokeStyle = `rgba(156, 242, 200, ${0.13 * (1 - distance / 138)})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(node.x, node.y);
          context.lineTo(next.x, next.y);
          context.stroke();
        }
      }

      context.fillStyle = index % 7 === 0 ? "rgba(215, 255, 106, 0.9)" : "rgba(156, 242, 200, 0.74)";
      context.beginPath();
      context.arc(node.x, node.y, node.radius + Math.sin(node.phase) * 0.55, 0, Math.PI * 2);
      context.fill();
    });

    requestAnimationFrame(draw);
  };

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  requestAnimationFrame(draw);
}
