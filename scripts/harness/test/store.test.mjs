import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { applyControl } from "../lib/kernel.mjs";
import { loadState, mutateState, probeLockOwner, readGitActor, statePaths } from "../lib/store.mjs";
import { makeGitRepo, workflow } from "./helpers.mjs";

const storeUrl = new URL("../lib/store.mjs", import.meta.url).href;

async function waitForPath(path) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assert.fail(`timed out waiting for ${path}`);
}

function incrementRevision(state, kind = "test") {
  state.revision += 1;
  return { state, decision: { kind } };
}

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

test("a mutation reclaims a lock after its owner is killed", async (t) => {
  const root = await makeGitRepo();
  const paths = await statePaths(root);
  const workerSource = `
    import { mutateState } from ${JSON.stringify(storeUrl)};
    await mutateState(${JSON.stringify(root)}, 0, async () => new Promise(() => setInterval(() => {}, 1000)));
  `;
  const worker = spawn(process.execPath, ["--input-type=module", "-e", workerSource], { stdio: "ignore" });
  t.after(() => {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL");
  });
  await waitForPath(paths.lockPath);
  assert.equal(Number((await readFile(paths.lockPath, "utf8")).trim()), worker.pid);
  const closed = once(worker, "close");
  assert.equal(worker.kill("SIGKILL"), true);
  const [, signal] = await closed;
  assert.equal(signal, "SIGKILL");

  const result = await mutateState(root, 0, incrementRevision);
  assert.equal(result.state.revision, 1);
  await assert.rejects(access(paths.lockPath));
});

test("a live lock owner remains busy with actionable facts", async (t) => {
  const root = await makeGitRepo();
  const paths = await statePaths(root);
  await mkdir(paths.controlDir, { recursive: true });
  await writeFile(paths.lockPath, `${process.pid}\n`);
  t.after(() => unlink(paths.lockPath).catch(() => {}));

  await assert.rejects(
    mutateState(root, 0, incrementRevision),
    (error) => error.code === "E_STATE_BUSY"
      && error.facts.ownerPid === process.pid
      && error.facts.ownerState === "alive"
      && /control\.lock/.test(error.repair),
  );
});

test("empty and malformed locks are never reclaimed automatically", async (t) => {
  const root = await makeGitRepo();
  const paths = await statePaths(root);
  await mkdir(paths.controlDir, { recursive: true });
  t.after(() => unlink(paths.lockPath).catch(() => {}));

  for (const value of ["", "not-a-pid\n"]) {
    await writeFile(paths.lockPath, value);
    await assert.rejects(
      mutateState(root, 0, incrementRevision),
      (error) => error.code === "E_STATE_BUSY"
        && error.facts.ownerPid === null
        && error.facts.ownerState === "unknown",
    );
    assert.equal(await readFile(paths.lockPath, "utf8"), value);
  }
});

test("permission-denied process probes are treated as alive", () => {
  const state = probeLockOwner(123, () => {
    const error = new Error("denied");
    error.code = "EPERM";
    throw error;
  });
  assert.equal(state, "alive");
});

test("concurrent writers behind a dead lock still allow one revision winner", async () => {
  const root = await makeGitRepo();
  const paths = await statePaths(root);
  await mkdir(paths.controlDir, { recursive: true });
  await writeFile(paths.lockPath, "2147483647\n");
  const results = await Promise.allSettled([
    mutateState(root, 0, (state) => incrementRevision(state, "first")),
    mutateState(root, 0, (state) => incrementRevision(state, "second")),
  ]);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
  const rejected = results.find((entry) => entry.status === "rejected");
  assert.equal(rejected.reason.code, "E_STALE_REVISION");
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
