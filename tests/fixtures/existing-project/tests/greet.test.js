import test from "node:test";
import assert from "node:assert/strict";
import { greet } from "../src/util.js";

test("greet", () => {
  assert.equal(greet("harness"), "hello harness");
});
