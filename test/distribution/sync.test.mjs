import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDistributionCommand } from "../../src/distribution/lifecycle.mjs";
import { compareSemver, createNpmSyncAdapter } from "../../src/distribution/sync.mjs";
import { makeGitRepo, makeTemporaryDirectory, runRaw } from "../helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CURRENT_VERSION = "0.6.0";

function fakeAdapter(version, payloadFor, calls = []) {
  return {
    async resolveLatestVersion() { return version; },
    async runPinnedUpgrade(options) {
      calls.push(options);
      return { exitCode: 0, payload: payloadFor(options) };
    },
  };
}

function upgradeEnvelope(version, target, overrides = {}) {
  return {
    schemaVersion: 1,
    command: "upgrade",
    status: "planned",
    target,
    applied: false,
    package: { name: "ai-vibe-demo-kit", version, installedVersion: CURRENT_VERSION },
    transaction: null,
    changes: [{ action: "replace", path: "harness" }],
    readiness: null,
    warnings: [],
    errors: [],
    nextActions: [],
    ...overrides,
  };
}

function assertSyncEnvelope(result, target, installedVersion) {
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.command, "sync");
  assert.equal(result.target, target);
  assert.deepEqual(result.package, { name: "ai-vibe-demo-kit", version: CURRENT_VERSION, installedVersion });
  assert.equal(result.transaction, null);
}

test("SemVer comparison follows precedence including prerelease and build metadata", () => {
  assert.equal(compareSemver("0.5.1", "0.5.1-beta.2"), 1);
  assert.equal(compareSemver("1.0.0-alpha.2", "1.0.0-alpha.10"), -1);
  assert.equal(compareSemver("1.0.0-1", "1.0.0-alpha"), -1);
  assert.equal(compareSemver("1.0.0-alpha", "1.0.0-alpha.1"), -1);
  assert.equal(compareSemver("1.0.0+left", "1.0.0+right"), 0);
  assert.equal(compareSemver("999999999999999999999.0.0", "2.0.0"), 1);
  assert.throws(() => compareSemver("1.0.0-01", "1.0.0"), { code: "E_REGISTRY_RESPONSE" });
});

test("sync distinguishes missing and invalid ledgers without delegation", async () => {
  const missing = await makeGitRepo();
  let delegated = false;
  const adapter = fakeAdapter("0.6.0", () => { delegated = true; });
  let result = await runDistributionCommand({ sourceRoot, target: missing, command: "sync", syncAdapter: adapter });
  assertSyncEnvelope(result, missing, null);
  assert.equal(result.status, "manual-action-required");
  assert.equal(result.update.relation, "not-installed");
  assert.match(result.nextActions[0], /ai-vibe-demo-kit@0\.6\.0/);
  assert.equal(delegated, false);

  const invalid = await makeGitRepo();
  await mkdir(join(invalid, ".harness"), { recursive: true });
  await writeFile(join(invalid, ".harness", "install-lock.json"), "{}\n");
  result = await runDistributionCommand({ sourceRoot, target: invalid, command: "sync", syncAdapter: adapter });
  assertSyncEnvelope(result, invalid, null);
  assert.equal(result.status, "conflict");
  assert.equal(result.update.relation, "invalid-ledger");
  assert.equal(result.errors[0].code, "E_LEDGER_INVALID");
  assert.equal(result.nextActions.length, 0);
});

test("sync blocks prerelease downgrade before delegation", async () => {
  const target = await makeGitRepo();
  await runDistributionCommand({ sourceRoot, target, command: "init", apply: true });
  let delegated = false;
  const adapter = fakeAdapter("0.5.1-beta.2", () => { delegated = true; });
  const result = await runDistributionCommand({ sourceRoot, target, command: "sync", syncAdapter: adapter });
  assertSyncEnvelope(result, target, CURRENT_VERSION);
  assert.equal(result.status, "manual-action-required");
  assert.equal(result.update.relation, "newer");
  assert.equal(result.warnings[0].code, "W_INSTALLED_VERSION_AHEAD");
  assert.equal(delegated, false);
});

test("sync delegates when the installed version equals npm latest", async () => {
  const target = await makeGitRepo();
  await runDistributionCommand({ sourceRoot, target, command: "init", apply: true });
  const calls = [];
  const adapter = fakeAdapter(CURRENT_VERSION, ({ version, gitRoot }) => upgradeEnvelope(version, gitRoot, { status: "idempotent", changes: [] }), calls);
  const result = await runDistributionCommand({ sourceRoot, target, command: "sync", syncAdapter: adapter });
  assertSyncEnvelope(result, target, CURRENT_VERSION);
  assert.equal(result.status, "idempotent");
  assert.equal(result.update.relation, "equal");
  assert.deepEqual(calls, [{ version: CURRENT_VERSION, gitRoot: target, apply: false }]);
});

test("sync delegates a pinned JSON upgrade against the canonical Git root", async () => {
  const target = await makeGitRepo();
  await runDistributionCommand({ sourceRoot, target, command: "init", apply: true });
  const child = join(target, "nested");
  await mkdir(child);
  const calls = [];
  const adapter = fakeAdapter("0.7.0", ({ version, gitRoot }) => upgradeEnvelope(version, gitRoot), calls);
  const result = await runDistributionCommand({ sourceRoot, target: child, command: "sync", syncAdapter: adapter });
  assert.equal(result.command, "sync");
  assert.equal(result.target, target);
  assert.equal(result.package.version, CURRENT_VERSION);
  assert.equal(result.update.relation, "older");
  assert.deepEqual(calls, [{ version: "0.7.0", gitRoot: target, apply: false }]);
  assert.match(result.nextActions[0], /ai-vibe-demo-kit@0\.7\.0/);
});

test("sync rejects a delegated Envelope that does not match the pinned request", async () => {
  const target = await makeGitRepo();
  await runDistributionCommand({ sourceRoot, target, command: "init", apply: true });
  const adapter = fakeAdapter("0.6.0", ({ version, gitRoot }) => upgradeEnvelope(version, `${gitRoot}-other`));
  const result = await runDistributionCommand({ sourceRoot, target, command: "sync", syncAdapter: adapter });
  assert.equal(result.status, "error");
  assert.equal(result.errors[0].code, "E_DELEGATE_PROTOCOL");
});

test("sync apply delegates the pinned version with apply enabled", async () => {
  const target = await makeGitRepo();
  await runDistributionCommand({ sourceRoot, target, command: "init", apply: true });
  const calls = [];
  const adapter = fakeAdapter("0.6.0", ({ version, gitRoot }) => upgradeEnvelope(version, gitRoot, { status: "applied", applied: true, changes: [] }), calls);
  const result = await runDistributionCommand({ sourceRoot, target, command: "sync", apply: true, syncAdapter: adapter });
  assert.equal(result.status, "applied");
  assert.deepEqual(calls, [{ version: "0.6.0", gitRoot: target, apply: true }]);
  assert.deepEqual(result.nextActions, []);
});

test("npm adapter pins arguments and requires whole JSON stdout", async () => {
  const bin = await makeTemporaryDirectory("sync-bin-");
  const npm = join(bin, "npm");
  const npx = join(bin, "npx");
  const argsPath = join(bin, "args.txt");
  await writeFile(npm, "#!/bin/sh\nprintf '\"0.6.0\"\\n'\n", { mode: 0o755 });
  await writeFile(npx, "#!/bin/sh\nprintf 'noise\\n{}\\n'\n", { mode: 0o755 });
  const previousPath = process.env.PATH;
  const previousArgs = process.env.SYNC_ARGS_FILE;
  const previousTarget = process.env.SYNC_TARGET;
  process.env.PATH = `${bin}:${previousPath}`;
  process.env.SYNC_ARGS_FILE = argsPath;
  process.env.SYNC_TARGET = "/tmp/canonical-root";
  try {
    const adapter = createNpmSyncAdapter();
    assert.equal(await adapter.resolveLatestVersion(), "0.6.0");
    await assert.rejects(adapter.runPinnedUpgrade({ version: "0.6.0", gitRoot: process.env.SYNC_TARGET, apply: false }), { code: "E_DELEGATE_PROTOCOL" });

    await writeFile(npx, `#!/bin/sh\nprintf '%s\\n' "$@" > "$SYNC_ARGS_FILE"\nprintf '{"schemaVersion":1,"command":"upgrade","target":"%s","package":{"name":"ai-vibe-demo-kit","version":"0.6.0"}}\\n' "$SYNC_TARGET"\n`, { mode: 0o755 });
    const delegated = await adapter.runPinnedUpgrade({ version: "0.6.0", gitRoot: process.env.SYNC_TARGET, apply: true });
    assert.equal(delegated.payload.command, "upgrade");
    assert.deepEqual((await readFile(argsPath, "utf8")).trim().split("\n"), [
      "--yes", "ai-vibe-demo-kit@0.6.0", "upgrade", "--target", "/tmp/canonical-root", "--apply", "--json",
    ]);

    await writeFile(npx, "#!/bin/sh\ntrap 'exit 143' TERM\nwhile :; do sleep 1; done\n", { mode: 0o755 });
    const moduleUrl = new URL("../../src/distribution/sync.mjs", import.meta.url).href;
    const script = `import { createNpmSyncAdapter } from ${JSON.stringify(moduleUrl)};
const pending = createNpmSyncAdapter().runPinnedUpgrade({ version: "0.6.0", gitRoot: "/tmp/canonical-root", apply: true });
setTimeout(() => process.kill(process.pid, "SIGTERM"), 100);
try { await pending; process.exitCode = 1; } catch (error) { console.log(error.code); }`;
    const signalResult = await runRaw(process.execPath, ["--input-type=module", "--eval", script], sourceRoot);
    assert.equal(signalResult.code, 0, signalResult.stderr);
    assert.equal(signalResult.stdout, "E_DELEGATE_INTERRUPTED");
  } finally {
    process.env.PATH = previousPath;
    if (previousArgs === undefined) delete process.env.SYNC_ARGS_FILE; else process.env.SYNC_ARGS_FILE = previousArgs;
    if (previousTarget === undefined) delete process.env.SYNC_TARGET; else process.env.SYNC_TARGET = previousTarget;
  }
});
