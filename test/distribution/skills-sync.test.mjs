import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSkillLockText } from "../../src/shared/skills.mjs";
import { run } from "../helpers.mjs";
import { fixtureRegistry, harness, makeSkillsTarget, makeUpstreamRepo, skillsAction } from "../skills-fixture.mjs";

test("sync is idempotent under the lock while update re-resolves and relocks", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  const lockBefore = await readFile(join(target, ".agents", "skills.lock.json"), "utf8");

  let result = await skillsAction(target, "sync");
  assert.equal(result.status, "idempotent");
  assert.equal(result.applied, false);

  // upstream advances: sync stays pinned to the lock, update follows the track
  await writeFile(join(upstream, "skills", "to-spec", "SKILL.md"), "---\nname: to-spec\ndescription: v2 fixture.\n---\n\n# v2\n");
  await run("git", ["add", "."], upstream);
  await run("git", ["commit", "-qm", "v2"], upstream);

  result = await skillsAction(target, "sync");
  assert.equal(result.status, "idempotent", "plain sync must not resolve track tips");
  assert.equal(await readFile(join(target, ".agents", "skills.lock.json"), "utf8"), lockBefore);

  result = await skillsAction(target, "update");
  assert.equal(result.status, "applied");
  const lockAfter = parseSkillLockText(await readFile(join(target, ".agents", "skills.lock.json"), "utf8"));
  assert.notEqual(lockAfter.sources[0].resolved, parseSkillLockText(lockBefore).sources[0].resolved);
  assert.match(await readFile(join(target, ".agents", "skills", "to-spec", "SKILL.md"), "utf8"), /v2 fixture/);

  result = await skillsAction(target, "update");
  assert.equal(result.status, "idempotent", "unchanged update is a no-op");
});

test("sync --force re-stages every source at the locked commit without rewriting resolved", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  const lockBefore = parseSkillLockText(await readFile(join(target, ".agents", "skills.lock.json"), "utf8"));

  await writeFile(join(target, ".agents", "skills", "to-spec", "SKILL.md"), "---\nname: to-spec\ndescription: drifted.\n---\n\n# drift\n");
  const result = await skillsAction(target, "sync", { force: true });
  assert.equal(result.status, "applied");
  const lockAfter = parseSkillLockText(await readFile(join(target, ".agents", "skills.lock.json"), "utf8"));
  assert.deepEqual(lockAfter, lockBefore, "sync --force never rewrites the lock");
  assert.ok(result.changes.some((entry) => entry.action === "replace" && entry.path === ".agents/skills/to-spec"), "drifted skill is restored");
  assert.equal(result.changes.filter((entry) => entry.action === "keep").length, 7, "untouched skills are re-verified at the locked commit");
  assert.match(await readFile(join(target, ".agents", "skills", "to-spec", "SKILL.md"), "utf8"), /fixture skill/);
});

test("update --force re-resolves every source and re-verifies all materializations", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });

  const result = await skillsAction(target, "update", { force: true });
  assert.equal(result.status, "applied");
  assert.equal(result.changes.length >= 8, true, "every lock-owned skill is re-staged and re-verified");
});

test("lock-first interruption drift heals through a later plain sync", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });

  // simulate an interrupted commit: lock intact, two entities missing, one drifted
  await rm(join(target, ".agents", "skills", "tdd"), { recursive: true, force: true });
  await rm(join(target, ".agents", "skills", "web-design"), { recursive: true, force: true });
  await writeFile(join(target, ".agents", "skills", "implement", "SKILL.md"), "---\nname: implement\ndescription: drifted.\n---\n\n# drift\n");

  let status = await skillsAction(target, "status");
  assert.equal(status.status, "manual-action-required");
  assert.equal(status.readiness.ready, false);
  assert.deepEqual(status.readiness.skills.filter((entry) => entry.state === "missing").map((entry) => entry.name).sort(), ["tdd", "web-design"]);
  assert.ok(status.readiness.skills.some((entry) => entry.name === "implement" && entry.state === "drifted"));

  const healed = await skillsAction(target, "sync");
  assert.equal(healed.status, "applied");
  status = await skillsAction(target, "status");
  assert.equal(status.status, "ok");
  assert.equal(status.readiness.ready, true);
  assert.match(await readFile(join(target, ".agents", "skills", "implement", "SKILL.md"), "utf8"), /fixture skill/);
});

test("unregistered directories are never overwritten and the bundled Skill is untouched", async () => {
  const upstream = await makeUpstreamRepo();
  const registry = fixtureRegistry(upstream);
  const target = await makeSkillsTarget({ registry });

  // an unregistered directory colliding with an incoming skill blocks the update
  await mkdir(join(target, ".agents", "skills", "to-spec"), { recursive: true });
  await writeFile(join(target, ".agents", "skills", "to-spec", "mine.txt"), "user content\n");
  const blocked = await skillsAction(target, "update");
  assert.equal(blocked.status, "conflict");
  assert.equal(blocked.errors[0].code, "E_SKILL_UNMANAGED_CONFLICT");
  assert.equal(await readFile(join(target, ".agents", "skills", "to-spec", "mine.txt"), "utf8"), "user content\n");
  await rm(join(target, ".agents", "skills", "to-spec"), { recursive: true, force: true });

  const bundledBefore = await readFile(join(target, ".agents", "skills", "ai-vibe-demo-kit", "SKILL.md"), "utf8");
  const updated = await skillsAction(target, "update");
  assert.equal(updated.status, "applied");
  assert.equal(await readFile(join(target, ".agents", "skills", "ai-vibe-demo-kit", "SKILL.md"), "utf8"), bundledBefore);
  const lock = parseSkillLockText(await readFile(join(target, ".agents", "skills.lock.json"), "utf8"));
  assert.ok(!lock.sources.some((source) => source.skills.some((skill) => skill.name === "ai-vibe-demo-kit")));

  // sibling unregistered directories survive every mutation
  await mkdir(join(target, ".agents", "skills", "user-skill"), { recursive: true });
  const forced = await skillsAction(target, "update", { force: true });
  assert.equal(forced.status, "applied");
  assert.equal((await lstat(join(target, ".agents", "skills", "user-skill"))).isDirectory(), true);
});

test("update is refused during an Active Work Item; restore-only sync requires the binding lock", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });

  const started = await harness(target, ["start", "--profile", "core", "--intent", "active rules", "--json"]);
  assert.equal(started.code, 0, started.stderr);

  let result = await skillsAction(target, "update");
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_SKILLS_ACTIVE");

  // restore-only sync with an untouched lock is allowed during Active
  result = await skillsAction(target, "sync");
  assert.equal(result.status, "idempotent");

  // manual lock edits break the binding: sync and update refuse, abort stays available
  const lockPath = join(target, ".agents", "skills.lock.json");
  const lock = parseSkillLockText(await readFile(lockPath, "utf8"));
  await writeFile(lockPath, `${JSON.stringify({ ...lock, sources: lock.sources.map((source) => ({ ...source, path: "skills/" })) }, null, 2)}\n`);

  result = await skillsAction(target, "sync");
  assert.equal(result.status, "manual-action-required");
  assert.equal(result.errors[0].code, "E_SKILLS_LOCK_STALE");

  const status = await harness(target, ["status", "--json"]);
  assert.equal(status.payload.bindingDrift, true);
  assert.deepEqual(status.payload.allowedActions, ["abort"]);

  const aborted = await harness(target, ["decide", "--revision", String(status.payload.revision), "--action", "abort", "--actor", "Tester", "--reason", "binding drift", "--json"]);
  assert.equal(aborted.code, 0, aborted.stderr);
  assert.equal(aborted.payload.last.outcome, "aborted");
});

test("update/start orderings: whoever mutates second sees the other", async () => {
  const upstream = await makeUpstreamRepo();
  const registry = fixtureRegistry(upstream);

  // start first: update refuses until the Work Item closes
  const startedFirst = await makeSkillsTarget({ registry, update: true });
  let started = await harness(startedFirst, ["start", "--profile", "core", "--intent", "first", "--json"]);
  assert.equal(started.code, 0);
  let result = await skillsAction(startedFirst, "update");
  assert.equal(result.status, "conflict");
  let status = await harness(startedFirst, ["status", "--json"]);
  const aborted = await harness(startedFirst, ["decide", "--revision", String(status.payload.revision), "--action", "abort", "--actor", "Tester", "--reason", "close", "--json"]);
  assert.equal(aborted.code, 0);
  result = await skillsAction(startedFirst, "update");
  assert.equal(result.status, "idempotent");

  // update first: start binds the fresh lock digest
  const updatedFirst = await makeSkillsTarget({ registry, update: true });
  result = await skillsAction(updatedFirst, "update", { force: true });
  assert.equal(result.status, "applied");
  started = await harness(updatedFirst, ["start", "--profile", "core", "--intent", "second", "--json"]);
  assert.equal(started.code, 0, started.stderr);
  status = await harness(updatedFirst, ["status", "--json"]);
  assert.equal(status.payload.bindingDrift, false);
});

test("concurrent skills mutations serialize through the RepositoryGuard", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  await rm(join(target, ".agents", "skills", "tdd"), { recursive: true, force: true });

  const [first, second] = await Promise.all([
    skillsAction(target, "sync"),
    skillsAction(target, "sync", { force: true }),
  ]);
  const outcomes = [first.status, second.status];
  assert.ok(outcomes.includes("applied"));
  const status = await skillsAction(target, "status");
  assert.equal(status.status, "ok");
  assert.equal(status.readiness.ready, true);
});
