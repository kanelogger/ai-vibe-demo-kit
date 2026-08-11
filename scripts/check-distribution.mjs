#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDistributionManifest } from "../src/distribution/lifecycle.mjs";
import { loadHarnessManifest } from "../src/shared/manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
let distribution;

async function sourceFiles(path, prefix = "source") {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(join(path, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

try { distribution = await loadDistributionManifest(root); }
catch (error) { errors.push(`${error.code ?? "E_DISTRIBUTION"}: ${error.message}`); }

if (distribution) {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const runtime = await loadHarnessManifest(root);
  const declared = distribution.value.package;
  if (packageJson.name !== declared.name || runtime.name !== declared.name) errors.push("package names are inconsistent");
  if (JSON.stringify(packageJson.bin) !== JSON.stringify({ "ai-vibe-demo-kit": "bin/ai-vibe-demo-kit.mjs" })) errors.push("package must expose only the ai-vibe-demo-kit bin");
  if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) errors.push("production dependencies must remain empty");
  if (packageJson.version !== declared.version || runtime.version !== declared.version) errors.push("package versions are inconsistent");
  const engineMajor = /^>=([1-9]\d*)$/.exec(packageJson.engines?.node ?? "")?.[1] ?? null;
  if (engineMajor !== declared.minimumNodeVersion || runtime.minimumNodeVersion !== declared.minimumNodeVersion) errors.push("minimum Node.js versions are inconsistent");
  const self = distribution.value.files.filter((entry) => entry.sourcePath === "source/manifest.json" && entry.kind === "package-only" && entry.targetPath === null);
  if (self.length !== 1) errors.push("Distribution Manifest must register itself exactly once");
  const projection = distribution.value.files.map((entry) => entry.sourcePath);
  if (JSON.stringify(packageJson.files) !== JSON.stringify(projection)) errors.push("package.json#files is not the exact Distribution Manifest sourcePath projection");
  const declaredSource = projection.filter((path) => path.startsWith("source/")).sort();
  const actualSource = await sourceFiles(join(root, "source"));
  if (JSON.stringify(actualSource) !== JSON.stringify(declaredSource)) {
    const unexpected = actualSource.filter((path) => !declaredSource.includes(path));
    const missing = declaredSource.filter((path) => !actualSource.includes(path));
    errors.push(`Source tree mismatch: unexpected=${JSON.stringify(unexpected)} missing=${JSON.stringify(missing)}`);
  }
  for (const entry of distribution.value.files.filter((item) => item.sourcePath.startsWith("source/") && item.sourcePath !== "source/manifest.json")) {
    if (entry.targetPath !== entry.sourcePath || !new Set(["managed", "seed"]).has(entry.kind)) errors.push(`${entry.sourcePath} must project unchanged as lifecycle-owned Source`);
  }
  if (declaredSource.some((path) => path.startsWith("source/.agents/") && path !== "source/.agents/skills.sources.json")) {
    errors.push("source/.agents may contain only skills.sources.json");
  }
  try {
    const skillSources = JSON.parse(await readFile(join(root, "source", ".agents", "skills.sources.json"), "utf8"));
    if (!Array.isArray(skillSources.sources) || skillSources.sources.length === 0) errors.push("skills.sources.json requires a non-empty sources array");
    for (const source of skillSources.sources ?? []) {
      if (typeof source.repo !== "string" || source.repo.length === 0) errors.push("every Skill source requires a remote repository address");
      if (["resolved", "skills", "licenseFiles", "files"].some((key) => Object.hasOwn(source, key))) errors.push(`${source.id ?? "unknown Skill source"} embeds resolved or materialized Skill data`);
    }
  } catch (error) {
    errors.push(`skills.sources.json is invalid: ${error.message}`);
  }
  for (const entry of distribution.value.files) {
    try {
      const stat = await lstat(join(root, entry.sourcePath));
      if (stat.isSymbolicLink() || !stat.isFile()) errors.push(`${entry.sourcePath} is not a regular source file`);
      const mode = (stat.mode & 0o777).toString(8).padStart(4, "0");
      if (mode !== entry.mode) errors.push(`${entry.sourcePath} mode ${mode} does not match Manifest ${entry.mode}`);
    } catch (error) {
      errors.push(`${entry.sourcePath} cannot be read: ${error.message}`);
    }
  }
  try {
    const cache = await mkdtemp(join(tmpdir(), "ai-vibe-demo-kit-npm-"));
    let packed;
    try {
      packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, npm_config_cache: cache },
      }));
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
    const actual = packed[0].files.map((entry) => entry.path).sort();
    const expected = [...projection].sort();
    const unexpected = actual.filter((path) => !expected.includes(path));
    const missing = expected.filter((path) => !actual.includes(path));
    if (unexpected.length || missing.length) errors.push(`tarball mismatch: unexpected=${JSON.stringify(unexpected)} missing=${JSON.stringify(missing)}`);
  } catch (error) {
    errors.push(`npm pack --dry-run failed: ${error.message}`);
  }
}

if (errors.length) {
  process.stderr.write(`${errors.map((entry) => `ERROR ${entry}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write("distribution: valid\n");
