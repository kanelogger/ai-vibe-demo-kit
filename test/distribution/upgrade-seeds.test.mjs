import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDistributionManifest, runDistributionCommand } from "../../src/distribution/lifecycle.mjs";
import { makeGitRepo, makeTemporaryDirectory } from "../helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

// A v0.5.0-shaped Distribution variant: no profiles, no lock seed, no new
// modules; skills.sources.json is managed at its legacy source path.
async function v05Variant() {
  const root = await makeTemporaryDirectory("v05-variant-");
  const source = await loadDistributionManifest(sourceRoot);
  for (const entry of source.value.files) {
    const target = join(root, entry.sourcePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourceRoot, entry.sourcePath), target);
  }
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  packageJson.version = "0.5.0";
  await writeFile(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  const runtime = JSON.parse(await readFile(join(root, ".harness", "manifest.json"), "utf8"));
  runtime.version = "0.5.0";
  runtime.capabilities.commands = runtime.capabilities.commands.filter((command) => command !== "profiles");
  await writeFile(join(root, ".harness", "manifest.json"), `${JSON.stringify(runtime, null, 2)}\n`);
  const manifestPath = join(root, "source", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.package.version = "0.5.0";
  const removed = new Set([
    "source/.agents/skills.lock.json",
    "source/workflows/profiles.json",
    "source/workflows/workflow-bugfix.json",
    "source/workflows/workflow-web-ui.json",
    "source/workflows/workflow-visual-design.json",
    "src/distribution/skills-sync.mjs",
    "src/runtime/selection.mjs",
    "src/shared/repo-io.mjs",
    "src/shared/skills.mjs",
  ]);
  manifest.files = manifest.files
    .filter((entry) => !removed.has(entry.sourcePath))
    .map((entry) => entry.sourcePath === "source/.agents/skills.sources.json"
      ? { ...entry, targetPath: "source/.agents/skills.sources.json", kind: "managed" }
      : entry);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return root;
}

test("v0.5 to v0.6 upgrade removes the exact legacy target and seeds the lock controls", async () => {
  const target = await makeGitRepo();
  const previous = await v05Variant();
  let result = await runDistributionCommand({ sourceRoot: previous, target, command: "init", apply: true });
  assert.equal(result.status, "applied");
  assert.equal((await lstat(join(target, "source", ".agents", "skills.sources.json"))).isFile(), true);
  await assert.rejects(lstat(join(target, "source", "workflows", "profiles.json")), { code: "ENOENT" });

  result = await runDistributionCommand({ sourceRoot, target, command: "upgrade", apply: true });
  assert.equal(result.status, "applied", JSON.stringify(result.errors));
  assert.equal((await lstat(join(target, ".agents", "skills.sources.json"))).isFile(), true, "sources.json seeds to root .agents");
  assert.equal((await lstat(join(target, ".agents", "skills.lock.json"))).isFile(), true, "lock seeds to root .agents");
  assert.equal((await lstat(join(target, "source", "workflows", "profiles.json"))).isFile(), true);
  await import("node:fs/promises").then(async ({ readFile: rf }) => {
    const ledger = JSON.parse(await rf(join(target, ".harness", "install-lock.json"), "utf8"));
    assert.equal(ledger.package.version, "0.6.0");
    assert.ok(!ledger.files.some((entry) => entry.path === "source/.agents/skills.sources.json"), "legacy managed target leaves the ledger");
    assert.ok(ledger.files.some((entry) => entry.path === ".agents/skills.sources.json" && entry.kind === "seed"));
    assert.ok(ledger.files.some((entry) => entry.path === ".agents/skills.lock.json" && entry.kind === "seed"));
    assert.ok(ledger.files.some((entry) => entry.path === "source/workflows/workflow-bugfix.json" && entry.kind === "managed"));
  });
});

test("v0.5 to v0.6 upgrade refuses user-modified legacy targets with zero writes", async () => {
  const target = await makeGitRepo();
  const previous = await v05Variant();
  await runDistributionCommand({ sourceRoot: previous, target, command: "init", apply: true });
  await writeFile(join(target, "source", ".agents", "skills.sources.json"), "user modified\n");

  const result = await runDistributionCommand({ sourceRoot, target, command: "upgrade", apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_INSTALL_CONFLICT");
  assert.equal(await readFile(join(target, "source", ".agents", "skills.sources.json"), "utf8"), "user modified\n");
  const { readFile: rf } = await import("node:fs/promises");
  const ledger = JSON.parse(await rf(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.package.version, "0.5.0", "no ledger write on conflict");
  await assert.rejects(lstat(join(target, ".agents", "skills.lock.json")), { code: "ENOENT" }, "no partial seed writes");
});
