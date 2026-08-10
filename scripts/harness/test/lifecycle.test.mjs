import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, lstat, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDistributionManifest, runDistributionCommand } from "../lib/lifecycle.mjs";
import { readCanonicalMaintenance, repositoryPaths } from "../lib/repository-guard.mjs";
import { makeGitRepo, makeTemporaryDirectory, runRaw, workflow } from "./helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

async function command(target, name, options = {}) {
  return runDistributionCommand({ sourceRoot, target, command: name, ...options });
}

async function distributionVariant(version, mutate = async () => {}) {
  const root = await makeTemporaryDirectory("distribution-variant-");
  const source = await loadDistributionManifest(sourceRoot);
  for (const entry of source.value.files) {
    const target = join(root, entry.sourcePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourceRoot, entry.sourcePath), target);
  }
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  packageJson.version = version;
  await writeFile(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  const runtime = JSON.parse(await readFile(join(root, ".harness", "manifest.json"), "utf8"));
  runtime.version = version;
  await writeFile(join(root, ".harness", "manifest.json"), `${JSON.stringify(runtime, null, 2)}\n`);
  const manifestPath = join(root, ".harness", "distribution-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.package.version = version;
  await mutate({ root, manifest });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return root;
}

test("fresh init installs a ledger-driven Runtime and is idempotent", async () => {
  const target = await makeGitRepo();
  let result = await command(target, "init");
  assert.equal(result.status, "applied");
  assert.equal(result.applied, true);
  assert.equal(result.package.version, "0.4.0");
  assert.equal((await lstat(join(target, "harness"))).mode & 0o111, 0o111);
  assert.equal((await lstat(join(target, ".agents", "skills", "ai-vibe-demo-kit", "SKILL.md"))).isFile(), true);
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.package.name, "ai-vibe-demo-kit");
  assert.equal(ledger.package.version, "0.4.0");
  assert.equal(ledger.installationState, "installed");
  assert.ok(ledger.files.some((entry) => entry.path === "harness" && entry.kind === "managed"));

  result = await command(target, "init");
  assert.equal(result.status, "idempotent");
  assert.equal(result.applied, false);
});

test("fresh init refuses an unregistered target even when content matches", async () => {
  const target = await makeGitRepo();
  await writeFile(join(target, "harness"), await readFile(join(sourceRoot, "harness")));
  const result = await command(target, "init");
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_INSTALL_CONFLICT");
  await assert.rejects(readFile(join(target, ".harness", "install-lock.json")), { code: "ENOENT" });
});

test("same-version init reports seed drift and blocks managed drift without writes", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  const ledgerPath = join(target, ".harness", "install-lock.json");
  const before = await readFile(ledgerPath, "utf8");
  await writeFile(join(target, "AGENTS_template.md"), "user seed\n");
  let result = await command(target, "init");
  assert.equal(result.status, "manual-action-required");
  assert.equal(result.applied, false);
  assert.equal(await readFile(ledgerPath, "utf8"), before);

  await writeFile(join(target, "harness"), "damaged\n");
  result = await command(target, "init");
  assert.equal(result.status, "conflict");
  assert.equal(result.applied, false);
  assert.equal(await readFile(join(target, "harness"), "utf8"), "damaged\n");
});

test("uninstall preserves modified managed files and keeps a residual ledger", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  await mkdir(join(target, "work", "evidence"), { recursive: true });
  await writeFile(join(target, "work", "evidence", "proof.txt"), "proof\n");
  await writeFile(join(target, "AGENTS.md"), "# Effective governance\n");
  await writeFile(join(target, "harness"), "user modified\n");

  const planned = await command(target, "uninstall");
  assert.equal(planned.applied, false);
  assert.equal(planned.status, "manual-action-required");
  const result = await command(target, "uninstall", { apply: true });
  assert.equal(result.status, "manual-action-required");
  assert.equal(result.applied, true);
  assert.equal(await readFile(join(target, "harness"), "utf8"), "user modified\n");
  assert.equal(await readFile(join(target, "AGENTS.md"), "utf8"), "# Effective governance\n");
  assert.equal(await readFile(join(target, "work", "evidence", "proof.txt"), "utf8"), "proof\n");
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.installationState, "residual");
  assert.deepEqual(ledger.files.map((entry) => entry.path), ["harness"]);
  assert.equal((await lstat(join(target, ".git", "harness"))).isDirectory(), true);
});

test("a staging crash leaves no canonical transaction or worktree writes", async () => {
  const target = await makeGitRepo();
  let injected = false;
  const result = await command(target, "init", {
    fault: async (point) => {
      if (!injected && point === "staging-persisted") {
        injected = true;
        throw new Error("injected staging crash");
      }
    },
  });
  assert.equal(result.status, "error");
  assert.equal(await readCanonicalMaintenance(target), null);
  await assert.rejects(readFile(join(target, "harness")), { code: "ENOENT" });
  const paths = await repositoryPaths(target);
  assert.ok((await readdir(paths.controlDir)).some((name) => name.startsWith("maintenance.tmp-")));

  const recovered = await command(target, "init");
  assert.equal(recovered.status, "applied");
  assert.equal((await readdir(paths.controlDir)).some((name) => name.startsWith("maintenance.tmp-")), false);
});

test("prepared transactions can roll back and committed transactions only resume", async () => {
  const preparedTarget = await makeGitRepo();
  let injected = false;
  let result = await command(preparedTarget, "init", {
    fault: async (point) => {
      if (!injected && point === "tmp-to-canonical") {
        injected = true;
        throw new Error("injected after canonical publication");
      }
    },
  });
  assert.equal(result.status, "error");
  assert.equal((await readCanonicalMaintenance(preparedTarget)).phase, "prepared");
  result = await command(preparedTarget, "recover", { strategy: "rollback", apply: true });
  assert.equal(result.status, "applied");
  assert.equal(await readCanonicalMaintenance(preparedTarget), null);
  await assert.rejects(readFile(join(preparedTarget, "harness")), { code: "ENOENT" });

  const committedTarget = await makeGitRepo();
  injected = false;
  result = await command(committedTarget, "init", {
    fault: async (point) => {
      if (!injected && point === "committed-before-cleanup") {
        injected = true;
        throw new Error("injected committed cleanup crash");
      }
    },
  });
  assert.equal(result.status, "error");
  assert.equal((await readCanonicalMaintenance(committedTarget)).phase, "committed");
  const status = await runRaw(join(committedTarget, "harness"), ["status", "--json"], committedTarget);
  assert.equal(status.code, 0, status.stderr);
  const statusPayload = JSON.parse(status.stdout);
  assert.equal(statusPayload.status, "maintenance");
  assert.match(statusPayload.nextActions[0], /ai-vibe-demo-kit@0\.4\.0 recover/);
  const mutation = await runRaw(join(committedTarget, "harness"), ["start", "--workflow", "workflows/workflow-template.json", "--intent", "must block", "--json"], committedTarget);
  assert.equal(mutation.code, 2);
  assert.equal(JSON.parse(mutation.stdout).error.code, "E_MAINTENANCE_PENDING");
  const rollback = await command(committedTarget, "recover", { strategy: "rollback", apply: true });
  assert.equal(rollback.status, "conflict");
  assert.equal(rollback.errors[0].code, "E_RECOVERY_COMMITTED");
  const resumed = await command(committedTarget, "recover", { strategy: "resume", apply: true });
  assert.equal(resumed.status, "applied");
  assert.equal(await readCanonicalMaintenance(committedTarget), null);
  assert.equal((await lstat(join(committedTarget, "harness"))).isFile(), true);
});

test("a gc deletion crash does not block Runtime and is cleaned by the next lifecycle apply", async () => {
  const target = await makeGitRepo();
  let injected = false;
  const result = await command(target, "init", {
    fault: async (point) => {
      if (!injected && point === "canonical-to-gc") {
        injected = true;
        throw new Error("injected gc crash");
      }
    },
  });
  assert.equal(result.status, "error");
  assert.equal(await readCanonicalMaintenance(target), null);
  const paths = await repositoryPaths(target);
  assert.ok((await readdir(paths.controlDir)).some((name) => name.startsWith("maintenance.gc-")));
  const diagnosed = await command(target, "doctor");
  assert.ok(diagnosed.warnings.some((entry) => entry.code === "W_MAINTENANCE_ORPHAN"));
  assert.equal(diagnosed.errors.length, 0);
  const next = await command(target, "init");
  assert.equal(next.status, "idempotent");
  assert.equal((await readdir(paths.controlDir)).some((name) => name.startsWith("maintenance.gc-")), false);
});

test("Lifecycle Apply refuses an active Work Item without target writes", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  await writeFile(join(target, "workflows", "active.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  const started = await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/active.json", "--intent", "Protect lifecycle", "--json"], target);
  assert.equal(started.code, 0, started.stderr);
  const before = await readFile(join(target, "harness"), "utf8");
  const result = await command(target, "uninstall", { apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_ACTIVE_WORK_ITEM");
  assert.equal(await readFile(join(target, "harness"), "utf8"), before);
  assert.equal(await readCanonicalMaintenance(target), null);
});

test("recover binds schema, package version, Manifest digest and rejects third-state content", async () => {
  const target = await makeGitRepo();
  let injected = false;
  await command(target, "init", {
    fault: async (point) => {
      if (!injected && point === "tmp-to-canonical") {
        injected = true;
        throw new Error("leave prepared transaction");
      }
    },
  });
  const paths = await repositoryPaths(target);
  const journalPath = join(paths.maintenancePath, "transaction.json");
  const original = await readCanonicalMaintenance(target);

  await writeFile(journalPath, `${JSON.stringify({ ...original, createdByPackageVersion: "0.5.0" }, null, 2)}\n`);
  let result = await command(target, "recover", { strategy: "resume" });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_RECOVERY_VERSION_MISMATCH");

  await writeFile(journalPath, `${JSON.stringify({ ...original, schemaVersion: 2 }, null, 2)}\n`);
  result = await command(target, "recover", { strategy: "resume" });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_TRANSACTION_VERSION");

  await writeFile(journalPath, `${JSON.stringify({ ...original, distributionManifestDigest: `sha256:${"0".repeat(64)}` }, null, 2)}\n`);
  result = await command(target, "recover", { strategy: "resume" });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_RECOVERY_MANIFEST_MISMATCH");

  await writeFile(journalPath, `${JSON.stringify(original, null, 2)}\n`);
  await writeFile(join(target, "harness"), "third-state\n");
  result = await command(target, "recover", { strategy: "resume", apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_MAINTENANCE_CONFLICT");
  assert.equal((await readCanonicalMaintenance(target)).phase, "applying");

  await unlink(join(target, "harness"));
  result = await command(target, "recover", { strategy: "rollback", apply: true });
  assert.equal(result.status, "applied");
  assert.equal(await readCanonicalMaintenance(target), null);
});

test("upgrade applies managed changes while preserving modified seed ownership", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  await writeFile(join(target, "AGENTS_template.md"), "user-owned seed\n");
  const nextSource = await distributionVariant("0.5.0", async ({ root }) => {
    await writeFile(join(root, "harness"), "#!/usr/bin/env node\n// 0.5.0 managed runtime\n");
  });

  const result = await runDistributionCommand({ sourceRoot: nextSource, target, command: "upgrade", apply: true });
  assert.equal(result.status, "manual-action-required");
  assert.equal(result.applied, true);
  assert.match(await readFile(join(target, "harness"), "utf8"), /0\.5\.0 managed runtime/);
  assert.equal(await readFile(join(target, "AGENTS_template.md"), "utf8"), "user-owned seed\n");
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.package.version, "0.5.0");
  assert.equal(ledger.files.find((entry) => entry.path === "AGENTS_template.md").state, "preserved");
});

test("upgrade blocks kind changes and removed modified managed files atomically", async () => {
  const kindTarget = await makeGitRepo();
  await command(kindTarget, "init");
  const kindSource = await distributionVariant("0.5.0", async ({ manifest }) => {
    manifest.files.find((entry) => entry.targetPath === "harness").kind = "seed";
  });
  let result = await runDistributionCommand({ sourceRoot: kindSource, target: kindTarget, command: "upgrade", apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_OWNERSHIP_CHANGE");
  assert.equal(JSON.parse(await readFile(join(kindTarget, ".harness", "install-lock.json"), "utf8")).package.version, "0.4.0");

  const removedTarget = await makeGitRepo();
  await command(removedTarget, "init");
  await writeFile(join(removedTarget, "harness"), "modified managed\n");
  const removedSource = await distributionVariant("0.5.0", async ({ manifest }) => {
    manifest.files = manifest.files.filter((entry) => entry.targetPath !== "harness");
  });
  result = await runDistributionCommand({ sourceRoot: removedSource, target: removedTarget, command: "upgrade", apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(await readFile(join(removedTarget, "harness"), "utf8"), "modified managed\n");
  assert.equal(JSON.parse(await readFile(join(removedTarget, ".harness", "install-lock.json"), "utf8")).package.version, "0.4.0");
});

test("Runtime start and Lifecycle Apply serialize through the shared RepositoryGuard lock", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  const nextSource = await distributionVariant("0.5.0", async ({ root }) => {
    const path = join(root, "workflows", "workflow-template.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    value.description = "Updated while Runtime start waits for the shared lock.";
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  });
  let release;
  let entered;
  const enteredPromise = new Promise((resolveEntered) => { entered = resolveEntered; });
  const releasePromise = new Promise((resolveRelease) => { release = resolveRelease; });
  let held = false;
  const upgrade = runDistributionCommand({
    sourceRoot: nextSource,
    target,
    command: "upgrade",
    apply: true,
    fault: async (point) => {
      if (!held && point === "staging-persisted") {
        held = true;
        entered();
        await releasePromise;
      }
    },
  });
  await enteredPromise;
  const starting = runRaw(join(target, "harness"), ["start", "--workflow", "workflows/workflow-template.json", "--intent", "serialize start", "--json"], target);
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  release();
  const [upgraded, started] = await Promise.all([upgrade, starting]);
  assert.equal(upgraded.status, "applied");
  assert.equal(started.code, 0, started.stderr);
  const status = await runRaw(join(target, "harness"), ["status", "--json"], target);
  assert.equal(JSON.parse(status.stdout).workflowDrift, false);
});

test("failure injection covers every transaction persistence category", async () => {
  const target = await makeGitRepo();
  const points = [];
  await command(target, "init", { fault: async (point) => { points.push(point); } });
  for (const pattern of [
    /^write:/,
    /^rename:/,
    /^chmod:/,
    /^fsync:/,
    /^journal-update$/,
    /^staging-persisted$/,
    /^tmp-to-canonical$/,
    /^ledger-commit$/,
    /^committed-before-cleanup$/,
    /^canonical-to-gc$/,
    /^gc-delete$/,
  ]) assert.ok(points.some((point) => pattern.test(point)), `missing injection point ${pattern}`);

  points.length = 0;
  await command(target, "uninstall", { apply: true, fault: async (point) => { points.push(point); } });
  assert.ok(points.some((point) => point.startsWith("remove:")));
  assert.ok(points.some((point) => point.startsWith("fsync-remove:")));
});
