import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProfiles, resolveWorkflowSelection, validateProfiles } from "../../src/runtime/selection.mjs";
import { makeGitRepo, runRaw } from "../helpers.mjs";
import { fixtureRegistry, harness, makeSkillsTarget, makeUpstreamRepo, skillsAction, sourceRoot } from "../skills-fixture.mjs";

function profilesValue(overrides = {}) {
  return {
    schemaVersion: 1,
    defaultProfile: "core",
    profiles: [
      { id: "core", description: "Core flow.", workflowRef: "source/workflows/workflow-template.json" },
      { id: "bugfix", description: "Bugfix flow.", workflowRef: "source/workflows/workflow-bugfix.json" },
    ],
    ...overrides,
  };
}

test("profiles schema enforces uniqueness, default presence and safe refs", () => {
  assert.equal(validateProfiles(null).valid, false);
  assert.equal(validateProfiles({}).valid, false);
  assert.equal(validateProfiles(profilesValue({ defaultProfile: "missing" })).valid, false);
  assert.equal(validateProfiles(profilesValue({ profiles: [{ id: "core", description: "a", workflowRef: "x" }, { id: "core", description: "b", workflowRef: "y" }] })).valid, false);
  assert.equal(validateProfiles(profilesValue({ profiles: [{ id: "core", description: "a", workflowRef: "../escape.json" }] })).valid, false);
  assert.equal(validateProfiles(profilesValue({ profiles: [{ id: "core", description: "", workflowRef: "x" }] })).valid, false);
  assert.equal(validateProfiles(profilesValue()).valid, true);
});

test("selection resolves default and explicit profiles, never both selectors", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream) });

  const core = await resolveWorkflowSelection({ root: target });
  assert.equal(core.profileId, "core");
  assert.equal(core.workflowRef, "source/workflows/workflow-template.json");

  const bugfix = await resolveWorkflowSelection({ root: target, profileId: "bugfix" });
  assert.equal(bugfix.workflowRef, "source/workflows/workflow-bugfix.json");

  await assert.rejects(resolveWorkflowSelection({ root: target, profileId: "unknown" }), { code: "E_PROFILE_UNKNOWN" });
  await assert.rejects(resolveWorkflowSelection({ root: target, profileId: "core", workflowRef: "x.json" }), { code: "E_USAGE" });

  const registry = await loadProfiles(target);
  assert.equal(registry.profiles.length, 4);
  assert.equal(registry.defaultProfile, "core");
});

test("explicit --workflow resolves without a profiles registry", async () => {
  const bare = await makeGitRepo();
  const selection = await resolveWorkflowSelection({ root: bare, workflowRef: "workflows/custom.json" });
  assert.equal(selection.profileId, null);
  assert.equal(selection.workflowRef, "workflows/custom.json");
});

test("harness profiles lists the registry and marks the default", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream) });
  const result = await harness(target, ["profiles", "--json"]);
  assert.equal(result.code, 0);
  assert.equal(result.payload.defaultProfile, "core");
  assert.equal(result.payload.profiles.length, 4);
  assert.equal(result.payload.profiles.find((entry) => entry.id === "core").default, true);
  assert.ok(result.payload.profiles.every((entry) => entry.workflowRef.startsWith("source/workflows/workflow-")));
});

test("check and start selector rules: mutex, explicit start, idle default", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });

  let result = await harness(target, ["check", "--profile", "core", "--workflow", "source/workflows/workflow-template.json", "--json"]);
  assert.equal(result.code, 2);
  assert.equal(result.payload.error.code, "E_USAGE");

  result = await harness(target, ["start", "--intent", "no selector", "--json"]);
  assert.equal(result.code, 2);
  assert.equal(result.payload.error.code, "E_USAGE");

  result = await harness(target, ["check", "--profile", "bugfix", "--json"]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.payload.selection, { profileId: "bugfix", workflowRef: "source/workflows/workflow-bugfix.json" });

  result = await harness(target, ["check", "--json"]);
  assert.equal(result.payload.selection.profileId, "core", "idle check defaults to the core Profile");
});

test("check-result is stateless and selector-equivalent", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  const { stageResultFor, writeStageResult } = await import("../skills-fixture.mjs");
  const workflowValue = JSON.parse(await readFile(join(target, "source", "workflows", "workflow-template.json"), "utf8"));
  const result = stageResultFor(workflowValue.stages.alignment, { outcome: "ready" });
  await writeStageResult(target, "work/requirements/fixture/alignment.json", result);

  const byProfile = await harness(target, ["check-result", "--profile", "core", "--stage", "alignment", "--file", "work/requirements/fixture/alignment.json", "--json"]);
  const byWorkflow = await harness(target, ["check-result", "--workflow", "source/workflows/workflow-template.json", "--stage", "alignment", "--file", "work/requirements/fixture/alignment.json", "--json"]);
  assert.equal(byProfile.code, 0, byProfile.stderr);
  assert.equal(byWorkflow.code, 0);
  assert.deepEqual({ ...byProfile.payload, warnings: [] }, { ...byWorkflow.payload, warnings: [] });
});

test("the distributed Catalog equals the union of Profile-referenced skills", async () => {
  const profiles = JSON.parse(await readFile(join(sourceRoot, "source", "workflows", "profiles.json"), "utf8"));
  const called = new Set();
  for (const profile of profiles.profiles) {
    const workflowValue = JSON.parse(await readFile(join(sourceRoot, profile.workflowRef), "utf8"));
    for (const stage of Object.values(workflowValue.stages)) for (const call of stage.skillCalls ?? []) called.add(call.skill);
  }
  const catalog = JSON.parse(await readFile(join(sourceRoot, "source", "workflows", "skills-list.json"), "utf8"));
  assert.deepEqual([...catalog.skills.map((entry) => entry.id)].sort(), [...called].sort());
  assert.equal(catalog.skills.length, 9);
  assert.equal(catalog.skills.filter((entry) => entry.availability === "lock-owned").length, 8);
});

test("cli exposes profiles in help and capabilities stay in sync", async () => {
  const cli = join(sourceRoot, "src", "runtime", "cli.mjs");
  const help = await runRaw(process.execPath, [cli, "help"], await makeGitRepo());
  assert.match(help.stdout, /harness profiles/);
  assert.match(help.stdout, /--profile <id> \| --workflow <path>/);
});
