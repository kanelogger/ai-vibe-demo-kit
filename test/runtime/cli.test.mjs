import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { completeEnvironmentTemplate, makeGitRepo, makeTemporaryDirectory, run, runRaw, stageResult, workflow } from "../helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceCli = join(sourceRoot, "harness");
const distributionCli = join(sourceRoot, "bin", "ai-vibe-demo-kit.mjs");

test("source and installed CLIs report release metadata outside a Git repository", async () => {
  const outside = await makeTemporaryDirectory("harness-version-cwd-");
  let result = await runRaw(process.execPath, [sourceCli, "version", "--json"], outside);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1,
    name: "ai-vibe-demo-kit",
    version: "0.5.1",
    minimumNodeVersion: "22",
  });

  const target = await makeGitRepo();
  result = await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const installed = JSON.parse(result.stdout);
  assert.equal(installed.status, "applied");
  assert.equal(installed.package.version, "0.5.1");
  result = await runRaw(join(target, "harness"), ["version", "--json"], outside);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).version, "0.5.1");
  result = await runRaw(join(target, "harness"), ["help"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /harness init/);
  result = await runRaw(join(target, "harness"), ["init", "--target", target, "--json"], target);
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).error.code, "E_USAGE");
});

test("version rejects an invalid installed manifest", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  await writeFile(join(target, ".harness", "manifest.json"), "{}\n");
  const result = await runRaw(join(target, "harness"), ["version", "--json"], target);
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).error.code, "E_MANIFEST_INVALID");
});

test("check-environment rejects the template and accepts a completed project copy", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);

  let result = await runRaw(join(target, "harness"), ["check-environment", "--file", "source/ai_environment_template.md", "--json"], target);
  assert.equal(result.code, 1);
  assert.ok(JSON.parse(result.stdout).errors.some((issue) => issue.code === "E_ENVIRONMENT_PLACEHOLDER"));

  const template = await readFile(join(target, "source", "ai_environment_template.md"), "utf8");
  const completed = completeEnvironmentTemplate(template);
  await writeFile(join(target, "AI_ENVIRONMENT.md"), completed);
  result = await runRaw(join(target, "harness"), ["check-environment", "--file", "AI_ENVIRONMENT.md", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).valid, true);
});

test("check-environment rejects an intermediate symlink path", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const template = await readFile(join(target, "source", "ai_environment_template.md"), "utf8");
  const completed = completeEnvironmentTemplate(template);
  await mkdir(join(target, "environment"));
  await writeFile(join(target, "environment", "AI_ENVIRONMENT.md"), completed);
  await symlink(join(target, "environment"), join(target, "environment-link"));

  const result = await runRaw(join(target, "harness"), ["check-environment", "--file", "environment-link/AI_ENVIRONMENT.md", "--json"], target);

  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).error.code, "E_PATH_SYMLINK");
});

test("fresh repository installs, checks, starts and advances through the public CLI", async () => {
  const target = await makeGitRepo();
  let result = await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  assert.equal(result.code, 0, result.stderr);

  result = await runRaw(join(target, "harness"), ["check", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).valid, true);

  const custom = workflow();
  await writeFile(join(target, "workflows", "custom.json"), `${JSON.stringify(custom, null, 2)}\n`);
  result = await runRaw(join(target, "harness"), ["check", "--workflow", "workflows/custom.json", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).valid, true);

  result = await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/custom.json", "--intent", "CLI tracer bullet", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).revision, 1);

  await writeFile(join(target, "result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);
  result = await runRaw(join(target, "harness"), ["signal", "--revision", "1", "--file", "result.json", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  let payload = JSON.parse(result.stdout);
  assert.equal(payload.stage, "build");
  assert.equal(payload.applied, true);
  assert.equal(payload.requiresHumanAction, false);
  result = await runRaw(join(target, "harness"), ["signal", "--revision", "1", "--file", "result.json", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "idempotent");
  assert.equal(payload.applied, false);
  assert.equal(payload.requiresHumanAction, false);
});

test("check-result validates completion evidence without an active work item", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const terminal = workflow();
  delete terminal.stages.build;
  terminal.transitions = [{ id: "align-ready", from: "align", on: "ready", to: "complete", gate: { mode: "human", prompt: "Accept", onReject: "align" } }];
  await writeFile(join(target, "workflows", "terminal.json"), `${JSON.stringify(terminal, null, 2)}\n`);
  await writeFile(join(target, "result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);

  const result = await runRaw(join(target, "harness"), [
    "check-result",
    "--workflow", "workflows/terminal.json",
    "--stage", "align",
    "--file", "result.json",
    "--require-complete",
    "--json",
  ], target);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    valid: true,
    policySatisfied: true,
    completionEligible: true,
    requiresHumanApproval: true,
    stage: "align",
    outcome: "ready",
    transition: { id: "align-ready", to: "complete", gate: "human" },
    policyFailures: [],
    errors: [],
    warnings: [],
  });
});

test("check-result returns gate refusal for structurally valid policy failures", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const terminal = workflow();
  delete terminal.stages.build;
  terminal.transitions = [{ id: "align-ready", from: "align", on: "ready", to: "complete", gate: { mode: "human", prompt: "Accept", onReject: "align" } }];
  await writeFile(join(target, "workflows", "terminal.json"), `${JSON.stringify(terminal, null, 2)}\n`);
  await writeFile(join(target, "result.json"), `${JSON.stringify(stageResult({
    conditions: [{ id: "intent-clear", status: "failed", reason: "Owner unavailable", evidenceRefs: [] }],
  }), null, 2)}\n`);

  const result = await runRaw(join(target, "harness"), [
    "check-result", "--workflow", "workflows/terminal.json", "--stage", "align", "--file", "result.json", "--require-complete", "--json",
  ], target);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.valid, true);
  assert.equal(payload.policySatisfied, false);
  assert.equal(payload.completionEligible, false);
  assert.deepEqual(payload.policyFailures, [{ id: "intent-clear", kind: "condition", status: "failed" }]);
});

test("check-result distinguishes non-terminal evidence from structural errors", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  await writeFile(join(target, "workflows", "custom.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  await writeFile(join(target, "result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);

  let result = await runRaw(join(target, "harness"), [
    "check-result", "--workflow", "workflows/custom.json", "--stage", "align", "--file", "result.json", "--require-complete", "--json",
  ], target);
  let payload = JSON.parse(result.stdout);
  assert.equal(result.code, 1);
  assert.equal(payload.valid, true);
  assert.equal(payload.policySatisfied, true);
  assert.equal(payload.completionEligible, false);

  await writeFile(join(target, "invalid-result.json"), `${JSON.stringify(stageResult({ conditions: [] }), null, 2)}\n`);
  result = await runRaw(join(target, "harness"), [
    "check-result", "--workflow", "workflows/custom.json", "--stage", "align", "--file", "invalid-result.json", "--json",
  ], target);
  payload = JSON.parse(result.stdout);
  assert.equal(result.code, 2);
  assert.equal(payload.valid, false);
  assert.ok(payload.errors.some((entry) => entry.code === "E_RESULT_CONDITION_MISSING"));
});

test("CLI returns stable JSON errors and exit codes", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const result = await runRaw(join(target, "harness"), ["status", "--json"], target);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).revision, 0);

  const invalid = await runRaw(join(target, "harness"), ["signal", "--revision", "0", "--file", "missing.json", "--json"], target);
  assert.equal(invalid.code, 2);
  assert.equal(JSON.parse(invalid.stdout).error.code, "E_IDLE");
});

test("CLI errors retain current state context and text output provides next commands", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  await writeFile(join(target, "workflows", "custom.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  await writeFile(join(target, "result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);
  await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/custom.json", "--intent", "Context", "--json"], target);

  const stale = await runRaw(join(target, "harness"), ["signal", "--revision", "0", "--file", "result.json", "--json"], target);
  const payload = JSON.parse(stale.stdout);
  assert.equal(stale.code, 2);
  assert.equal(payload.error.code, "E_STALE_REVISION");
  assert.equal(payload.revision, 1);
  assert.equal(payload.status, "active");
  assert.equal(payload.stage, "align");
  assert.ok(payload.allowedActions.includes("signal"));

  const status = await runRaw(join(target, "harness"), ["status"], target);
  assert.equal(status.code, 0, status.stderr);
  assert.match(status.stdout, /\.\/harness signal --revision 1 --file "<stage-result\.json>"/);
});

test("CLI rejects unknown options as usage errors", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const result = await runRaw(join(target, "harness"), ["status", "--unknown", "value", "--json"], target);
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).error.code, "E_USAGE");
});

test("CLI signal idempotency is scoped to the submitted base revision", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const terminal = workflow();
  delete terminal.stages.build;
  terminal.transitions = [{ id: "align-ready", from: "align", on: "ready", to: "complete", gate: { mode: "auto" } }];
  await writeFile(join(target, "workflows", "terminal.json"), `${JSON.stringify(terminal, null, 2)}\n`);
  await writeFile(join(target, "result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);
  await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/terminal.json", "--intent", "Terminal retry", "--json"], target);
  let result = await runRaw(join(target, "harness"), ["signal", "--revision", "1", "--file", "result.json", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).last.outcome, "completed");
  result = await runRaw(join(target, "harness"), ["signal", "--revision", "1", "--file", "result.json", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, "idempotent");
});

test("concurrent identical CLI signals converge on one accepted result", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  await writeFile(join(target, "workflows", "custom.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  await writeFile(join(target, "result.json"), `${JSON.stringify(stageResult(), null, 2)}\n`);
  await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/custom.json", "--intent", "Concurrent", "--json"], target);
  const args = ["signal", "--revision", "1", "--file", "result.json", "--json"];
  const results = await Promise.all([
    runRaw(join(target, "harness"), args, target),
    runRaw(join(target, "harness"), args, target),
  ]);
  assert.deepEqual(results.map((entry) => entry.code), [0, 0]);
  const decisions = results.map((entry) => JSON.parse(entry.stdout).decision).sort();
  assert.deepEqual(decisions, ["idempotent", "ready"]);
});

test("public CLI supports policy override, pause protection and human acceptance", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  await writeFile(join(target, "workflows", "custom.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  const failed = stageResult({
    conditions: [{ id: "intent-clear", status: "failed", reason: "Owner unavailable", evidenceRefs: [] }],
  });
  await writeFile(join(target, "failed.json"), `${JSON.stringify(failed, null, 2)}\n`);
  const done = stageResult({ outcome: "done", summary: "Built", conditions: [] });
  await writeFile(join(target, "done.json"), `${JSON.stringify(done, null, 2)}\n`);
  const worktreeBefore = await run("git", ["status", "--porcelain"], target);

  let result = await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/custom.json", "--intent", "Human control", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  const workId = JSON.parse(result.stdout).active.id;
  result = await runRaw(join(target, "harness"), ["signal", "--revision", "1", "--file", "failed.json", "--json"], target);
  assert.equal(result.code, 1);
  let payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "policy-blocked");
  assert.equal(payload.applied, true);
  assert.equal(payload.requiresHumanAction, true);

  result = await runRaw(join(target, "harness"), ["decide", "--revision", "2", "--action", "override", "--reason", "Prototype risk accepted", "--accept-risk", "intent-clear", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).stage, "build");

  result = await runRaw(join(target, "harness"), ["decide", "--revision", "3", "--action", "pause", "--reason", "Inspect", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  const stale = await runRaw(join(target, "harness"), ["signal", "--revision", "3", "--file", "failed.json", "--json"], target);
  assert.equal(stale.code, 2);
  assert.equal(JSON.parse(stale.stdout).error.code, "E_STALE_REVISION");
  await runRaw(join(target, "harness"), ["decide", "--revision", "4", "--action", "resume", "--reason", "Inspection complete", "--json"], target);

  result = await runRaw(join(target, "harness"), ["signal", "--revision", "5", "--file", "done.json", "--json"], target);
  assert.equal(result.code, 1);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "awaiting-human");
  assert.equal(payload.applied, true);
  assert.equal(payload.requiresHumanAction, true);
  result = await runRaw(join(target, "harness"), ["signal", "--revision", "5", "--file", "done.json", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "idempotent");
  assert.equal(payload.applied, false);
  assert.equal(payload.requiresHumanAction, true);
  result = await runRaw(join(target, "harness"), ["decide", "--revision", "6", "--action", "approve", "--reason", "Accept", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).last.outcome, "completed-with-override");

  const historyRoot = join(target, ".git", "harness", "history");
  const archived = JSON.parse(await readFile(join(historyRoot, `${workId}.json`), "utf8"));
  assert.equal(archived.outcome, "completed-with-override");
  assert.equal(await run("git", ["status", "--porcelain"], target), worktreeBefore);
});

test("signal validates contracted reports before mutating gate state", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const terminal = workflow();
  delete terminal.stages.build;
  terminal.stages.align.requiredArtifacts = [{ id: "report", required: true, contract: "verification-report/v1" }];
  terminal.transitions = [{ id: "align-ready", from: "align", on: "ready", to: "complete", gate: { mode: "human", prompt: "Accept", onReject: "align" } }];
  await writeFile(join(target, "workflows", "terminal.json"), `${JSON.stringify(terminal, null, 2)}\n`);
  await writeFile(join(target, "report.json"), "{}\n");
  await writeFile(join(target, "result.json"), `${JSON.stringify(stageResult({ artifacts: [{ id: "report", uri: "report.json" }] }), null, 2)}\n`);
  await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/terminal.json", "--intent", "Contract gate", "--json"], target);

  let result = await runRaw(join(target, "harness"), ["signal", "--revision", "1", "--file", "result.json", "--json"], target);
  let payload = JSON.parse(result.stdout);
  assert.equal(result.code, 2);
  assert.equal(payload.revision, 1);
  assert.equal(payload.status, "active");
  assert.equal(payload.error.code, "E_RESULT_INVALID");

  await writeFile(join(target, "evidence.txt"), "passed\n");
  await writeFile(join(target, "report.json"), `${JSON.stringify({
    schemaVersion: 1,
    summary: "Contract checks passed",
    conditions: [{ id: "intent-clear", status: "passed", checkRefs: ["contract-check"], cleanupRefs: ["none"], evidenceRefs: [] }],
    checks: [{ id: "contract-check", kind: "automated", command: "node --test", status: "passed", exitCode: 0, evidenceRefs: ["evidence.txt"] }],
    cleanup: [{ id: "none", resource: "temporary resources", action: "none created", status: "not-created", reason: "No resources created" }],
  }, null, 2)}\n`);
  result = await runRaw(join(target, "harness"), ["signal", "--revision", "1", "--file", "result.json", "--json"], target);
  payload = JSON.parse(result.stdout);
  assert.equal(result.code, 1);
  assert.equal(payload.revision, 2);
  assert.equal(payload.status, "awaiting-human");
  assert.equal(payload.requiresHumanAction, true);
});

test("workflow drift blocks signals but still allows abort", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const path = join(target, "workflows", "custom.json");
  const value = workflow();
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/custom.json", "--intent", "Drift", "--json"], target);
  value.description = "changed";
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  let result = await runRaw(join(target, "harness"), ["status", "--json"], target);
  assert.equal(JSON.parse(result.stdout).workflowDrift, true);
  result = await runRaw(join(target, "harness"), ["decide", "--revision", "1", "--action", "abort", "--reason", "Workflow changed", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).last.outcome, "aborted");
});

test("structurally invalid workflow exits with code 2", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  await writeFile(join(target, "workflows", "invalid.json"), JSON.stringify({ schemaVersion: 2 }));
  const result = await runRaw(join(target, "harness"), ["check", "--workflow", "workflows/invalid.json", "--json"], target);
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).valid, false);
});
