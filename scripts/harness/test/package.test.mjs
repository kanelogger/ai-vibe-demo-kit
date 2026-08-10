import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { makeGitRepo, makeTemporaryDirectory, runRaw } from "./helpers.mjs";

const sourceRoot = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

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

  let result = await runRaw(distribution, ["init", "--target", target, "--json"], sourceRoot);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "applied");
  result = await runRaw(distribution, ["doctor", "--target", target, "--json"], sourceRoot);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).readiness.runtimeReady, true);
  result = await runRaw(join(target, "harness"), ["version", "--json"], target);
  assert.equal(JSON.parse(result.stdout).version, "0.4.0");
  result = await runRaw(join(target, "harness"), ["check", "--json"], target);
  assert.equal(result.code, 0, result.stderr);
  result = await runRaw(join(target, "harness"), ["status", "--json"], target);
  assert.equal(JSON.parse(result.stdout).status, "idle");
  result = await runRaw(distribution, ["upgrade", "--target", target, "--json"], sourceRoot);
  assert.equal(JSON.parse(result.stdout).status, "idempotent");
  result = await runRaw(distribution, ["uninstall", "--target", target, "--json"], sourceRoot);
  assert.equal(JSON.parse(result.stdout).status, "planned");
});
