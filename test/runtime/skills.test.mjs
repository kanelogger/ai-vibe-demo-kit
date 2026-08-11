import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  expectedGitignore,
  externalSkillIdentity,
  inspectSkillsReadiness,
  parseExternalSkillDocument,
  parseSkillLockText,
  parseSkillRegistryText,
  registryMatchesLock,
  resolveSkillControlPaths,
} from "../../src/shared/skills.mjs";
import { serializeLock } from "../../src/distribution/skills-sync.mjs";
import { validateWorkflow } from "../../src/runtime/validation/index.mjs";
import { makeGitRepo, run, runRaw, workflow } from "../helpers.mjs";
import { FIXTURE_SKILLS, fixtureRegistry, harness, makeSkillsTarget, makeUpstreamRepo, skillDocument, skillsAction } from "../skills-fixture.mjs";

test("external SKILL.md parser accepts extra fields, quotes and block scalars", () => {
  const plain = parseExternalSkillDocument(skillDocument("to-spec"));
  assert.equal(plain.metadata.name, "to-spec");
  assert.equal(plain.metadata.description, "to-spec fixture skill.");
  assert.equal(plain.metadata.license, "MIT");
  assert.ok(plain.body.includes("# to-spec"));

  const folded = parseExternalSkillDocument(skillDocument("web-design", { style: "folded" }));
  assert.equal(folded.metadata.description, "web-design fixture skill. folded second line.\n");
  const foldedStrip = parseExternalSkillDocument(skillDocument("web-design", { style: "folded-strip" }));
  assert.equal(foldedStrip.metadata.description, "web-design fixture skill. folded second line.");
  const literal = parseExternalSkillDocument(skillDocument("baoyu-design", { style: "literal" }));
  assert.equal(literal.metadata.description, "baoyu-design fixture skill.\nliteral second line.\n");
  const literalStrip = parseExternalSkillDocument(skillDocument("baoyu-design", { style: "literal-strip" }));
  assert.equal(literalStrip.metadata.description, "baoyu-design fixture skill.\nliteral second line.");
  const quoted = parseExternalSkillDocument(skillDocument("tdd", { style: "quoted" }));
  assert.equal(quoted.metadata.description, "tdd fixture skill.");
});

test("external SKILL.md parser rejects duplicates, missing identity and bad indentation", () => {
  assert.equal(parseExternalSkillDocument("---\nname: a\nname: b\n---\nbody\n"), null);
  assert.equal(parseExternalSkillDocument("---\n  name: a\n---\nbody\n"), null);
  assert.equal(parseExternalSkillDocument("no frontmatter\n"), null);
  assert.equal(externalSkillIdentity("---\ndescription: x\n---\nbody\n").ok, false);
  assert.equal(externalSkillIdentity("---\nname: a\ndescription: \n---\nbody\n").ok, false);
  assert.equal(externalSkillIdentity(skillDocument("implement")).ok, true);
});

test("registry and lock schemas reject malformed shapes and match specs", async () => {
  assert.throws(() => parseSkillRegistryText("{"), { code: "E_SKILLS_REGISTRY_INVALID" });
  assert.throws(() => parseSkillRegistryText(JSON.stringify({ version: 1 })), { code: "E_SKILLS_REGISTRY_VERSION" });
  assert.throws(() => parseSkillRegistryText(JSON.stringify({ version: 2, skillsRoot: "elsewhere", sources: [] })), { code: "E_SKILLS_REGISTRY_INVALID" });
  assert.throws(() => parseSkillRegistryText(JSON.stringify({ version: 2, sources: [{ id: "x", repo: "https://u:p@example.com/r.git", path: ".", track: { kind: "branch", value: "main" } }] })), { code: "E_SKILLS_REGISTRY_INVALID" });
  assert.throws(() => parseSkillLockText(JSON.stringify({ version: 1 })), { code: "E_SKILLS_LOCK_VERSION" });

  const upstream = await makeUpstreamRepo();
  const registry = fixtureRegistry(upstream);
  const parsed = parseSkillRegistryText(JSON.stringify(registry));
  assert.equal(parsed.sources[0].only.join(","), [...FIXTURE_SKILLS].sort().join(","));
  const target = await makeSkillsTarget({ registry, update: true });
  const lock = parseSkillLockText(await readFile(join(target, ".agents", "skills.lock.json"), "utf8"));
  assert.equal(registryMatchesLock(parsed, lock), true);
  assert.equal(lock.sources.length, 1);
  assert.deepEqual(lock.sources[0].skills.map((entry) => entry.name), [...FIXTURE_SKILLS].sort());
  assert.equal(lock.sources[0].licenseFiles.length, 1);
  assert.equal(serializeLock(lock).endsWith("\n"), true);
});

test("discovery finds SKILL.md at arbitrary depth without rewriting upstream bytes", async () => {
  const documents = { "skills/nested/deep": skillDocument("deep-skill", { style: "literal-strip" }) };
  const upstream = await makeUpstreamRepo({ skills: ["skills/nested/deep"], documents });
  const registry = fixtureRegistry(upstream, { only: ["deep-skill"] });
  const target = await makeSkillsTarget({ registry, update: true });
  const materialized = await readFile(join(target, ".agents", "skills", "deep-skill", "SKILL.md"), "utf8");
  assert.equal(materialized, documents["skills/nested/deep"]);
  const lock = parseSkillLockText(await readFile(join(target, ".agents", "skills.lock.json"), "utf8"));
  assert.equal(lock.sources[0].skills[0].sourcePath, "nested/deep");
});

test("control path resolution honors ledger, package-source and root bases", async () => {
  const bare = await makeGitRepo();
  assert.equal((await resolveSkillControlPaths(bare)).basis, "root");

  const packaged = await makeGitRepo();
  await mkdir(join(packaged, "source"), { recursive: true });
  await writeFile(join(packaged, "source", "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    package: { name: "ai-vibe-demo-kit", version: "0.6.0", minimumNodeVersion: "22" },
    files: [{ sourcePath: "source/manifest.json", targetPath: null, kind: "package-only", mode: "0644" }],
  }));
  const packagedControl = await resolveSkillControlPaths(packaged);
  assert.equal(packagedControl.basis, "package-source");
  assert.equal(packagedControl.registryPath, "source/.agents/skills.sources.json");

  const installed = await makeGitRepo();
  await mkdir(join(installed, ".harness"), { recursive: true });
  await writeFile(join(installed, ".harness", "install-lock.json"), JSON.stringify({
    schemaVersion: 1,
    installationState: "installed",
    package: { name: "ai-vibe-demo-kit", version: "0.6.0" },
    createdDirectories: [],
    files: [],
  }));
  assert.equal((await resolveSkillControlPaths(installed)).basis, "install-ledger");
});

test("readiness tiers: missing registry is invalid, missing lock and drift are not-ready", async () => {
  const upstream = await makeUpstreamRepo();
  const registry = fixtureRegistry(upstream);

  const noRegistry = await makeSkillsTarget({ registry: null });
  let readiness = await inspectSkillsReadiness({
    root: noRegistry,
    workflow: JSON.parse(await readFile(join(noRegistry, "source", "workflows", "workflow-template.json"), "utf8")),
    catalog: JSON.parse(await readFile(join(noRegistry, "source", "workflows", "skills-list.json"), "utf8")),
  });
  assert.equal(readiness.valid, false);
  assert.equal(readiness.issues[0].code, "E_SKILLS_REGISTRY_MISSING");

  const noLock = await makeSkillsTarget({ registry });
  readiness = await inspectSkillsReadiness({
    root: noLock,
    workflow: JSON.parse(await readFile(join(noLock, "source", "workflows", "workflow-template.json"), "utf8")),
    catalog: JSON.parse(await readFile(join(noLock, "source", "workflows", "skills-list.json"), "utf8")),
  });
  assert.equal(readiness.valid, true);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.issues[0].code, "E_SKILLS_LOCK_MISSING");
  assert.match(readiness.issues[0].repair, /skills update/);

  const target = await makeSkillsTarget({ registry, update: true });
  const workflowValue = JSON.parse(await readFile(join(target, "source", "workflows", "workflow-template.json"), "utf8"));
  const catalog = JSON.parse(await readFile(join(target, "source", "workflows", "skills-list.json"), "utf8"));
  readiness = await inspectSkillsReadiness({ root: target, workflow: workflowValue, catalog });
  assert.equal(readiness.ready, true);

  // spec drift: registry and lock disagree -> update hint
  await writeFile(join(target, ".agents", "skills.sources.json"), JSON.stringify(fixtureRegistry(upstream, { only: ["to-spec"] }), null, 2));
  readiness = await inspectSkillsReadiness({ root: target, workflow: workflowValue, catalog });
  assert.equal(readiness.valid, true);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.issues[0].code, "E_SKILLS_LOCK_STALE");
  await writeFile(join(target, ".agents", "skills.sources.json"), JSON.stringify(registry, null, 2));

  // entity drift: required skill content changed -> sync hint
  await writeFile(join(target, ".agents", "skills", "to-spec", "SKILL.md"), "tampered\n");
  readiness = await inspectSkillsReadiness({ root: target, workflow: workflowValue, catalog });
  assert.equal(readiness.valid, true);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.issues[0].code, "E_SKILL_ENTITY_DRIFT");
  assert.match(readiness.issues[0].repair, /skills sync/);

  // unsafe materialization: symlink inside a skill -> invalid tier
  const healed = await skillsAction(target, "sync");
  assert.equal(healed.status, "applied");
  await symlink("../to-spec", join(target, ".agents", "skills", "implement", "linked"));
  readiness = await inspectSkillsReadiness({ root: target, workflow: workflowValue, catalog });
  assert.equal(readiness.valid, false);
  assert.equal(readiness.issues[0].code, "E_SKILL_TREE_UNSAFE");
});

test("name mismatch between SKILL.md and Catalog id is a structural error", async () => {
  const root = await makeGitRepo();
  const value = workflow({ skillsCatalogRef: "workflows/skills.json" });
  value.stages.align.skillCalls = [{ id: "guide", skill: "guide", required: true }];
  await writeFile(join(root, "workflows", "skills.json"), JSON.stringify({ skills: [{ id: "guide", availability: "lock-owned", skillRef: ".agents/skills/guide/SKILL.md", workflowStages: ["align"] }] }));
  await mkdir(join(root, ".agents", "skills", "guide"), { recursive: true });
  await writeFile(join(root, ".agents", "skills", "guide", "SKILL.md"), "---\nname: other\ndescription: Mismatch.\nextra: ok\n---\n\n# Other\n");
  const report = await validateWorkflow(value, { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_SKILL_ENTITY" && /must equal the Catalog id/.test(entry.message)));

  await writeFile(join(root, ".agents", "skills", "guide", "SKILL.md"), "---\nname: guide\ndescription: >-\n  Folded\n  description.\nextra: ok\n---\n\n# Guide\n");
  const valid = await validateWorkflow(value, { root });
  assert.equal(valid.valid, true);
});

test("skill call stage must be declared in the Catalog entry workflowStages", async () => {
  const root = await makeGitRepo();
  const value = workflow({ skillsCatalogRef: "workflows/skills.json" });
  value.stages.align.skillCalls = [{ id: "guide", skill: "guide", required: true }];
  await writeFile(join(root, "workflows", "skills.json"), JSON.stringify({ skills: [{ id: "guide", skillRef: ".agents/skills/guide/SKILL.md", workflowStages: ["build"] }] }));
  const report = await validateWorkflow(value, { root });
  assert.ok(report.errors.some((entry) => entry.code === "E_SKILL_STAGE"));
});

test("harness check exit codes follow the three readiness tiers", async () => {
  const upstream = await makeUpstreamRepo();
  const registry = fixtureRegistry(upstream);

  const missing = await makeSkillsTarget({ registry: null });
  let result = await harness(missing, ["check", "--json"]);
  assert.equal(result.code, 2);
  assert.equal(result.payload.valid, false);

  const unlocked = await makeSkillsTarget({ registry });
  result = await harness(unlocked, ["check", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.payload.valid, true);
  assert.equal(result.payload.skillsReadiness.ready, false);

  const ready = await makeSkillsTarget({ registry, update: true });
  result = await harness(ready, ["check", "--json"]);
  assert.equal(result.code, 0);
  assert.equal(result.payload.skillsReadiness.ready, true);
  assert.equal(result.payload.selection.profileId, "core");

  await writeFile(join(ready, ".agents", "skills", "implement", "SKILL.md"), "---\nname: implement\ndescription: tampered but valid frontmatter.\n---\n\n# tampered\n");
  result = await harness(ready, ["check", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.payload.skillsReadiness.issues[0].code, "E_SKILL_ENTITY_DRIFT");
});

test("start is gated by required skills while optional skills degrade to warnings", async () => {
  const upstream = await makeUpstreamRepo();
  const registry = fixtureRegistry(upstream);
  const target = await makeSkillsTarget({ registry });

  let result = await harness(target, ["start", "--profile", "core", "--intent", " gated ", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.payload.error.code, "E_SKILLS_NOT_READY");
  assert.match(result.payload.error.repair, /skills update/);

  const updated = await skillsAction(target, "update");
  assert.equal(updated.status, "applied");
  result = await harness(target, ["start", "--profile", "core", "--intent", "ungated", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.payload.selection.profileId, "core");

  // optional architecture-diagram missing in visual-design: warning, not a gate
  const optionalTarget = await makeSkillsTarget({ registry, update: true });
  const { rm } = await import("node:fs/promises");
  await rm(join(optionalTarget, ".agents", "skills", "architecture-diagram"), { recursive: true, force: true });
  result = await harness(optionalTarget, ["start", "--profile", "visual-design", "--intent", "optional missing", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.payload.warnings.some((entry) => entry.code === "W_SKILL_UNAVAILABLE"));
});

test("generated gitignore anchors lock-owned skills, provenance, staging and itself", async () => {
  const upstream = await makeUpstreamRepo();
  const target = await makeSkillsTarget({ registry: fixtureRegistry(upstream), update: true });
  const content = await readFile(join(target, ".agents", "skills", ".gitignore"), "utf8");
  assert.equal(content, expectedGitignore(FIXTURE_SKILLS));
  assert.ok(content.includes("!.gitignore"));
  assert.ok(content.includes("/.sources/"));
  assert.ok(content.includes("/.staging/"));

  const ignored = await runRaw("git", ["check-ignore", ".agents/skills/.sources", ".agents/skills/.staging", ".agents/skills/to-spec"], target);
  assert.equal(ignored.code, 0, ".sources, .staging and materialized skills must be ignored");
  const committable = await runRaw("git", ["check-ignore", ".agents/skills/.gitignore", ".agents/skills.sources.json", ".agents/skills.lock.json"], target);
  assert.equal(committable.code, 1, "registry, lock and the generated .gitignore must stay committable");
});
