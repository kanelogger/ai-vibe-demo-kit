import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { completeEnvironmentTemplate, makeGitRepo, stageResult, workflow } from "../helpers.mjs";
import { validateEnvironmentManifest, validateStageResult, validateStateAgainstWorkflow, validateWorkflow } from "../../src/runtime/validation/index.mjs";
import { applyControl, createIdleState } from "../../src/runtime/kernel.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("AI environment manifest validation rejects placeholders and incomplete checklists", async () => {
  const template = await readFile(join(sourceRoot, "source", "ai_environment_template.md"), "utf8");
  const report = validateEnvironmentManifest(template);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((issue) => issue.code === "E_ENVIRONMENT_PLACEHOLDER"));
  assert.ok(report.errors.some((issue) => issue.code === "E_ENVIRONMENT_CHECKLIST"));
});

test("AI environment manifest validation accepts a structurally complete copy", async () => {
  const template = await readFile(join(sourceRoot, "source", "ai_environment_template.md"), "utf8");
  const completed = completeEnvironmentTemplate(template);
  assert.deepEqual(validateEnvironmentManifest(completed), { valid: true, errors: [], warnings: [] });
});

test("AI environment manifest validation rejects a missing required section", async () => {
  const template = await readFile(join(sourceRoot, "source", "ai_environment_template.md"), "utf8");
  const incomplete = completeEnvironmentTemplate(template)
    .replace("## 10. Verification and Acceptance", "## Verification removed");
  const report = validateEnvironmentManifest(incomplete);
  assert.ok(report.errors.some((issue) => issue.code === "E_ENVIRONMENT_SECTION"));
});

test("AI environment manifest validation rejects unknown capability statuses", async () => {
  const template = await readFile(join(sourceRoot, "source", "ai_environment_template.md"), "utf8");
  const invalid = completeEnvironmentTemplate(template).replace("| healthy |", "| confirmed | ");
  const report = validateEnvironmentManifest(invalid);
  assert.ok(report.errors.some((issue) => issue.code === "E_ENVIRONMENT_CAPABILITY_STATUS"));
});

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

test("required Skill entities must be regular safe files with exact frontmatter", async () => {
  const root = await makeGitRepo();
  const value = workflow({ skillsCatalogRef: "workflows/skills.json" });
  value.stages.align.skillCalls = [{ id: "guide", skill: "guide", required: true }];
  await writeFile(join(root, "workflows", "skills.json"), JSON.stringify({ skills: [{ id: "guide", skillRef: ".agents/skills/guide/SKILL.md" }] }));

  let report = await validateWorkflow(value, { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_SKILL_ENTITY"));

  await mkdir(join(root, ".agents", "skills", "guide"), { recursive: true });
  await writeFile(join(root, ".agents", "skills", "guide", "SKILL.md"), "---\nname: guide\ndescription: Guide the workflow.\nmetadata: forbidden\n---\n\n# Guide\n");
  report = await validateWorkflow(value, { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_SKILL_ENTITY" && /only name and description/.test(entry.message)));

  await writeFile(join(root, ".agents", "skills", "guide", "SKILL.md"), "---\nname: guide\ndescription: Guide the workflow.\n---\n\n# Guide\n");
  report = await validateWorkflow(value, { root });
  assert.equal(report.valid, true);
});

test("optional missing Skill entities produce warnings without invalidating the Workflow", async () => {
  const root = await makeGitRepo();
  const value = workflow({ skillsCatalogRef: "workflows/skills.json" });
  value.stages.align.skillCalls = [{ id: "guide", skill: "guide", required: false }];
  await writeFile(join(root, "workflows", "skills.json"), JSON.stringify({ skills: [{ id: "guide", skillRef: ".agents/skills/guide/SKILL.md" }] }));
  const report = await validateWorkflow(value, { root });
  assert.equal(report.valid, true);
  assert.ok(report.warnings.some((entry) => entry.code === "W_SKILL_UNAVAILABLE"));
});

test("Skill artifactIds must be declared and covered by succeeded receipts", async () => {
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "spec", required: true }, { id: "note", required: true }];
  value.stages.align.skillCalls = [{ id: "guide", skill: "guide", required: true, artifactIds: ["spec"] }];
  let report = await validateWorkflow({ ...value, stages: { ...value.stages, align: { ...value.stages.align, skillCalls: [{ ...value.stages.align.skillCalls[0], artifactIds: ["unknown"] }] } } });
  assert.ok(report.errors.some((entry) => entry.code === "E_SKILL_ARTIFACT_UNKNOWN"));

  report = await validateStageResult(value, "align", stageResult({
    skills: [{ id: "guide", status: "succeeded", artifactRefs: ["note"] }],
    artifacts: [{ id: "spec", uri: "note://spec" }, { id: "note", uri: "note://note" }],
  }));
  assert.ok(report.errors.some((entry) => entry.code === "E_SKILL_ARTIFACT_REQUIRED"));

  report = await validateStageResult(value, "align", stageResult({
    skills: [{ id: "guide", status: "succeeded", artifactRefs: ["spec", "spec", "note"] }],
    artifacts: [{ id: "spec", uri: "note://spec" }, { id: "note", uri: "note://note" }],
  }));
  assert.ok(report.errors.some((entry) => entry.code === "E_RESULT_SKILL_ARTIFACT_DUPLICATE"));
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

test("workflow validation rejects unknown artifact contracts", async () => {
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "unknown/v1" }];
  const report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.ok(report.errors.some((issue) => issue.code === "E_ARTIFACT_CONTRACT"));
});

test("Workflow schema v3 validates outcome-aware required conditions while v2 stays strict", async () => {
  const value = workflow();
  value.stages.align.outcomes.push("changes-requested");
  value.transitions.push({ id: "align-changes", from: "align", on: "changes-requested", to: "build", gate: { mode: "auto" } });
  value.stages.align.exitConditions[0] = {
    ...value.stages.align.exitConditions[0],
    required: false,
    requiredForOutcomes: ["ready"],
  };

  let report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.ok(report.errors.some((entry) => entry.code === "E_CONDITION_OUTCOMES"));

  value.schemaVersion = 3;
  report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.equal(report.valid, true, JSON.stringify(report.errors));

  value.stages.align.exitConditions[0].requiredForOutcomes = ["unknown", "unknown"];
  report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.ok(report.errors.some((entry) => entry.code === "E_CONDITION_OUTCOME_UNKNOWN"));
  assert.ok(report.errors.some((entry) => entry.code === "E_CONDITION_OUTCOME_DUPLICATE"));
});

test("outcome-aware conditions permit remediation and still protect successful outcomes", async () => {
  const value = workflow();
  value.schemaVersion = 3;
  value.stages.align.outcomes = ["accepted", "changes-requested"];
  value.stages.align.exitConditions[0] = {
    ...value.stages.align.exitConditions[0],
    required: false,
    requiredForOutcomes: ["accepted"],
  };
  value.transitions = [
    { id: "align-accepted", from: "align", on: "accepted", to: "complete", gate: { mode: "human", prompt: "Accept" } },
    { id: "align-changes", from: "align", on: "changes-requested", to: "build", gate: { mode: "auto" } },
    { id: "build-done", from: "build", on: "done", to: "complete", gate: { mode: "human", prompt: "Accept" } },
  ];
  const failed = [{ id: "intent-clear", status: "failed", reason: "Candidate needs changes", evidenceRefs: [] }];

  let report = await validateStageResult(value, "align", stageResult({ outcome: "changes-requested", conditions: failed }));
  assert.deepEqual(report.policyFailures, []);

  report = await validateStageResult(value, "align", stageResult({ outcome: "accepted", conditions: failed }));
  assert.deepEqual(report.policyFailures, [{ id: "intent-clear", kind: "condition", status: "failed" }]);
});

function executionTrace(overrides = {}) {
  return {
    schemaVersion: 1,
    stage: "align",
    summary: "A failed specialist was replaced by a passing repository tool.",
    requirements: [{ id: "confirm-intent", description: "Produce observable alignment evidence." }],
    selections: [
      { id: "specialist", capability: "to-spec", kind: "skill", requirementRefs: ["confirm-intent"], reason: "Use the focused specification workflow first." },
      { id: "fallback", capability: "agent-native", kind: "agent", requirementRefs: ["confirm-intent"], reason: "Complete the evidence when the specialist fails." },
    ],
    executions: [
      { id: "attempt-1", selectionRef: "specialist", status: "failed", summary: "The specialist could not complete.", reason: "The capability returned an execution error." },
      { id: "attempt-2", selectionRef: "fallback", status: "succeeded", summary: "Alignment evidence was produced.", artifactRefs: ["spec"], evidenceRefs: ["evidence.log"] },
    ],
    residualRisks: [],
    ...overrides,
  };
}

async function validateTrace(root, trace) {
  const value = workflow();
  value.stages.align.requiredArtifacts = [
    { id: "spec", required: true },
    { id: "execution-trace", required: true, contract: "execution-trace/v1" },
  ];
  await writeFile(join(root, "spec.md"), "# Spec\n");
  await writeFile(join(root, "evidence.log"), "passed\n");
  await writeFile(join(root, "trace.json"), JSON.stringify(trace));
  return validateStageResult(value, "align", stageResult({
    artifacts: [
      { id: "spec", uri: "spec.md" },
      { id: "execution-trace", uri: "trace.json" },
    ],
  }), { root });
}

test("execution-trace/v1 accepts a failed capability followed by a successful fallback", async () => {
  const report = await validateTrace(await makeGitRepo(), executionTrace());
  assert.deepEqual(report.errors, []);
});

test("execution-trace/v1 rejects invalid stages, identifiers and references", async () => {
  let root = await makeGitRepo();
  let report = await validateTrace(root, executionTrace({ stage: "build" }));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_STAGE"));

  root = await makeGitRepo();
  report = await validateTrace(root, executionTrace({
    requirements: [
      { id: "duplicate", description: "First" },
      { id: "duplicate", description: "Second" },
    ],
    selections: [{ id: "selection", capability: "agent-native", kind: "agent", requirementRefs: ["missing"], reason: "Fallback" }],
    executions: [{ id: "execution", selectionRef: "missing", status: "succeeded", summary: "Done", artifactRefs: ["missing"], evidenceRefs: [] }],
  }));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_REQUIREMENT_DUPLICATE"));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_REQUIREMENT_REF"));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_SELECTION_REF"));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_ARTIFACT_REF"));
});

test("execution-trace/v1 rejects invalid execution semantics and self-reference", async () => {
  let root = await makeGitRepo();
  let report = await validateTrace(root, executionTrace({
    selections: [{ id: "selection", capability: "agent-native", kind: "unknown", requirementRefs: ["confirm-intent"], reason: "Fallback" }],
    executions: [{ id: "execution", selectionRef: "selection", status: "unknown", summary: "Done", artifactRefs: [], evidenceRefs: [] }],
  }));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_SELECTION"));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_EXECUTION"));

  root = await makeGitRepo();
  report = await validateTrace(root, executionTrace({
    selections: [{ id: "selection", capability: "agent-native", kind: "agent", requirementRefs: ["confirm-intent"], reason: "Fallback" }],
    executions: [{ id: "execution", selectionRef: "selection", status: "succeeded", summary: "Done", artifactRefs: ["execution-trace"], evidenceRefs: [] }],
  }));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_SELF_REFERENCE"));

  root = await makeGitRepo();
  report = await validateTrace(root, executionTrace({
    selections: [{ id: "selection", capability: "agent-native", kind: "agent", requirementRefs: ["confirm-intent"], reason: "Fallback" }],
    executions: [{ id: "execution", selectionRef: "selection", status: "failed", summary: "Failed", artifactRefs: [], evidenceRefs: [] }],
  }));
  assert.ok(report.errors.some((entry) => entry.code === "E_TRACE_EXECUTION" && /reason/.test(entry.message)));
});

test("execution-trace/v1 applies repository path safety to nested evidence", async () => {
  const root = await makeGitRepo();
  const report = await validateTrace(root, executionTrace({
    selections: [{ id: "selection", capability: "agent-native", kind: "agent", requirementRefs: ["confirm-intent"], reason: "Fallback" }],
    executions: [{ id: "execution", selectionRef: "selection", status: "succeeded", summary: "Done", artifactRefs: [], evidenceRefs: ["../outside.log"] }],
  }));
  assert.ok(report.errors.some((entry) => entry.code === "E_PATH_OUTSIDE"));
});

test("execution-trace/v1 rejects symlinks in nested evidence", async () => {
  const root = await makeGitRepo();
  const { symlink } = await import("node:fs/promises");
  await symlink("evidence.log", join(root, "linked-evidence.log"));
  const report = await validateTrace(root, executionTrace({
    selections: [{ id: "selection", capability: "agent-native", kind: "agent", requirementRefs: ["confirm-intent"], reason: "Fallback" }],
    executions: [{ id: "execution", selectionRef: "selection", status: "succeeded", summary: "Done", artifactRefs: [], evidenceRefs: ["linked-evidence.log"] }],
  }));
  assert.ok(report.errors.some((entry) => entry.code === "E_PATH_SYMLINK"));
});

test("dynamic domain capabilities belong in execution traces, not Stage Result receipts", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "spec", required: true }];
  let report = await validateStageResult(value, "align", stageResult({
    skills: [{ id: "domain.tdd", status: "succeeded", artifactRefs: ["spec"] }],
    artifacts: [{ id: "spec", uri: "note://spec" }],
  }), { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_RESULT_SKILL_UNKNOWN"));

  report = await validateTrace(root, executionTrace({
    selections: [{ id: "selection", capability: "tdd", kind: "skill", requirementRefs: ["confirm-intent"], reason: "Focused domain capability" }],
    executions: [{ id: "execution", selectionRef: "selection", status: "succeeded", summary: "Done", artifactRefs: ["spec"], evidenceRefs: [] }],
  }));
  assert.deepEqual(report.errors, []);
});

test("workflow validation accepts test-impact/v1 artifacts", async () => {
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "impact", required: true, contract: "test-impact/v1" }];
  const report = await validateWorkflow(value, { root: await makeGitRepo() });
  assert.equal(report.valid, true, JSON.stringify(report.errors));
});

test("test-impact/v1 accepts behavioral changes with synchronized tests and evidence", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "impact", required: true, contract: "test-impact/v1" }];
  await writeFile(join(root, "test.log"), "passed\n");
  await writeFile(join(root, "impact.json"), JSON.stringify({
    schemaVersion: 1,
    classification: "behavioral",
    summary: "Behavior and tests changed together",
    sourceChanges: [{ path: "src/feature.mjs", change: "modified" }],
    testChanges: [{ path: "test/feature.test.mjs", change: "modified" }],
    checks: [{ kind: "automated", command: "node --test", status: "passed", exitCode: 0, evidenceRefs: ["test.log"] }],
  }));
  const report = await validateStageResult(value, "align", stageResult({ artifacts: [{ id: "impact", uri: "impact.json" }] }), { root });
  assert.equal(report.valid, true, JSON.stringify(report.errors));
});

test("test-impact/v1 rejects behavioral omissions and unexplained non-behavioral changes", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "impact", required: true, contract: "test-impact/v1" }];
  await writeFile(join(root, "impact.json"), JSON.stringify({
    schemaVersion: 1,
    classification: "behavioral",
    summary: "Missing test coverage",
    sourceChanges: [{ path: "src/feature.mjs", change: "modified" }],
    testChanges: [],
    checks: [],
  }));
  let report = await validateStageResult(value, "align", stageResult({ artifacts: [{ id: "impact", uri: "impact.json" }] }), { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_TEST_IMPACT_BEHAVIORAL"));

  await writeFile(join(root, "impact.json"), JSON.stringify({
    schemaVersion: 1,
    classification: "non-behavioral",
    summary: "Documentation-only change",
    sourceChanges: [],
    testChanges: [],
    checks: [],
  }));
  report = await validateStageResult(value, "align", stageResult({ artifacts: [{ id: "impact", uri: "impact.json" }] }), { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_TEST_IMPACT_REASON"));
});

test("test-impact/v1 rejects checks that are not explicitly automated", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "impact", required: true, contract: "test-impact/v1" }];
  await writeFile(join(root, "test.log"), "passed\n");
  await writeFile(join(root, "impact.json"), JSON.stringify({
    schemaVersion: 1,
    classification: "behavioral",
    summary: "Behavior and tests changed together",
    sourceChanges: [{ path: "src/feature.mjs", change: "modified" }],
    testChanges: [{ path: "test/feature.test.mjs", change: "modified" }],
    checks: [{ kind: "manual", command: "node --test", status: "passed", exitCode: 0, evidenceRefs: ["test.log"] }],
  }));
  const report = await validateStageResult(value, "align", stageResult({ artifacts: [{ id: "impact", uri: "impact.json" }] }), { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_TEST_IMPACT_CHECK"));
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

test("contracted artifacts must be repository-local files", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "report", uri: "https://example.test/report.json" }],
  }), { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_ARTIFACT_CONTRACT_URI"));
});

test("verification report contract rejects malformed report content", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  await writeFile(join(root, "report.json"), "{}\n");
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "report", uri: "report.json" }],
  }), { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_VERIFICATION_REPORT"));
});

test("verification report conditions must match the stage result", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  await writeFile(join(root, "evidence.txt"), "observed\n");
  await writeFile(join(root, "report.json"), JSON.stringify({
    schemaVersion: 1,
    summary: "Checked",
    conditions: [{ id: "other", status: "passed", checkRefs: [], cleanupRefs: [], evidenceRefs: ["evidence.txt"] }],
    checks: [],
    cleanup: [{ id: "none", resource: "temporary resources", action: "none created", status: "not-created", reason: "The check created no resources" }],
  }));
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "report", uri: "report.json" }],
  }), { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_VERIFICATION_CONDITION"));
});

test("verification report validates automated check execution evidence", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  await writeFile(join(root, "evidence.txt"), "passed\n");
  await writeFile(join(root, "report.json"), JSON.stringify({
    schemaVersion: 1,
    summary: "Checked",
    conditions: [{ id: "intent-clear", status: "passed", checkRefs: ["automated"], cleanupRefs: [], evidenceRefs: [] }],
    checks: [{ id: "automated", kind: "automated", status: "passed", exitCode: 0, evidenceRefs: ["evidence.txt"] }],
    cleanup: [{ id: "none", resource: "temporary resources", action: "none created", status: "not-created", reason: "The check created no resources" }],
  }));
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "report", uri: "report.json" }],
  }), { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_VERIFICATION_CHECK"));
});

test("passed verification checks require a zero exit code", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  await writeFile(join(root, "evidence.txt"), "unexpected nonzero\n");
  await writeFile(join(root, "report.json"), JSON.stringify({
    schemaVersion: 1,
    summary: "Contradictory check",
    conditions: [{ id: "intent-clear", status: "passed", checkRefs: ["automated"], cleanupRefs: [], evidenceRefs: [] }],
    checks: [{ id: "automated", kind: "automated", command: "node --test", status: "passed", exitCode: 1, evidenceRefs: ["evidence.txt"] }],
    cleanup: [{ id: "none", resource: "temporary resources", action: "none created", status: "not-created", reason: "The check created no resources" }],
  }));
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "report", uri: "report.json" }],
  }), { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_VERIFICATION_CHECK"));
});

test("passed verification conditions cannot hide retained cleanup resources", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  await writeFile(join(root, "report.json"), JSON.stringify({
    schemaVersion: 1,
    summary: "Cleanup failed",
    conditions: [{ id: "intent-clear", status: "passed", checkRefs: [], cleanupRefs: ["database"], evidenceRefs: [] }],
    checks: [],
    cleanup: [{ id: "database", resource: "test database", action: "delete rows", status: "retained", reason: "Database unavailable" }],
  }));
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "report", uri: "report.json" }],
  }), { root });
  assert.ok(report.errors.some((issue) => issue.code === "E_VERIFICATION_CONDITION"));
});

test("verification report contract accepts consistent checks and cleanup", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  await writeFile(join(root, "evidence.txt"), "passed\n");
  await writeFile(join(root, "report.json"), JSON.stringify({
    schemaVersion: 1,
    summary: "All checks passed",
    conditions: [{ id: "intent-clear", status: "passed", checkRefs: ["automated"], cleanupRefs: ["none"], evidenceRefs: [] }],
    checks: [{ id: "automated", kind: "automated", command: "node --test", status: "passed", exitCode: 0, evidenceRefs: ["evidence.txt"] }],
    cleanup: [{ id: "none", resource: "temporary resources", action: "none created", status: "not-created", reason: "The check created no resources" }],
  }));
  const report = await validateStageResult(value, "align", stageResult({
    artifacts: [{ id: "report", uri: "report.json" }],
  }), { root });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.policyFailures, []);
});

test("consistent failed reports remain policy failures that humans can override", async () => {
  const root = await makeGitRepo();
  const value = workflow();
  value.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  await writeFile(join(root, "report.json"), JSON.stringify({
    schemaVersion: 1,
    summary: "Cleanup remains",
    conditions: [{ id: "intent-clear", status: "failed", checkRefs: ["automated"], cleanupRefs: ["database"], evidenceRefs: [], reason: "Verification and cleanup failed" }],
    checks: [{ id: "automated", kind: "automated", command: "node --test", status: "failed", exitCode: 1, evidenceRefs: [], reason: "Tests failed" }],
    cleanup: [{ id: "database", resource: "test database", action: "delete rows", status: "retained", reason: "Database unavailable" }],
  }));
  const report = await validateStageResult(value, "align", stageResult({
    conditions: [{ id: "intent-clear", status: "failed", reason: "Verification and cleanup failed", evidenceRefs: [] }],
    artifacts: [{ id: "report", uri: "report.json" }],
  }), { root });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.policyFailures, [{ id: "intent-clear", kind: "condition", status: "failed" }]);
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
