const test = require("node:test");
const assert = require("node:assert/strict");

const functions = require("../index");

test("ren clone HTTPS functions are publicly invokable through Firebase Hosting rewrites", () => {
  assert.deepEqual(functions.renclone.__endpoint.httpsTrigger.invoker, ["public"]);
  assert.deepEqual(functions.renCloneLive.__endpoint.httpsTrigger.invoker, ["public"]);
});
