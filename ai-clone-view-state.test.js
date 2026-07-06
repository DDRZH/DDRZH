const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadShowConversationView() {
  const script = fs.readFileSync(path.join(__dirname, "ai-clone.js"), "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require() {
      throw new Error("Unexpected require");
    },
    document: {
      querySelector() {
        return {
          addEventListener() {},
          querySelectorAll() {
            return [];
          },
          focus() {},
          value: "",
          checked: false,
          disabled: false
        };
      },
      body: { scrollTop: 0 },
      documentElement: { scrollTop: 0 }
    },
    window: {
      scrollTo() {},
      sessionStorage: {
        getItem() {
          return null;
        },
        setItem() {}
      }
    },
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {}
    },
    fetch: async () => ({
      json: async () => ({})
    }),
    AudioQueue: function AudioQueue() {},
    TextDecoder,
    setTimeout,
    clearTimeout,
    console
  };

  vm.runInNewContext(`${script}\nmodule.exports = { showConversationView };`, sandbox, {
    filename: "ai-clone.js"
  });

  return sandbox.module.exports.showConversationView;
}

const showConversationView = loadShowConversationView();

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
  assert.equal(calls.length, 1);
  assert.equal(calls[0].top, 0);
  assert.equal(calls[0].left, 0);
  assert.equal(calls[0].behavior, "auto");
  assert.equal(documentObject.documentElement.scrollTop, 0);
  assert.equal(documentObject.body.scrollTop, 0);
  assert.equal(focused, true);
});
