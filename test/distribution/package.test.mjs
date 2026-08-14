import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGitRepo, makeTemporaryDirectory, runRaw } from "../helpers.mjs";

const sourceRoot = fileURLToPath(new URL("../..", import.meta.url));

test("CI pins the declared npm release version for every Node test job", async () => {
  const ci = await readFile(join(sourceRoot, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /npm install --global npm@11\.16\.0/);
  assert.match(ci, /npm --version/);
});

test("local tarball initializes a Git repository and exposes Runtime lifecycle plans", async () => {
  const packRoot = await makeTemporaryDirectory("ai-vibe-demo-kit-pack-");
  const installRoot = await makeTemporaryDirectory("ai-vibe-demo-kit-install-");
  const cacheRoot = await makeTemporaryDirectory("ai-vibe-demo-kit-npm-cache-");
  const env = { ...process.env, npm_config_cache: cacheRoot };
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packRoot], { cwd: sourceRoot, encoding: "utf8", env }));
  const tarball = join(packRoot, packed[0].filename);
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, tarball], { cwd: sourceRoot, encoding: "utf8", env });
  const distribution = join(installRoot, "node_modules", ".bin", "ai-vibe-demo-kit");
  const target = await makeGitRepo();

  const help = await runRaw(distribution, ["help"], sourceRoot);
  assert.match(help.stdout, /ai-vibe-demo-kit sync \[--target/);

  let result = await runRaw(distribution, ["init", "--target", target, "--json"], sourceRoot);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "applied");
  result = await runRaw(distribution, ["doctor", "--target", target, "--json"], sourceRoot);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).readiness.runtimeReady, true);
  result = await runRaw(join(target, "harness"), ["version", "--json"], target);
  assert.equal(JSON.parse(result.stdout).version, "0.6.0");
  result = await runRaw(join(target, "harness"), ["check", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  const sources = JSON.parse(await readFile(join(target, "source", ".agents", "skills.sources.json"), "utf8"));
  assert.ok(sources.sources.every((entry) => (
    typeof entry.repo === "string"
    && !["resolved", "skills", "licenseFiles", "files"].some((key) => Object.hasOwn(entry, key))
  )));
  await assert.rejects(readFile(join(target, "source", ".agents", "skills.lock.json")), { code: "ENOENT" });
  assert.match(await readFile(join(target, "source", "knowledge", "INDEX.md"), "utf8"), /Knowledge Index/);
  assert.match(await readFile(join(target, "source", "rules", "security.md"), "utf8"), /Security/);
  assert.match(await readFile(join(target, "source", "tools", "README.md"), "utf8"), /Governance Tools/);
  assert.match(await readFile(join(target, "source", "tools", "check-change-tests.mjs"), "utf8"), /checkChangeTests/);
  assert.equal(JSON.parse(await readFile(join(target, "source", "workflows", "test-impact-template.json"), "utf8")).schemaVersion, 1);
  assert.equal(JSON.parse(await readFile(join(target, "source", "workflows", "workflow-default.json"), "utf8")).version, 4);
  assert.equal(JSON.parse(await readFile(join(target, "source", "workflows", "execution-trace-template.json"), "utf8")).schemaVersion, 1);
  await assert.rejects(readFile(join(target, "workflows", "workflow-template.json")), { code: "ENOENT" });
  result = await runRaw(join(target, "harness"), ["status", "--json"], target);
  assert.equal(JSON.parse(result.stdout).status, "idle");
  result = await runRaw(distribution, ["upgrade", "--target", target, "--json"], sourceRoot);
  assert.equal(JSON.parse(result.stdout).status, "idempotent");
  result = await runRaw(distribution, ["uninstall", "--target", target, "--json"], sourceRoot);
  assert.equal(JSON.parse(result.stdout).status, "planned");
});
