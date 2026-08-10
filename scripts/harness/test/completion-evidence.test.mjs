import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { makeGitRepo, run, runRaw } from "./helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const distributionCli = join(sourceRoot, "bin", "ai-vibe-demo-kit.mjs");
const sourceChecker = join(sourceRoot, "scripts", "check-completion-evidence.mjs");

async function commitAll(root, subject) {
  await run("git", ["add", "."], root);
  await run("git", ["commit", "-qm", subject], root);
  return run("git", ["rev-parse", "HEAD"], root);
}

async function writeAcceptanceEvidence(root, workId, { skills = [{ id: "acceptance.harness-guide", status: "succeeded", artifactRefs: ["verification-report", "handoff"] }] } = {}) {
  const relativeRoot = `work/requirements/${workId}`;
  const evidenceRoot = join(root, relativeRoot);
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, "full-suite.log"), "tests: passed\n");
  await writeFile(join(evidenceRoot, "handoff.md"), "# Handoff\n\nVerified candidate.\n");
  await writeFile(join(evidenceRoot, "verification-report.json"), `${JSON.stringify({
    schemaVersion: 1,
    summary: "Specification, regression and cleanup checks passed",
    conditions: [
      { id: "spec-compliant", status: "passed", checkRefs: ["full-suite"], cleanupRefs: [], evidenceRefs: [] },
      { id: "regression-safe", status: "passed", checkRefs: ["full-suite"], cleanupRefs: [], evidenceRefs: [] },
      { id: "cleanup-complete", status: "passed", checkRefs: [], cleanupRefs: ["temporary-resources"], evidenceRefs: [] },
    ],
    checks: [{ id: "full-suite", kind: "automated", command: "node --test scripts/harness/test/*.test.mjs", status: "passed", exitCode: 0, evidenceRefs: [`${relativeRoot}/full-suite.log`] }],
    cleanup: [{ id: "temporary-resources", resource: "temporary test repositories and processes", action: "test helpers removed temporary resources", status: "not-created", reason: "No persistent repository resource was created" }],
  }, null, 2)}\n`);
  await writeFile(join(evidenceRoot, "acceptance-result.json"), `${JSON.stringify({
    outcome: "accepted",
    summary: "Candidate is ready for the final human gate",
    conditions: [
      { id: "spec-compliant", status: "passed", evidenceRefs: [`${relativeRoot}/verification-report.json`] },
      { id: "regression-safe", status: "passed", evidenceRefs: [`${relativeRoot}/verification-report.json`] },
      { id: "cleanup-complete", status: "passed", evidenceRefs: [`${relativeRoot}/verification-report.json`] },
    ],
    skills,
    artifacts: [
      { id: "verification-report", uri: `${relativeRoot}/verification-report.json` },
      { id: "handoff", uri: `${relativeRoot}/handoff.md` },
    ],
  }, null, 2)}\n`);
}

async function writeWorkSpecificWorkflow(root, workId) {
  const evidenceRoot = join(root, "work", "requirements", workId);
  await writeFile(join(evidenceRoot, "workflow.json"), `${JSON.stringify({
    schemaVersion: 2,
    id: `${workId}-workflow`,
    version: 1,
    initialStage: "acceptance",
    stages: {
      acceptance: {
        goal: "Verify the work-specific candidate",
        outcomes: ["accepted"],
        exitConditions: [
          { id: "spec-compliant", description: "Specification is satisfied", required: true },
          { id: "regression-safe", description: "Regression checks pass", required: true },
          { id: "cleanup-complete", description: "Verification resources are cleaned", required: true },
        ],
        skillCalls: [],
        requiredArtifacts: [
          { id: "verification-report", required: true, contract: "verification-report/v1" },
          { id: "handoff", required: true },
        ],
      },
    },
    transitions: [{
      id: "acceptance-complete",
      from: "acceptance",
      on: "accepted",
      to: "complete",
      gate: { mode: "human", prompt: "Accept", onReject: "acceptance" },
    }],
  }, null, 2)}\n`);
}

test("governed changes require a changed acceptance result", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const base = await commitAll(target, "chore: install harness");
  await writeFile(join(target, "README.md"), "# Governed change\n");
  const head = await commitAll(target, "docs: update readme");

  const result = await runRaw(process.execPath, [sourceChecker, base, head], target);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /governed changes require at least one changed acceptance result/);
});

test("governed changes pass with valid completion evidence", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const base = await commitAll(target, "chore: install harness");
  await writeFile(join(target, "README.md"), "# Governed change\n");
  await writeAcceptanceEvidence(target, "wi-valid");
  const head = await commitAll(target, "feat: add verified change");

  const result = await runRaw(process.execPath, [sourceChecker, base, head], target);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "completion evidence: valid (1)");
});

test("completion evidence uses a work-specific sibling Workflow when present", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const base = await commitAll(target, "chore: install harness");
  await writeFile(join(target, "README.md"), "# Work-specific governed change\n");
  await writeAcceptanceEvidence(target, "wi-specific", { skills: [] });
  await writeWorkSpecificWorkflow(target, "wi-specific");
  const head = await commitAll(target, "feat: add work-specific verified change");

  const result = await runRaw(process.execPath, [sourceChecker, base, head], target);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "completion evidence: valid (1)");
});

test("governed changes fail when changed completion evidence is invalid", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const base = await commitAll(target, "chore: install harness");
  await writeFile(join(target, "README.md"), "# Governed change\n");
  const evidenceRoot = join(target, "work", "requirements", "wi-invalid");
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, "acceptance-result.json"), "{}\n");
  const head = await commitAll(target, "feat: add invalid evidence");

  const result = await runRaw(process.execPath, [sourceChecker, base, head], target);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /completion evidence invalid/);
  assert.match(result.stderr, /E_RESULT_INVALID/);
});

test("evidence-only changes do not recursively require new completion evidence", async () => {
  const target = await makeGitRepo();
  await runRaw(process.execPath, [distributionCli, "init", "--target", target, "--json"], sourceRoot);
  const base = await commitAll(target, "chore: install harness");
  const evidenceRoot = join(target, "work", "requirements", "wi-notes");
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, "notes.md"), "Additional evidence context.\n");
  const head = await commitAll(target, "docs: add evidence context");

  const result = await runRaw(process.execPath, [sourceChecker, base, head], target);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "completion evidence: not required");
});
