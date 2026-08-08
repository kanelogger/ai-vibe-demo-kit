import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyControl } from "../lib/kernel.mjs";
import { loadState, mutateState, readGitActor, statePaths } from "../lib/store.mjs";
import { makeGitRepo, workflow } from "./helpers.mjs";

function terminalRecord(id) {
  return {
    id,
    intent: "Test",
    workflow: { id: "test", version: 1, ref: "workflows/test.json", digest: "sha256:test" },
    status: "completed",
    stage: "done",
    acceptedRisks: [],
    results: [],
    decisions: [],
    events: [],
    outcome: "completed",
  };
}

test("file store writes state atomically and reads the git actor without spawning commands", async () => {
  const root = await makeGitRepo();
  const result = await mutateState(root, 0, (state) => applyControl({
    state,
    workflow: workflow(),
    command: {
      kind: "start",
      intent: "Start",
      workflowRef: "workflows/test.json",
      workflowDigest: "sha256:test",
    },
    idFactory: () => "wi-store",
    now: () => "2026-08-08T12:00:00.000Z",
  }));
  assert.equal(result.state.revision, 1);
  assert.equal((await loadState(root)).active.id, "wi-store");
  assert.equal(await readGitActor(root), "Harness Test");
  const paths = await statePaths(root);
  assert.deepEqual(await readdir(paths.controlDir), ["control.json"]);
});

test("concurrent writes with the same revision allow one winner", async () => {
  const root = await makeGitRepo();
  const update = (label) => mutateState(root, 0, (state) => {
    state.last = terminalRecord(label);
    state.revision += 1;
    return { state, decision: { kind: "test" } };
  });
  const results = await Promise.allSettled([update("first"), update("second")]);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
  const rejected = results.find((entry) => entry.status === "rejected");
  assert.equal(rejected.reason.code, "E_STALE_REVISION");
});

test("failed mutation preserves state and removes its lock", async () => {
  const root = await makeGitRepo();
  await assert.rejects(mutateState(root, 0, () => { throw new Error("stop"); }), /stop/);
  assert.equal((await loadState(root)).revision, 0);
  const paths = await statePaths(root);
  await assert.rejects(access(paths.lockPath));
});

test("terminal records are archived under the git private directory", async () => {
  const root = await makeGitRepo();
  await mutateState(root, 0, (state) => {
    state.revision = 1;
    state.last = terminalRecord("wi-done");
    return { state, decision: { kind: "complete" } };
  });
  const paths = await statePaths(root);
  const archive = JSON.parse(await readFile(join(paths.historyDir, "wi-done.json"), "utf8"));
  assert.equal(archive.outcome, "completed");
});

test("closed legacy v1 state remains readable without an eager rewrite", async () => {
  const root = await makeGitRepo();
  const paths = await statePaths(root);
  await mkdir(paths.controlDir, { recursive: true });
  await writeFile(paths.controlPath, JSON.stringify({
    version: 1,
    revision: 7,
    active: null,
    last: { id: "legacy-task", outcome: "abandoned" },
  }));
  const state = await loadState(root);
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.revision, 7);
  assert.equal(state.last.legacy, true);
});

test("nested state corruption fails loudly", async () => {
  const root = await makeGitRepo();
  const paths = await statePaths(root);
  await mkdir(paths.controlDir, { recursive: true });
  await writeFile(paths.controlPath, JSON.stringify({
    schemaVersion: 1,
    revision: 1,
    active: { id: "broken", events: [{ sequence: 2 }] },
    last: null,
  }));
  await assert.rejects(loadState(root), (error) => error.code === "E_STATE_INVALID" && error.facts.errors.length > 0);
});

test("file store refuses a symlinked Git-private control directory", async () => {
  const root = await makeGitRepo();
  const outside = await mkdtemp(join(tmpdir(), "harness-state-outside-"));
  const paths = await statePaths(root);
  await symlink(outside, paths.controlDir, "dir");
  await assert.rejects(
    mutateState(root, 0, (state) => {
      state.revision = 1;
      return { state, decision: { kind: "test" } };
    }),
    (error) => error.code === "E_PATH_SYMLINK",
  );
  assert.deepEqual(await readdir(outside), []);
});
