import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSkillsCommand } from "../src/distribution/skills-sync.mjs";
import { makeGitRepo, makeTemporaryDirectory, run } from "./helpers.mjs";

// Shared fixtures for Skills Module tests: local git upstreams (no network),
// a target repository with profiles/workflows/catalog/registry, and helpers to
// drive `skills sync/update` plus the Runtime CLI against it.

export const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const FIXTURE_SKILLS = ["to-spec", "diagnosing-bugs", "implement", "tdd", "code-review", "web-design", "baoyu-design", "architecture-diagram"];

export function skillDocument(name, { style = "plain", description = null, thirdField = true } = {}) {
  const desc = description ?? `${name} fixture skill.`;
  let descBlock;
  if (style === "folded") descBlock = `description: >\n  ${desc}\n  folded second line.`;
  else if (style === "folded-strip") descBlock = `description: >-\n  ${desc}\n  folded second line.`;
  else if (style === "literal") descBlock = `description: |\n  ${desc}\n  literal second line.`;
  else if (style === "literal-strip") descBlock = `description: |-\n  ${desc}\n  literal second line.`;
  else if (style === "quoted") descBlock = `description: "${desc}"`;
  else descBlock = `description: ${desc}`;
  const extra = thirdField ? `license: MIT\n` : "";
  return `---\nname: ${name}\n${descBlock}\n${extra}---\n\n# ${name}\n\nFixture body for ${name}.\n`;
}

// A local git upstream: skills/<name>/SKILL.md per skill (arbitrary-depth
// discovery via one nested path), plus a root LICENSE.
export async function makeUpstreamRepo({ skills = FIXTURE_SKILLS, documents = {}, license = "MIT fixture license\n" } = {}) {
  const root = await makeGitRepo();
  for (const name of skills) {
    const dir = name.includes("/") ? name : `skills/${name}`;
    await mkdir(join(root, dir), { recursive: true });
    await writeFile(join(root, dir, "SKILL.md"), documents[name] ?? skillDocument(name.split("/").at(-1)));
  }
  if (license) await writeFile(join(root, "LICENSE"), license);
  await run("git", ["add", "."], root);
  await run("git", ["commit", "-qm", "fixture skills"], root);
  return realpath(root);
}

export function fixtureRegistry(upstream, { only = FIXTURE_SKILLS, sources = null } = {}) {
  return {
    version: 2,
    description: "Fixture external Skill sources.",
    skillsRoot: ".agents/skills",
    sources: sources ?? [
      {
        id: "fixture-upstream",
        repo: upstream,
        path: "skills",
        track: { kind: "branch", value: "main" },
        ...(only ? { only: [...only].sort() } : {}),
      },
    ],
  };
}

async function copyRealWorkflows(target) {
  const names = ["profiles.json", "skills-list.json", "workflow-template.json", "workflow-bugfix.json", "workflow-web-ui.json", "workflow-visual-design.json", "stage-result-template.json", "verification-report-template.json"];
  await mkdir(join(target, "source", "workflows"), { recursive: true });
  for (const name of names) {
    await writeFile(join(target, "source", "workflows", name), await readFile(join(sourceRoot, "source", "workflows", name), "utf8"));
  }
}

// Rewrites the real Catalog so every lock-owned entry points at the fixture
// upstream source id; the bundled Skill entity is copied as-is.
export async function writeFixtureCatalog(target, { sourceId = "fixture-upstream" } = {}) {
  const catalog = JSON.parse(await readFile(join(sourceRoot, "source", "workflows", "skills-list.json"), "utf8"));
  for (const entry of catalog.skills) if (entry.availability === "lock-owned") entry.sourceId = sourceId;
  await writeFile(join(target, "source", "workflows", "skills-list.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  const bundled = join(target, ".agents", "skills", "ai-vibe-demo-kit");
  await mkdir(join(bundled, "agents"), { recursive: true });
  await writeFile(join(bundled, "SKILL.md"), await readFile(join(sourceRoot, ".agents", "skills", "ai-vibe-demo-kit", "SKILL.md"), "utf8"));
  await writeFile(join(bundled, "agents", "openai.yaml"), await readFile(join(sourceRoot, ".agents", "skills", "ai-vibe-demo-kit", "agents", "openai.yaml"), "utf8"));
}

// Target repo with profiles/workflows/catalog/registry at the root .agents
// basis. `update: true` resolves the fixture upstream and materializes.
export async function makeSkillsTarget({ registry, update = false, catalogSourceId = "fixture-upstream" } = {}) {
  const target = await makeGitRepo();
  await copyRealWorkflows(target);
  await writeFixtureCatalog(target, { sourceId: catalogSourceId });
  if (registry) {
    await mkdir(join(target, ".agents"), { recursive: true });
    await writeFile(join(target, ".agents", "skills.sources.json"), `${JSON.stringify(registry, null, 2)}\n`);
  }
  await run("git", ["add", "."], target);
  await run("git", ["commit", "-qm", "fixture target"], target);
  if (update) {
    const result = await runSkillsCommand({ root: target, action: "update", packageVersion: "0.6.0" });
    if (result.status !== "applied" && result.status !== "idempotent") throw new Error(`fixture update failed: ${JSON.stringify(result.errors)}`);
  }
  return realpath(target);
}

export async function skillsAction(target, action, { force = false } = {}) {
  return runSkillsCommand({ root: target, action, force, packageVersion: "0.6.0" });
}

export async function harness(target, args) {
  const { runRaw } = await import("./helpers.mjs");
  const cli = join(sourceRoot, "src", "runtime", "cli.mjs");
  const result = await runRaw(process.execPath, [cli, ...args], target);
  let payload = null;
  try { payload = JSON.parse(result.stdout); } catch { payload = null; }
  return { ...result, payload };
}

export async function makeEvidenceFile(target, relative, content = "evidence\n") {
  const path = join(target, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return relative;
}

// Builds a passing Stage Result for a workflow stage from its declarations.
// Optional skill calls are reported as skipped with a reason by default.
export function stageResultFor(stage, { outcome, skipOptional = true, evidence = "note://evidence" } = {}) {
  return {
    outcome,
    summary: `Stage completed with outcome ${outcome}`,
    conditions: (stage.exitConditions ?? []).map((condition) => ({ id: condition.id, status: "passed", evidenceRefs: [`note://${condition.id}`] })),
    skills: (stage.skillCalls ?? []).map((call) => {
      if (!call.required && skipOptional) return { id: call.id, status: "skipped", reason: "optional skill not materialized" };
      return { id: call.id, status: "succeeded", artifactRefs: call.artifactIds ?? [] };
    }),
    artifacts: (stage.requiredArtifacts ?? []).map((artifact) => ({ id: artifact.id, uri: artifact.contract ? null : `note://${artifact.id}` })),
  };
}

// verification-report/v1 artifacts must resolve to a real contract file whose
// conditions mirror the Stage Result.
export async function writeVerificationReport(target, relative, conditionIds, { evidenceRoot }) {
  const logRel = `${evidenceRoot}/full-suite.log`;
  await makeEvidenceFile(target, logRel, "tests: passed\n");
  const report = {
    schemaVersion: 1,
    summary: "Verification passed for the candidate",
    conditions: conditionIds.map((id) => ({ id, status: "passed", checkRefs: ["full-suite"], cleanupRefs: ["temporary-resources"], evidenceRefs: [] })),
    checks: [{ id: "full-suite", kind: "automated", command: "node --test test/runtime/*.test.mjs", status: "passed", exitCode: 0, evidenceRefs: [logRel] }],
    cleanup: [{ id: "temporary-resources", resource: "temporary repositories", action: "removed by helpers", status: "not-created", reason: "no persistent resource was created" }],
  };
  const path = join(target, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  return relative;
}

export async function writeStageResult(target, relative, result) {
  const path = join(target, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
  return relative;
}
