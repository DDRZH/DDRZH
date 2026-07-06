const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("ai-clone.css forces hidden elements off-screen even when component classes set display", () => {
  const css = fs.readFileSync(path.join(__dirname, "ai-clone.css"), "utf8");

  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});
