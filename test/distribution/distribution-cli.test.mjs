import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { completeEnvironmentTemplate, makeGitRepo, makeTemporaryDirectory, runRaw } from "../helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = join(sourceRoot, "bin", "ai-vibe-demo-kit.mjs");
const goldenRoot = join(sourceRoot, "test", "fixtures", "goldens");

async function runCli(target, args) {
  return runRaw(process.execPath, [cli, ...args, "--target", target, "--json"], sourceRoot);
}

async function install(target) {
  const result = await runCli(target, ["init"]);
  assert.equal(result.code, 0, result.stderr);
}

async function golden(name, result) {
  const payload = JSON.parse(result.stdout);
  const normalized = {
    status: payload.status,
    exitCode: result.code,
    readiness: payload.readiness,
    warningCodes: payload.warnings.map((entry) => entry.code).sort(),
    errorCodes: payload.errors.map((entry) => entry.code).sort(),
  };
  assert.deepEqual(normalized, JSON.parse(await readFile(join(goldenRoot, name), "utf8")));
}

test("Distribution version uses the stable envelope outside a Git repository", async () => {
  const result = await runRaw(process.execPath, [cli, "version", "--json"], sourceRoot);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1,
    command: "version",
    status: "ok",
    target: null,
    applied: false,
    package: { name: "ai-vibe-demo-kit", version: "0.4.0", installedVersion: null },
    transaction: null,
    changes: [],
    readiness: null,
    warnings: [],
    errors: [],
    nextActions: [],
  });
});

test("doctor JSON matches healthy and governance-incomplete goldens", async () => {
  const target = await makeGitRepo();
  await install(target);
  await golden("doctor-governance-incomplete.json", await runCli(target, ["doctor"]));

  await writeFile(join(target, "AGENTS.md"), "# Project Agent Instructions\n");
  const template = await readFile(join(target, "source", "ai_environment_template.md"), "utf8");
  await writeFile(join(target, "AI_ENVIRONMENT.md"), completeEnvironmentTemplate(template));
  await golden("doctor-ok.json", await runCli(target, ["doctor"]));
});

test("doctor JSON matches Runtime and completion tooling conflict goldens", async () => {
  const runtimeTarget = await makeGitRepo();
  await install(runtimeTarget);
  await writeFile(join(runtimeTarget, "harness"), "damaged\n");
  await golden("doctor-runtime-conflict.json", await runCli(runtimeTarget, ["doctor"]));

  const toolingTarget = await makeGitRepo();
  await install(toolingTarget);
  await unlink(join(toolingTarget, "source", "workflows", "stage-result-template.json"));
  await golden("doctor-completion-tooling-conflict.json", await runCli(toolingTarget, ["doctor"]));
});

test("upgrade and uninstall plan by default and reject unknown options", async () => {
  const target = await makeGitRepo();
  await install(target);
  let result = await runCli(target, ["upgrade"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "idempotent");
  result = await runCli(target, ["uninstall"]);
  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "planned");
  assert.equal(payload.applied, false);

  result = await runRaw(process.execPath, [cli, "doctor", "--unknown", "value", "--json"], target);
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).command, "doctor");
  assert.equal(JSON.parse(result.stdout).errors[0].code, "E_USAGE");
});

test("Distribution usage failures preserve the JSON envelope and parsed command", async () => {
  const target = await makeGitRepo();
  for (const args of [
    ["init", "--json", "--json"],
    ["init", "--target", "--json"],
  ]) {
    const result = await runRaw(process.execPath, [cli, ...args], target);
    assert.equal(result.code, 2);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.command, "init");
    assert.equal(payload.status, "error");
    assert.equal(payload.errors[0].code, "E_USAGE");
  }
});

test("Distribution status and exit mappings match the stable golden", async () => {
  const expected = JSON.parse(await readFile(join(goldenRoot, "distribution-statuses.json"), "utf8"));
  const normalize = (result) => {
    const payload = JSON.parse(result.stdout);
    return { status: payload.status, applied: payload.applied, exitCode: result.code };
  };
  const target = await makeGitRepo();
  let result = await runCli(target, ["init"]);
  assert.deepEqual(normalize(result), expected.applied);
  result = await runCli(target, ["init"]);
  assert.deepEqual(normalize(result), expected.idempotent);
  result = await runCli(target, ["uninstall"]);
  assert.deepEqual(normalize(result), expected.planned);

  await writeFile(join(target, "source", "agents_template.md"), "seed drift\n");
  result = await runCli(target, ["init"]);
  assert.deepEqual(normalize(result), expected.manual);

  const conflictTarget = await makeGitRepo();
  await writeFile(join(conflictTarget, "harness"), "occupied\n");
  result = await runCli(conflictTarget, ["init"]);
  assert.deepEqual(normalize(result), expected.conflict);

  const nonGit = await makeTemporaryDirectory("distribution-not-git-");
  result = await runCli(nonGit, ["doctor"]);
  assert.deepEqual(normalize(result), expected.error);
});

test("Distribution rejects a symlink passed as the lifecycle target", async (t) => {
  const target = await makeGitRepo();
  const link = `${target}-link`;
  await symlink(target, link, "dir");
  t.after(() => unlink(link).catch(() => {}));
  const result = await runCli(link, ["init"]);
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).errors[0].code, "E_PATH_SYMLINK");
});
