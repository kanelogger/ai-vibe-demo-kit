import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repositoryPaths } from "../../src/shared/repository-guard.mjs";
import { fixtureRegistry, harness, makeSkillsTarget, makeUpstreamRepo, stageResultFor, writeStageResult } from "../skills-fixture.mjs";

async function startedTarget({ profile = "core", intent = "binding matrix" } = {}) {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  const started = await harness(target, ["start", "--profile", profile, "--intent", intent, "--json"]);
  assert.equal(started.code, 0, started.stderr);
  return target;
}

async function snapshotPrivateState(target) {
  const paths = await repositoryPaths(target);
  const control = await readFile(paths.controlPath, "utf8");
  const digest = createHash("sha256").update(control).digest("hex");
  const entries = await readdir(paths.controlDir);
  const historyBefore = await readdir(paths.historyDir).catch(() => []);
  return { digest, control, entries, historyBefore };
}

test("status reports binding fields and is side-effect-free in idle and active states", async () => {
  const target = await startedTarget();

  const before = await snapshotPrivateState(target);
  let status = await harness(target, ["status", "--json"]);
  const after = await snapshotPrivateState(target);
  assert.equal(status.code, 0);
  assert.equal(status.payload.bindingDrift, false);
  assert.deepEqual(status.payload.bindingIssues, []);
  assert.equal(status.payload.profileId, "core");
  assert.equal(status.payload.workflowRef, "source/workflows/workflow-template.json");
  assert.deepEqual(after, before, "status must never mutate private state");

  // active binding is recorded with profileId, workflowRef and digests
  const paths = await repositoryPaths(target);
  const control = JSON.parse(before.control);
  assert.equal(control.active.profileId, "core");
  assert.equal(control.active.workflowRef, "source/workflows/workflow-template.json");
  assert.match(control.active.bindingDigest, /^sha256:/);
  assert.match(control.active.bindingLockDigest, /^sha256:/);

  // idle: null binding fields and no drift
  const aborted = await harness(target, ["decide", "--revision", String(control.revision), "--action", "abort", "--actor", "Tester", "--reason", "close", "--json"]);
  assert.equal(aborted.code, 0);
  status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.profileId, null);
  assert.equal(status.payload.workflowRef, null);
  assert.equal(status.payload.bindingDrift, false);
});

test("binding drift matrix: unrelated profile changes never drift the Active binding", async () => {
  const target = await startedTarget();
  const profilesPath = join(target, "source", "workflows", "profiles.json");
  const profiles = JSON.parse(await readFile(profilesPath, "utf8"));
  profiles.profiles.push({ id: "extra", description: "New profile.", workflowRef: "source/workflows/workflow-template.json" });
  await writeFile(profilesPath, `${JSON.stringify(profiles, null, 2)}\n`);

  const status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.bindingDrift, false, "adding an unrelated Profile must not drift the binding");
  assert.deepEqual(status.payload.bindingIssues, []);
});

test("binding drift matrix: current Profile, Workflow, Catalog, registry and entities drift", async () => {
  const target = await startedTarget();

  // workflow content change
  const workflowPath = join(target, "source", "workflows", "workflow-template.json");
  const workflowValue = JSON.parse(await readFile(workflowPath, "utf8"));
  workflowValue.description = "Edited after start.";
  await writeFile(workflowPath, `${JSON.stringify(workflowValue, null, 2)}\n`);
  let status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.bindingDrift, true);
  assert.equal(status.payload.workflowDrift, true);
  assert.ok(status.payload.bindingIssues.some((entry) => entry.code === "E_WORKFLOW_DRIFT"));
  assert.deepEqual(status.payload.allowedActions, ["abort"]);
  await writeFile(workflowPath, `${JSON.stringify({ ...workflowValue, description: "A lightweight control workflow for alignment, implementation and acceptance." }, null, 2)}\n`);

  // catalog content change
  const catalogPath = join(target, "source", "workflows", "skills-list.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  catalog.skills.find((entry) => entry.id === "to-spec").purpose = "Changed purpose.";
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.bindingDrift, true);
  assert.ok(status.payload.bindingIssues.some((entry) => entry.code === "E_BINDING_DRIFT"));
  await writeFile(catalogPath, `${JSON.stringify({ ...catalog, skills: catalog.skills.map((entry) => entry.id === "to-spec" ? { ...entry, purpose: "Turn a raw request into an observable specification during alignment." } : entry) }, null, 2)}\n`);

  // registry content change
  const registryPath = join(target, ".agents", "skills.sources.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  registry.description = "Edited registry.";
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.bindingDrift, true);
  await writeFile(registryPath, `${JSON.stringify({ ...registry, description: "Fixture external Skill sources." }, null, 2)}\n`);
  status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.bindingDrift, false, "restoring the exact bytes must clear the drift");

  // entity content change
  await writeFile(join(target, ".agents", "skills", "code-review", "SKILL.md"), "---\nname: code-review\ndescription: tampered.\n---\n\n# tampered\n");
  status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.bindingDrift, true);
});

test("signal and non-abort decide revalidate the binding; abort stays available", async () => {
  const target = await startedTarget();
  const control = JSON.parse((await readFile((await repositoryPaths(target)).controlPath, "utf8")));

  const alignment = JSON.parse(await readFile(join(target, "source", "workflows", "workflow-template.json"), "utf8")).stages.alignment;
  const result = stageResultFor(alignment, { outcome: "ready" });
  await writeStageResult(target, "work/requirements/binding/alignment.json", result);

  // clean signal reaches the human gate
  let signaled = await harness(target, ["signal", "--revision", String(control.revision), "--file", "work/requirements/binding/alignment.json", "--json"]);
  assert.equal(signaled.code, 1, "human gate returns exit 1");
  assert.equal(signaled.payload.status, "awaiting-human");
  assert.equal(signaled.payload.pendingGate.transitionId, "alignment-ready");

  // drift after the signal: approve is refused, abort still works
  await writeFile(join(target, "source", "workflows", "skills-list.json"), "{}");
  const drifted = await harness(target, ["status", "--json"]);
  assert.equal(drifted.payload.bindingDrift, true);

  const refused = await harness(target, ["decide", "--revision", String(control.revision + 1), "--action", "approve", "--actor", "Tester", "--reason", "approve", "--json"]);
  assert.equal(refused.code, 2);
  assert.ok(["E_BINDING_DRIFT", "E_WORKFLOW_INVALID"].includes(refused.payload.error.code));

  const aborted = await harness(target, ["decide", "--revision", String(control.revision + 1), "--action", "abort", "--actor", "Tester", "--reason", "drift", "--json"]);
  assert.equal(aborted.code, 0, aborted.stderr);
  assert.equal(aborted.payload.last.outcome, "aborted");
});

test("profile-bound actives reject explicit --workflow impersonation and mismatched profiles", async () => {
  const target = await startedTarget();

  let result = await harness(target, ["check", "--workflow", "source/workflows/workflow-template.json", "--json"]);
  assert.equal(result.code, 2);
  assert.equal(result.payload.error.code, "E_BINDING_MISMATCH");

  result = await harness(target, ["check", "--profile", "bugfix", "--json"]);
  assert.equal(result.code, 2);
  assert.equal(result.payload.error.code, "E_BINDING_MISMATCH");

  result = await harness(target, ["check", "--profile", "core", "--json"]);
  assert.equal(result.code, 0, result.stderr);

  result = await harness(target, ["check", "--json"]);
  assert.equal(result.code, 0, "selector-free check follows the Active binding");
});

test("workflow-bound actives accept their own workflow and drift on other files", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  const started = await harness(target, ["start", "--workflow", "source/workflows/workflow-template.json", "--intent", "workflow bound", "--json"]);
  assert.equal(started.code, 0, started.stderr);
  assert.equal(started.payload.active.profileId, null);

  let result = await harness(target, ["check", "--workflow", "source/workflows/workflow-template.json", "--json"]);
  assert.equal(result.code, 0, result.stderr);

  await writeFile(join(target, ".agents", "skills", "implement", "SKILL.md"), "---\nname: implement\ndescription: changed.\n---\n\n# changed\n");
  result = await harness(target, ["check", "--workflow", "source/workflows/workflow-template.json", "--json"]);
  assert.equal(result.code, 2, "Active binding drift is a state-level error");
  assert.ok(result.payload.errors.some((entry) => entry.code === "E_BINDING_DRIFT"));
});
