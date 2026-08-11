import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runRuntimeCommand } from "../../src/runtime/runtime.mjs";
import { inspectRuntimeReadiness } from "../../src/runtime/readiness.mjs";
import { makeGitRepo, makeTemporaryDirectory, stageResult, workflow } from "../helpers.mjs";

const runtimeRoot = fileURLToPath(new URL("../..", import.meta.url));

function runtimeCommand(cwd, command) {
  return runRuntimeCommand({ runtimeRoot, cwd, command });
}

test("Runtime command Interface returns version payload without process I/O or a Git repository", async () => {
  const cwd = await makeTemporaryDirectory("runtime-version-cwd-");

  const result = await runRuntimeCommand({
    runtimeRoot,
    cwd,
    command: { kind: "version" },
  });

  assert.deepEqual(result, {
    exitCode: 0,
    payload: {
      schemaVersion: 1,
      name: "ai-vibe-demo-kit",
      version: "0.5.0",
      minimumNodeVersion: "22",
    },
  });
});

test("Runtime readiness is declared by managed contracts instead of CLI source text", async () => {
  const result = await inspectRuntimeReadiness({ root: runtimeRoot });

  assert.equal(result.runtimeReady, true, JSON.stringify(result.errors));
  assert.equal(result.completionEvidenceToolingReady, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
});

test("Runtime command Interface reports terminal completion eligibility", async () => {
  const cwd = await makeGitRepo();
  const terminal = workflow();
  delete terminal.stages.build;
  terminal.transitions = [{ id: "align-ready", from: "align", on: "ready", to: "complete", gate: { mode: "human", prompt: "Accept", onReject: "align" } }];
  await writeFile(join(cwd, "workflow.json"), `${JSON.stringify(terminal, null, 2)}\n`);
  await writeFile(join(cwd, "result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);

  const result = await runRuntimeCommand({
    runtimeRoot,
    cwd,
    command: { kind: "check-result", workflow: "workflow.json", stage: "align", file: "result.json", requireComplete: true },
  });

  assert.equal(result.exitCode, 0, JSON.stringify(result.payload));
  assert.equal(result.payload.valid, true);
  assert.equal(result.payload.policySatisfied, true);
  assert.equal(result.payload.completionEligible, true);
  assert.deepEqual(result.payload.transition, { id: "align-ready", to: "complete", gate: "human" });
});

test("Runtime command Interface owns Signal idempotency and Human Gate projection", async () => {
  const cwd = await makeGitRepo();
  await writeFile(join(cwd, "workflow.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  await writeFile(join(cwd, "align-result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);
  await writeFile(join(cwd, "build-result.json"), `${JSON.stringify({ outcome: "done", summary: "Build complete", conditions: [], skills: [], artifacts: [] }, null, 2)}\n`);

  let result = await runtimeCommand(cwd, { kind: "start", workflow: "workflow.json", intent: "Interface behavior" });
  assert.equal(result.payload.revision, 1);
  result = await runtimeCommand(cwd, { kind: "signal", revision: 1, file: "align-result.json" });
  assert.equal(result.exitCode, 0);
  assert.equal(result.payload.stage, "build");
  assert.equal(result.payload.applied, true);

  result = await runtimeCommand(cwd, { kind: "signal", revision: 1, file: "align-result.json" });
  assert.equal(result.exitCode, 0);
  assert.equal(result.payload.decision, "idempotent");
  assert.equal(result.payload.applied, false);

  result = await runtimeCommand(cwd, { kind: "signal", revision: 2, file: "build-result.json" });
  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.status, "awaiting-human");
  assert.equal(result.payload.requiresHumanAction, true);
  assert.equal(result.payload.pendingGate.transitionId, "build-done");
});

test("Runtime command Interface owns Workflow drift and error state context", async () => {
  const cwd = await makeGitRepo();
  const bound = workflow();
  await writeFile(join(cwd, "workflow.json"), `${JSON.stringify(bound, null, 2)}\n`);
  await writeFile(join(cwd, "result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);
  await runtimeCommand(cwd, { kind: "start", workflow: "workflow.json", intent: "Drift behavior" });
  bound.stages.align.goal = "Changed after binding";
  await writeFile(join(cwd, "workflow.json"), `${JSON.stringify(bound, null, 2)}\n`);

  let result = await runtimeCommand(cwd, { kind: "status" });
  assert.equal(result.exitCode, 0);
  assert.equal(result.payload.workflowDrift, true);
  assert.deepEqual(result.payload.allowedActions, ["abort"]);

  result = await runtimeCommand(cwd, { kind: "signal", revision: 1, file: "result.json" });
  assert.equal(result.exitCode, 2);
  assert.equal(result.payload.error.code, "E_WORKFLOW_DRIFT");
  assert.equal(result.payload.revision, 1);
  assert.equal(result.payload.stage, "align");
});

test("Runtime command Interface projects Policy Block context", async () => {
  const cwd = await makeGitRepo();
  await writeFile(join(cwd, "workflow.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  await writeFile(join(cwd, "result.json"), `${JSON.stringify(stageResult({
    conditions: [{ id: "intent-clear", status: "failed", reason: "Intent remains ambiguous" }],
  }), null, 2)}\n`);
  await runtimeCommand(cwd, { kind: "start", workflow: "workflow.json", intent: "Policy behavior" });

  const result = await runtimeCommand(cwd, { kind: "signal", revision: 1, file: "result.json" });
  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.status, "policy-blocked");
  assert.equal(result.payload.requiresHumanAction, true);
  assert.deepEqual(result.payload.unmet, ["intent-clear"]);
  assert.deepEqual(result.payload.active.pendingPolicy.unmet, ["intent-clear"]);
});
