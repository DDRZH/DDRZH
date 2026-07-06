function showConversationView({
  gateShell,
  appShell,
  messageInput,
  gatePasswordInput,
  windowObject,
  documentObject
}) {
  if (gateShell) gateShell.hidden = true;
  if (appShell) appShell.hidden = false;
  if (gatePasswordInput) gatePasswordInput.value = "";

  if (windowObject && typeof windowObject.scrollTo === "function") {
    windowObject.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  if (documentObject?.documentElement) {
    documentObject.documentElement.scrollTop = 0;
  }

  if (documentObject?.body) {
    documentObject.body.scrollTop = 0;
  }

  if (messageInput && typeof messageInput.focus === "function") {
    messageInput.focus();
  }
}

if (typeof window !== "undefined") {
  window.showConversationView = showConversationView;
}

if (typeof module !== "undefined") {
  module.exports = {
    showConversationView
  };
}
