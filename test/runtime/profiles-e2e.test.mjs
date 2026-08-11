import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixtureRegistry, harness, makeSkillsTarget, makeUpstreamRepo, stageResultFor, writeStageResult, writeVerificationReport } from "../skills-fixture.mjs";

const OUTCOMES = { alignment: "ready", implementation: "ready-for-acceptance", acceptance: "accepted" };

async function runProfile(target, profile, { skipOptional = true } = {}) {
  const workflowRef = (await harness(target, ["profiles", "--json"])).payload.profiles.find((entry) => entry.id === profile).workflowRef;
  const workflowValue = JSON.parse(await readFile(join(target, workflowRef), "utf8"));
  const started = await harness(target, ["start", "--profile", profile, "--intent", `e2e ${profile}`, "--json"]);
  assert.equal(started.code, 0, started.stderr);
  assert.equal(started.payload.selection.profileId, profile);

  let revision = started.payload.revision;
  const evidence = `work/requirements/e2e-${profile}`;

  // alignment -> human gate
  const alignment = stageResultFor(workflowValue.stages.alignment, { outcome: OUTCOMES.alignment });
  await writeStageResult(target, `${evidence}/alignment.json`, alignment);
  let result = await harness(target, ["signal", "--revision", String(revision), "--file", `${evidence}/alignment.json`, "--json"]);
  assert.equal(result.code, 1, "alignment gate is human");
  assert.equal(result.payload.status, "awaiting-human");
  assert.equal(result.payload.stage, "alignment");
  revision = result.payload.revision;
  result = await harness(target, ["decide", "--revision", String(revision), "--action", "approve", "--actor", "E2E", "--reason", "confirm alignment", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.payload.stage, "implementation");
  revision = result.payload.revision;

  // implementation -> auto transition
  const implementation = stageResultFor(workflowValue.stages.implementation, { outcome: OUTCOMES.implementation, skipOptional });
  await writeStageResult(target, `${evidence}/implementation.json`, implementation);
  result = await harness(target, ["signal", "--revision", String(revision), "--file", `${evidence}/implementation.json`, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.payload.stage, "acceptance");
  revision = result.payload.revision;

  // acceptance -> stateless completion check -> human gate
  const acceptance = stageResultFor(workflowValue.stages.acceptance, { outcome: OUTCOMES.acceptance, skipOptional });
  acceptance.artifacts = (workflowValue.stages.acceptance.requiredArtifacts ?? []).map((artifact) => ({
    id: artifact.id,
    uri: artifact.contract ? `${evidence}/verification-report.json` : `note://${artifact.id}`,
  }));
  const conditionIds = (workflowValue.stages.acceptance.exitConditions ?? []).map((entry) => entry.id);
  await writeVerificationReport(target, `${evidence}/verification-report.json`, conditionIds, { evidenceRoot: evidence });
  await writeStageResult(target, `${evidence}/acceptance.json`, acceptance);

  const checked = await harness(target, ["check-result", "--profile", profile, "--stage", "acceptance", "--file", `${evidence}/acceptance.json`, "--require-complete", "--json"]);
  assert.equal(checked.code, 0, checked.stderr);
  assert.equal(checked.payload.completionEligible, true);
  assert.equal(checked.payload.policySatisfied, true);

  result = await harness(target, ["signal", "--revision", String(revision), "--file", `${evidence}/acceptance.json`, "--json"]);
  assert.equal(result.code, 1, "acceptance gate is human");
  assert.equal(result.payload.status, "awaiting-human");
  revision = result.payload.revision;
  result = await harness(target, ["decide", "--revision", String(revision), "--action", "approve", "--actor", "E2E", "--reason", "accept candidate", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.payload.status, "idle");
  assert.equal(result.payload.last.outcome, "completed");
  return workflowValue;
}

test("core profile completes the full workflow with stateless acceptance checks", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  await runProfile(target, "core");
});

test("bugfix profile completes the full workflow", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  await runProfile(target, "bugfix");
});

test("web-ui profile completes the full workflow", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  await runProfile(target, "web-ui");
});

test("visual-design profile completes with the optional skill skipped and recorded", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  // drop the optional architecture-diagram entity: start warns, receipts skip it
  await rm(join(target, ".agents", "skills", "architecture-diagram"), { recursive: true, force: true });
  const workflowValue = await runProfile(target, "visual-design", { skipOptional: true });
  const implementation = workflowValue.stages.implementation.skillCalls.find((call) => !call.required);
  assert.ok(implementation, "visual-design declares the optional architecture-diagram call");

  // optional drift also degrades to a warning, never a gate
  const second = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  await writeFile(join(second, ".agents", "skills", "architecture-diagram", "SKILL.md"), "---\nname: architecture-diagram\ndescription: drifted optional.\n---\n\n# drift\n");
  const started = await harness(second, ["start", "--profile", "visual-design", "--intent", "optional drift", "--json"]);
  assert.equal(started.code, 0, started.stderr);
  assert.ok(started.payload.warnings.some((entry) => entry.code === "W_SKILL_DRIFT"));
});

test("workflow-bound starts record null profileId and the same binding rules", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  const started = await harness(target, ["start", "--workflow", "source/workflows/workflow-bugfix.json", "--intent", "workflow bound e2e", "--json"]);
  assert.equal(started.code, 0, started.stderr);
  assert.equal(started.payload.active.profileId, null);
  const status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.profileId, null);
  assert.equal(status.payload.workflowRef, "source/workflows/workflow-bugfix.json");
  assert.equal(status.payload.bindingDrift, false);
});
