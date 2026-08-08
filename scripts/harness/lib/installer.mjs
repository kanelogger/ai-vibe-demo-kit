import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { statePaths } from "./store.mjs";
import { fail } from "./errors.mjs";
import { loadHarnessManifest } from "./manifest.mjs";
import { firstSymlinkInPath, resolveInside } from "./path-safety.mjs";

const RUNTIME = [
  "harness",
  ".harness/README.md",
  ".harness/LICENSE",
  ".harness/CHANGELOG.md",
  ".harness/manifest.json",
  "bin/harness.mjs",
  "scripts/harness/lib/errors.mjs",
  "scripts/harness/lib/installer.mjs",
  "scripts/harness/lib/kernel.mjs",
  "scripts/harness/lib/manifest.mjs",
  "scripts/harness/lib/path-safety.mjs",
  "scripts/harness/lib/store.mjs",
  "scripts/harness/lib/validator.mjs",
  "scripts/harness/ARCHITECTURE.md",
  "workflows/workflow-template.json",
  "workflows/skills-list.json",
  "workflows/stage-result-template.json",
  "AGENTS_template.md",
  "CODING_AGENT_RULES_template.md",
  "project-template.yml",
  "SPECS/template.md",
];

async function destinationKind(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) return "symlink";
    if (stat.isFile()) return "file";
    return "other";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

export async function installHarness({ sourceRoot, targetRoot }) {
  const source = resolve(sourceRoot);
  const manifest = await loadHarnessManifest(source);
  const requestedTarget = resolve(targetRoot);
  try {
    if ((await lstat(requestedTarget)).isSymbolicLink()) fail("E_PATH_SYMLINK", "installation target must not be a symlink");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const target = (await statePaths(targetRoot)).root;
  const prepared = [];
  const conflicts = [];

  for (const relativePath of RUNTIME) {
    const from = resolveInside(source, relativePath);
    const to = resolveInside(target, relativePath);
    if (!from) fail("E_PATH_OUTSIDE", `installation path leaves target repository: ${resolve(source, relativePath)}`);
    if (!to) fail("E_PATH_OUTSIDE", `installation path leaves target repository: ${resolve(target, relativePath)}`);
    const content = await readFile(from);
    const linked = await firstSymlinkInPath(target, to);
    if (linked) {
      conflicts.push({ path: relativePath, reason: "symlink" });
      continue;
    }
    const kind = await destinationKind(to);
    if (kind === "symlink") conflicts.push({ path: relativePath, reason: "symlink" });
    else if (kind === "other") conflicts.push({ path: relativePath, reason: "not-a-file" });
    else if (kind === "file") {
      const existing = await readFile(to);
      if (!existing.equals(content)) conflicts.push({ path: relativePath, reason: "different-content" });
      else prepared.push({ relativePath, from, to, content, kind: "unchanged" });
    } else prepared.push({ relativePath, from, to, content, kind: "create" });
  }

  if (conflicts.length > 0) {
    let installedVersion = "unknown";
    try {
      installedVersion = (await loadHarnessManifest(target)).version;
    } catch (error) {
      if (error.code !== "E_MANIFEST_INVALID") throw error;
    }
    fail("E_INSTALL_CONFLICT", "installation preflight found conflicting paths", {
      facts: { sourceVersion: manifest.version, installedVersion, conflicts },
    });
  }
  const created = [];
  const unchanged = [];
  for (const entry of prepared) {
    if (entry.kind === "unchanged") {
      unchanged.push(entry.relativePath);
      continue;
    }
    await mkdir(dirname(entry.to), { recursive: true });
    await writeFile(entry.to, entry.content, { flag: "wx", mode: entry.relativePath === "harness" ? 0o755 : 0o644 });
    if (entry.relativePath === "harness") await chmod(entry.to, 0o755);
    created.push(entry.relativePath);
  }
  return { target, created, unchanged, version: 1, harnessVersion: manifest.version };
}
