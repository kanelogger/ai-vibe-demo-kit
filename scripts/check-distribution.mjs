#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDistributionManifest } from "./harness/lib/lifecycle.mjs";
import { loadHarnessManifest } from "./harness/lib/manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
let distribution;

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
  const self = distribution.value.files.filter((entry) => entry.sourcePath === ".harness/distribution-manifest.json" && entry.kind === "package-only" && entry.targetPath === null);
  if (self.length !== 1) errors.push("Distribution Manifest must register itself exactly once");
  const projection = distribution.value.files.map((entry) => entry.sourcePath);
  if (JSON.stringify(packageJson.files) !== JSON.stringify(projection)) errors.push("package.json#files is not the exact Distribution Manifest sourcePath projection");
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
