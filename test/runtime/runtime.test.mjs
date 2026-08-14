import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
      version: "0.6.0",
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

test("Runtime readiness requires the execution trace capability and template", async () => {
  const root = await makeTemporaryDirectory("runtime-readiness-");
  const writeJson = async (path, value) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), JSON.stringify(value));
  };
  await writeJson(".harness/manifest.json", {
    schemaVersion: 2,
    name: "ai-vibe-demo-kit",
    version: "0.6.0",
    minimumNodeVersion: "22",
    capabilities: {
      commands: ["version", "check", "check-architecture", "check-environment", "check-result", "start", "status", "signal", "decide"],
      contracts: ["execution-trace/v1", "test-impact/v1", "verification-report/v1"],
    },
  });
  await writeJson("source/workflows/workflow-default.json", workflow());
  await writeJson("source/workflows/stage-result-template.json", { conditions: [], skills: [], artifacts: [] });
  await writeJson("source/workflows/test-impact-template.json", { schemaVersion: 1, sourceChanges: [], testChanges: [], checks: [] });
  await writeJson("source/workflows/verification-report-template.json", { schemaVersion: 1, conditions: [], checks: [], cleanup: [] });

  let result = await inspectRuntimeReadiness({ root });
  assert.equal(result.completionEvidenceToolingReady, false);
  assert.ok(result.errors.some((entry) => entry.code === "E_COMPLETION_TOOLING"));

  await writeJson("source/workflows/execution-trace-template.json", { schemaVersion: 1, requirements: [], selections: [], executions: [], residualRisks: [] });
  result = await inspectRuntimeReadiness({ root });
  assert.equal(result.completionEvidenceToolingReady, true, JSON.stringify(result.errors));

  const manifest = JSON.parse(await readFile(join(root, ".harness", "manifest.json"), "utf8"));
  manifest.capabilities.contracts = manifest.capabilities.contracts.filter((entry) => entry !== "execution-trace/v1");
  await writeJson(".harness/manifest.json", manifest);
  result = await inspectRuntimeReadiness({ root });
  assert.equal(result.runtimeReady, false);
  assert.ok(result.errors.some((entry) => entry.code === "E_MANIFEST_INVALID"));
});

test("default Workflow v4 binds only Workflow Runner and requires execution traces", async () => {
  const value = JSON.parse(await readFile(join(runtimeRoot, "source", "workflows", "workflow-default.json"), "utf8"));
  assert.equal(value.schemaVersion, 3);
  assert.equal(value.version, 4);
  for (const stage of Object.values(value.stages)) {
    assert.equal(stage.skillCalls.length, 1);
    assert.equal(stage.skillCalls[0].skill, "workflow-runner");
    assert.ok(stage.requiredArtifacts.some((entry) => entry.id === "execution-trace" && entry.contract === "execution-trace/v1"));
    assert.deepEqual(stage.skillCalls[0].artifactIds, stage.requiredArtifacts.filter((entry) => entry.required).map((entry) => entry.id));
  }
  assert.deepEqual(value.stages.acceptance.exitConditions.find((entry) => entry.id === "spec-compliant").requiredForOutcomes, ["accepted"]);
  assert.deepEqual(value.stages.acceptance.exitConditions.find((entry) => entry.id === "regression-safe").requiredForOutcomes, ["accepted"]);
});

test("temporary repository completes the Phase 1 remediation loop through both Human Gates", async () => {
  const cwd = await makeGitRepo();
  const value = {
    schemaVersion: 3,
    id: "phase-1-loop",
    version: 4,
    initialStage: "alignment",
    stages: {
      alignment: {
        goal: "Align",
        outcomes: ["ready"],
        exitConditions: [{ id: "intent-clear", description: "Intent is clear", required: true }],
        skillCalls: [],
        requiredArtifacts: [],
      },
      implementation: {
        goal: "Implement",
        outcomes: ["ready-for-acceptance"],
        exitConditions: [{ id: "focused-tests-passed", description: "Focused tests pass", required: true }],
        skillCalls: [],
        requiredArtifacts: [],
      },
      acceptance: {
        goal: "Accept",
        outcomes: ["accepted", "changes-requested"],
        exitConditions: [
          { id: "spec-compliant", description: "Specification passes", required: false, requiredForOutcomes: ["accepted"] },
          { id: "regression-safe", description: "Regressions pass", required: false, requiredForOutcomes: ["accepted"] },
          { id: "cleanup-complete", description: "Cleanup completes", required: true },
        ],
        skillCalls: [],
        requiredArtifacts: [],
      },
    },
    transitions: [
      { id: "alignment-ready", from: "alignment", on: "ready", to: "implementation", gate: { mode: "human", prompt: "Approve alignment", onReject: "alignment" } },
      { id: "implementation-ready", from: "implementation", on: "ready-for-acceptance", to: "acceptance", gate: { mode: "auto" } },
      { id: "acceptance-changes", from: "acceptance", on: "changes-requested", to: "implementation", gate: { mode: "auto" } },
      { id: "acceptance-accepted", from: "acceptance", on: "accepted", to: "complete", gate: { mode: "human", prompt: "Approve candidate", onReject: "implementation" } },
    ],
  };
  const writeResult = (file, result) => writeFile(join(cwd, file), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(join(cwd, "workflow.json"), `${JSON.stringify(value, null, 2)}\n`);
  await writeResult("alignment.json", {
    outcome: "ready", summary: "Aligned", conditions: [{ id: "intent-clear", status: "passed", evidenceRefs: ["note://intent"] }], skills: [], artifacts: [],
  });
  await writeResult("implementation.json", {
    outcome: "ready-for-acceptance", summary: "Implemented", conditions: [{ id: "focused-tests-passed", status: "passed", evidenceRefs: ["note://tests"] }], skills: [], artifacts: [],
  });
  await writeResult("changes.json", {
    outcome: "changes-requested", summary: "Needs repair", conditions: [
      { id: "spec-compliant", status: "failed", reason: "Mismatch", evidenceRefs: [] },
      { id: "regression-safe", status: "failed", reason: "Regression", evidenceRefs: [] },
      { id: "cleanup-complete", status: "passed", evidenceRefs: ["note://cleanup"] },
    ], skills: [], artifacts: [],
  });
  await writeResult("accepted.json", {
    outcome: "accepted", summary: "Accepted", conditions: [
      { id: "spec-compliant", status: "passed", evidenceRefs: ["note://spec"] },
      { id: "regression-safe", status: "passed", evidenceRefs: ["note://regression"] },
      { id: "cleanup-complete", status: "passed", evidenceRefs: ["note://cleanup"] },
    ], skills: [], artifacts: [],
  });

  let result = await runtimeCommand(cwd, { kind: "start", workflow: "workflow.json", intent: "Exercise Phase 1" });
  result = await runtimeCommand(cwd, { kind: "signal", revision: result.payload.revision, file: "alignment.json" });
  assert.equal(result.payload.status, "awaiting-human");
  result = await runtimeCommand(cwd, { kind: "decide", revision: result.payload.revision, action: "approve", reason: "Alignment approved" });
  assert.equal(result.payload.stage, "implementation");
  result = await runtimeCommand(cwd, { kind: "signal", revision: result.payload.revision, file: "implementation.json" });
  assert.equal(result.payload.stage, "acceptance");
  result = await runtimeCommand(cwd, { kind: "signal", revision: result.payload.revision, file: "changes.json" });
  assert.equal(result.payload.stage, "implementation");
  result = await runtimeCommand(cwd, { kind: "signal", revision: result.payload.revision, file: "implementation.json" });
  assert.equal(result.payload.stage, "acceptance");
  result = await runtimeCommand(cwd, { kind: "signal", revision: result.payload.revision, file: "accepted.json" });
  assert.equal(result.payload.status, "awaiting-human");
  result = await runtimeCommand(cwd, { kind: "decide", revision: result.payload.revision, action: "approve", reason: "Candidate approved" });
  assert.equal(result.payload.status, "idle");
  assert.equal(result.payload.last.outcome, "completed");
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
