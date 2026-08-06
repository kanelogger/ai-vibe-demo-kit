import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { makeRepo } from "./helpers.mjs";
import { controlPath, loadState, mutateState } from "../lib/state.mjs";

test("concurrent mutations serialize through the short-lived lock", async () => {
  const root = await makeRepo();
  await Promise.all([
    mutateState(root, (state) => { state.last = { id: "first" }; }),
    mutateState(root, (state) => { state.active = { id: "second" }; }),
  ]);

  const state = await loadState(root);
  assert.equal(state.revision, 2);
  assert.equal(state.last.id, "first");
  assert.equal(state.active.id, "second");
  const files = await readdir(dirname(await controlPath(root)));
  assert.deepEqual(files, ["control.json"]);
});

test("a failed mutation leaves state unchanged and removes its lock", async () => {
  const root = await makeRepo();
  await assert.rejects(
    mutateState(root, (state) => {
      state.last = { id: "must-not-persist" };
      throw new Error("stop");
    }),
    /stop/,
  );
  const state = await loadState(root);
  assert.equal(state.revision, 0);
  assert.equal(state.last, null);
  assert.deepEqual(await readdir(dirname(await controlPath(root))), []);
});
