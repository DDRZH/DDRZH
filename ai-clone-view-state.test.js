const test = require("node:test");
const assert = require("node:assert/strict");

const { showConversationView } = require("./ai-clone-view-state");

test("showConversationView hides the gate, reveals chat, resets scroll, and focuses the composer", () => {
  const gateShell = { hidden: false };
  const appShell = { hidden: true };
  const gatePasswordInput = { value: "ddrzh" };
  let focused = false;
  const messageInput = {
    focus() {
      focused = true;
    }
  };
  const calls = [];
  const windowObject = {
    scrollTo(options) {
      calls.push(options);
    }
  };
  const documentObject = {
    documentElement: { scrollTop: 180 },
    body: { scrollTop: 120 }
  };

  showConversationView({
    gateShell,
    appShell,
    messageInput,
    gatePasswordInput,
    windowObject,
    documentObject
  });

  assert.equal(gateShell.hidden, true);
  assert.equal(appShell.hidden, false);
  assert.equal(gatePasswordInput.value, "");
  assert.deepEqual(calls, [{ top: 0, left: 0, behavior: "auto" }]);
  assert.equal(documentObject.documentElement.scrollTop, 0);
  assert.equal(documentObject.body.scrollTop, 0);
  assert.equal(focused, true);
});
