import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeGitRepo, stageResult, workflow } from "./helpers.mjs";
import { validateStageResult, validateStateAgainstWorkflow, validateWorkflow } from "../lib/validator.mjs";
import { applyControl, createIdleState } from "../lib/kernel.mjs";

test("a custom workflow with auto and human gates is valid", async () => {
  const root = await makeGitRepo();
  const report = await validateWorkflow(workflow(), { root });
  assert.deepEqual(report.errors, []);
  assert.equal(report.valid, true);
});

test("workflow validation reports duplicate transitions and unreachable stages", async () => {
  const value = workflow();
  value.stages.orphan = { goal: "Never reached", outcomes: ["done"] };
  value.transitions.push({ ...value.transitions[0], id: "duplicate-route" });
  const report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((issue) => issue.code === "E_TRANSITION_DUPLICATE"));
  assert.ok(report.errors.some((issue) => issue.code === "E_STAGE_UNREACHABLE"));
});

test("every declared outcome requires a transition", async () => {
  const value = workflow();
  value.stages.build.outcomes.push("retry");
  const report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.ok(report.errors.some((entry) => entry.code === "E_TRANSITION_MISSING"));
});

test("workflow skill references must exist in the configured catalog", async () => {
  const value = workflow({ skillsCatalogRef: "workflows/skills.json" });
  value.stages.align.skillCalls = [{ id: "spec", skill: "to-spec", required: true }];
  const root = await makeGitRepo();
  await writeFile(join(root, "workflows", "skills.json"), JSON.stringify({ skills: [{ id: "tdd" }] }));
  const report = await validateWorkflow(value, { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_SKILL_UNKNOWN"));
});

test("condition and required skill policy identifiers cannot collide", async () => {
  const value = workflow();
  value.stages.align.skillCalls = [{ id: "intent-clear", skill: "tdd", required: true }];
  const report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.ok(report.errors.some((issue) => issue.code === "E_POLICY_ID_DUPLICATE"));
});

test("workflow nested identifiers use the safe id alphabet", async () => {
  const value = workflow();
  value.stages.align.exitConditions[0].id = "$(unsafe)";
  value.transitions[0].id = "align ready";
  const report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.ok(report.errors.some((issue) => issue.code === "E_CONDITION_INVALID"));
  assert.ok(report.errors.some((issue) => issue.code === "E_TRANSITION_ID"));
});

test("stage result rejects missing local artifacts and accepts external references", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "spec", required: true }];
  let report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "spec", uri: "work/missing.md" }],
  }), { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_ARTIFACT_MISSING"));

  report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "spec", uri: "issue://tracker/123" }],
  }), { root });
  assert.deepEqual(report.errors, []);
});

test("stage result rejects symlink artifacts", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "spec", required: true }];
  await mkdir(join(root, "work"), { recursive: true });
  await writeFile(join(root, "outside.md"), "evidence");
  const { symlink } = await import("node:fs/promises");
  await symlink(join(root, "outside.md"), join(root, "work", "spec.md"));
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "spec", uri: "work/spec.md" }],
  }), { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_PATH_SYMLINK"));
});

test("stage result rejects repository escape paths", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "spec", required: true }];
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "spec", uri: "../outside.md" }],
  }), { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_PATH_OUTSIDE"));
});

test("condition evidence references reject missing files and malformed external URIs", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  let report = await validateStageResult(value, "align", stageResult({
    conditions: [{ id: "intent-clear", status: "passed", evidenceRefs: ["work/missing.md"] }],
  }), { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_EVIDENCE_MISSING"));

  report = await validateStageResult(value, "align", stageResult({
    conditions: [{ id: "intent-clear", status: "passed", evidenceRefs: ["https://"] }],
  }), { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_EVIDENCE_URI"));
});

test("skill artifact references must resolve and file URIs are rejected", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.skillCalls = [{ id: "spec", skill: "to-spec", required: true }];
  value.stages.align.requiredArtifacts = [{ id: "spec", required: true }];
  const report = await validateStageResult(value, "align", stageResult({
    skills: [{ id: "spec", status: "succeeded", artifactRefs: ["missing"] }],
    artifacts: [{ id: "spec", uri: "file:///tmp/spec.md" }],
  }), { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_ARTIFACT_REF"));
  assert.ok(report.errors.some((entry) => entry.code === "E_ARTIFACT_URI"));
});

test("active state must reference stages and transitions from its bound workflow", () => {
  const value = workflow();
  const state = applyControl({
    state: createIdleState(),
    workflow: value,
    command: { kind: "start", intent: "Validate", workflowRef: "workflows/test.json", workflowDigest: "sha256:test" },
    idFactory: () => "wi-state",
    now: () => "2026-08-08T12:00:00.000Z",
  }).state;
  state.active.stage = "unknown";
  state.active.status = "awaiting-human";
  state.active.pendingGate = { transitionId: "unknown" };
  const report = validateStateAgainstWorkflow(state, value);
  assert.ok(report.errors.some((entry) => entry.code === "E_STATE_STAGE"));
  assert.ok(report.errors.some((entry) => entry.code === "E_STATE_TRANSITION"));
});

test("active state pending data must match its status and transition", () => {
  const value = workflow();
  const state = applyControl({
    state: createIdleState(),
    workflow: value,
    command: { kind: "start", intent: "Validate", workflowRef: "workflows/test.json", workflowDigest: "sha256:test" },
    idFactory: () => "wi-state",
    now: () => "2026-08-08T12:00:00.000Z",
  }).state;
  state.active.status = "active";
  state.active.pendingGate = { transitionId: "build-done", resultId: "missing", prompt: "Wrong stage" };
  const report = validateStateAgainstWorkflow(state, value);
  assert.ok(report.errors.some((entry) => entry.code === "E_STATE_GATE"));
  assert.ok(report.errors.some((entry) => entry.code === "E_STATE_TRANSITION"));
});
