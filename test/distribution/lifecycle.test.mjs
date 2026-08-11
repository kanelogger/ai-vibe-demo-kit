import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDistributionManifest, runDistributionCommand } from "../../src/distribution/lifecycle.mjs";
import { runRuntimeCommand } from "../../src/runtime/runtime.mjs";
import { readCanonicalMaintenance, repositoryPaths, withRepositoryMutation } from "../../src/shared/repository-guard.mjs";
import { makeGitRepo, makeTemporaryDirectory, run, runRaw, workflow } from "../helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

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
  const manifestPath = join(root, "source", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.package.version = version;
  await mutate({ root, manifest });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return realpath(root);
}

async function legacyLayoutSource() {
  return distributionVariant("0.5.0", async ({ root, manifest }) => {
    const legacyTargets = new Map([
      ["src/runtime/cli.mjs", "bin/harness.mjs"],
      ["src/runtime/kernel.mjs", "scripts/harness/lib/kernel.mjs"],
      ["src/runtime/runtime.mjs", "scripts/harness/lib/runtime.mjs"],
      ["src/runtime/store.mjs", "scripts/harness/lib/store.mjs"],
      ["src/runtime/validation/index.mjs", "scripts/harness/lib/validator.mjs"],
      ["src/shared/errors.mjs", "scripts/harness/lib/errors.mjs"],
      ["src/shared/manifest.mjs", "scripts/harness/lib/manifest.mjs"],
      ["src/shared/path-safety.mjs", "scripts/harness/lib/path-safety.mjs"],
      ["src/shared/repository-guard.mjs", "scripts/harness/lib/repository-guard.mjs"],
    ]);
    const newOnlySources = new Set([
      ".harness/ARCHITECTURE.md",
      "src/runtime/ARCHITECTURE.md",
      "src/runtime/readiness.mjs",
      "src/runtime/validation/control-state.mjs",
      "src/runtime/validation/environment.mjs",
      "src/runtime/validation/result.mjs",
      "src/runtime/validation/workflow.mjs",
      "src/shared/ARCHITECTURE.md",
    ]);
    for (const entry of manifest.files) {
      if (legacyTargets.has(entry.sourcePath)) entry.targetPath = legacyTargets.get(entry.sourcePath);
      if (newOnlySources.has(entry.sourcePath)) {
        entry.targetPath = null;
        entry.kind = "package-only";
      }
    }
    await writeFile(join(root, "payload", "harness"), "#!/usr/bin/env node\nimport \"./bin/harness.mjs\";\n");
    const runtimeManifestPath = join(root, ".harness", "manifest.json");
    const runtimeManifest = JSON.parse(await readFile(runtimeManifestPath, "utf8"));
    runtimeManifest.schemaVersion = 1;
    delete runtimeManifest.capabilities;
    await writeFile(runtimeManifestPath, `${JSON.stringify(runtimeManifest, null, 2)}\n`);
  });
}

async function preSourceLayout() {
  return distributionVariant("0.5.0", async ({ manifest }) => {
    const legacyTargets = new Map([
      ["source/agents_template.md", ["AGENTS_template.md", "seed"]],
      ["source/ai_environment_template.md", ["AI_ENVIRONMENT_template.md", "seed"]],
      ["source/coding_agent_rules_template.md", ["CODING_AGENT_RULES_template.md", "seed"]],
      ["source/project-template.yml", ["project-template.yml", "seed"]],
      ["source/specs/template.md", ["SPECS/template.md", "seed"]],
      ["source/workflows/skills-list.json", ["workflows/skills-list.json", "managed"]],
      ["source/workflows/stage-result-template.json", ["workflows/stage-result-template.json", "managed"]],
      ["source/workflows/verification-report-template.json", ["workflows/verification-report-template.json", "managed"]],
      ["source/workflows/workflow-template.json", ["workflows/workflow-template.json", "managed"]],
    ]);
    for (const entry of manifest.files) {
      if (!entry.sourcePath.startsWith("source/") || entry.sourcePath === "source/manifest.json") continue;
      const legacy = legacyTargets.get(entry.sourcePath);
      if (legacy) [entry.targetPath, entry.kind] = legacy;
      else {
        entry.targetPath = null;
        entry.kind = "package-only";
      }
    }
  });
}

async function namedGitRepo(name) {
  const parent = await makeTemporaryDirectory("named-git-parent-");
  const root = join(parent, name);
  await mkdir(root);
  await run("git", ["init", "-q"], root);
  await run("git", ["config", "user.name", "Harness Test"], root);
  await run("git", ["config", "user.email", "harness@example.test"], root);
  await writeFile(join(root, "README.md"), "# Test\n");
  await run("git", ["add", "README.md"], root);
  await run("git", ["commit", "-qm", "initial"], root);
  return realpath(root);
}

test("fresh init installs a ledger-driven Runtime and is idempotent", async () => {
  const target = await makeGitRepo();
  let result = await command(target, "init");
  assert.equal(result.status, "applied");
  assert.equal(result.applied, true);
  assert.equal(result.package.version, "0.5.0");
  assert.equal((await lstat(join(target, "harness"))).mode & 0o111, 0o111);
  assert.equal((await lstat(join(target, ".agents", "skills", "ai-vibe-demo-kit", "SKILL.md"))).isFile(), true);
  assert.equal((await lstat(join(target, "source", ".agents", "skills.sources.json"))).isFile(), true);
  assert.equal((await lstat(join(target, "source", "knowledge", "INDEX.md"))).isFile(), true);
  assert.equal((await lstat(join(target, "source", "rules", "testing.md"))).isFile(), true);
  assert.equal((await lstat(join(target, "source", "specs", "template.md"))).isFile(), true);
  assert.equal((await lstat(join(target, "source", "workflows", "workflow-template.json"))).isFile(), true);
  await assert.rejects(lstat(join(target, "workflows", "workflow-template.json")), { code: "ENOENT" });
  const checked = await runRaw(join(target, "harness"), ["check", "--json"], target);
  assert.equal(checked.code, 0, checked.stderr);
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.package.name, "ai-vibe-demo-kit");
  assert.equal(ledger.package.version, "0.5.0");
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

test("fresh init rejects an occupied Source path atomically", async () => {
  const target = await makeGitRepo();
  await mkdir(join(target, "source", "knowledge"), { recursive: true });
  await writeFile(join(target, "source", "knowledge", "README.md"), "user content\n");

  const result = await command(target, "init");

  assert.equal(result.status, "conflict");
  assert.equal(result.applied, false);
  assert.ok(result.errors[0].facts.paths.includes("source/knowledge/README.md"));
  await assert.rejects(lstat(join(target, "harness")), { code: "ENOENT" });
  await assert.rejects(lstat(join(target, ".harness", "install-lock.json")), { code: "ENOENT" });
  assert.equal(await readFile(join(target, "source", "knowledge", "README.md"), "utf8"), "user content\n");
});

test("same-version init reports seed drift and blocks managed drift without writes", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  const ledgerPath = join(target, ".harness", "install-lock.json");
  const before = await readFile(ledgerPath, "utf8");
  await writeFile(join(target, "source", "agents_template.md"), "user seed\n");
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
  await writeFile(join(target, "source", "rules", "testing.md"), "user modified Source\n");

  const planned = await command(target, "uninstall");
  assert.equal(planned.applied, false);
  assert.equal(planned.status, "manual-action-required");
  const result = await command(target, "uninstall", { apply: true });
  assert.equal(result.status, "manual-action-required");
  assert.equal(result.applied, true);
  assert.equal(await readFile(join(target, "harness"), "utf8"), "user modified\n");
  assert.equal(await readFile(join(target, "source", "rules", "testing.md"), "utf8"), "user modified Source\n");
  assert.equal(await readFile(join(target, "AGENTS.md"), "utf8"), "# Effective governance\n");
  assert.equal(await readFile(join(target, "work", "evidence", "proof.txt"), "utf8"), "proof\n");
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.installationState, "residual");
  assert.deepEqual(ledger.files.map((entry) => entry.path), ["harness", "source/rules/testing.md"]);
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
  assert.match(statusPayload.nextActions[0], /'ai-vibe-demo-kit@0\.5\.0' recover/);
  const mutation = await runRaw(join(committedTarget, "harness"), ["start", "--workflow", "source/workflows/workflow-template.json", "--intent", "must block", "--json"], committedTarget);
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

  await writeFile(journalPath, `${JSON.stringify({ ...original, createdByPackageVersion: "0.4.0" }, null, 2)}\n`);
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

test("recovery nextActions shell-quote target paths and reject executable journal versions", async () => {
  const target = await namedGitRepo("kit-review-$(printf PWNED)-repository");
  const diagnosis = await command(target, "doctor");
  assert.equal(diagnosis.warnings[0].repair, `npx --yes 'ai-vibe-demo-kit@0.5.0' init --target '${target}' --json`);
  await command(target, "init");
  let injected = false;
  const interrupted = await command(target, "uninstall", {
    apply: true,
    fault: async (point) => {
      if (!injected && point === "tmp-to-canonical") {
        injected = true;
        throw new Error("leave a prepared uninstall");
      }
    },
  });
  const expected = `npx --yes 'ai-vibe-demo-kit@0.5.0' recover --target '${target}' --strategy resume --apply --json`;
  assert.equal(interrupted.nextActions[0], expected);

  let runtimeStatus = await runRaw(join(target, "harness"), ["status", "--json"], target);
  assert.equal(runtimeStatus.code, 0, runtimeStatus.stderr);
  assert.equal(JSON.parse(runtimeStatus.stdout).nextActions[0], expected);

  const paths = await repositoryPaths(target);
  const journalPath = join(paths.maintenancePath, "transaction.json");
  const transaction = await readCanonicalMaintenance(target);
  await writeFile(journalPath, `${JSON.stringify({ ...transaction, createdByPackageVersion: "0.5.0;printf VERSION_INJECTION" }, null, 2)}\n`);
  const recovery = await command(target, "recover", { strategy: "resume" });
  assert.equal(recovery.status, "conflict");
  assert.equal(recovery.errors[0].code, "E_TRANSACTION_VERSION");
  assert.deepEqual(recovery.nextActions, []);

  runtimeStatus = await runRaw(join(target, "harness"), ["status", "--json"], target);
  assert.equal(runtimeStatus.code, 2);
  assert.equal(JSON.parse(runtimeStatus.stdout).error.code, "E_TRANSACTION_VERSION");
  assert.doesNotMatch(runtimeStatus.stdout, /VERSION_INJECTION recover/);
});

test("recover revalidates package and Manifest bindings after acquiring the repository lock", async () => {
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
  let release;
  let entered;
  const releasePromise = new Promise((resolveRelease) => { release = resolveRelease; });
  const enteredPromise = new Promise((resolveEntered) => { entered = resolveEntered; });
  const lock = withRepositoryMutation(target, async () => {
    entered();
    await releasePromise;
  });
  await enteredPromise;
  const recovering = command(target, "recover", { strategy: "resume", apply: true });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  const transaction = await readCanonicalMaintenance(target);
  const changed = { ...transaction, distributionManifestDigest: `sha256:${"0".repeat(64)}` };
  await writeFile(journalPath, `${JSON.stringify(changed, null, 2)}\n`);
  release();
  await lock;

  const result = await recovering;
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_RECOVERY_MANIFEST_MISMATCH");
  assert.equal((await readCanonicalMaintenance(target)).distributionManifestDigest, changed.distributionManifestDigest);
});

test("recover removes a worktree atomic-write temporary file after a pre-rename failure", async () => {
  const target = await makeGitRepo();
  let injected = false;
  const interrupted = await command(target, "init", {
    fault: async (point) => {
      if (!injected && point === `write:${join(target, "harness")}`) {
        injected = true;
        throw new Error("interrupt target atomic write");
      }
    },
  });
  assert.equal(interrupted.status, "error");
  const transaction = await readCanonicalMaintenance(target);
  const temporary = join(target, `harness.ai-vibe-demo-kit-${transaction.transactionId}.tmp`);
  await writeFile(temporary, "partially persisted Runtime\n");
  assert.equal((await lstat(temporary)).isFile(), true);

  const recovered = await command(target, "recover", { strategy: "resume", apply: true });
  assert.equal(recovered.status, "applied");
  assert.equal((await readdir(target)).some((name) => /^harness\.ai-vibe-demo-kit-.*\.tmp$/.test(name)), false);
});

test("upgrade applies managed changes while preserving modified seed ownership", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  await writeFile(join(target, "source", "agents_template.md"), "user-owned seed\n");
  const nextSource = await distributionVariant("0.6.0", async ({ root }) => {
    await writeFile(join(root, "payload", "harness"), "#!/usr/bin/env node\n// 0.6.0 managed runtime\n");
  });

  const result = await runDistributionCommand({ sourceRoot: nextSource, target, command: "upgrade", apply: true });
  assert.equal(result.status, "manual-action-required");
  assert.equal(result.applied, true);
  assert.match(await readFile(join(target, "harness"), "utf8"), /0\.6\.0 managed runtime/);
  assert.equal(await readFile(join(target, "source", "agents_template.md"), "utf8"), "user-owned seed\n");
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.package.version, "0.6.0");
  assert.equal(ledger.files.find((entry) => entry.path === "source/agents_template.md").state, "preserved");
});

test("same-version upgrade migrates the pre-Source projection and preserves effective governance", async () => {
  const target = await makeGitRepo();
  const previous = await preSourceLayout();
  let result = await runDistributionCommand({ sourceRoot: previous, target, command: "init", apply: true });
  assert.equal(result.status, "applied");
  await writeFile(join(target, "AGENTS_template.md"), "user-modified legacy seed\n");
  await writeFile(join(target, "AGENTS.md"), "# Effective project governance\n");

  result = await command(target, "upgrade", { apply: true });

  assert.equal(result.status, "manual-action-required");
  assert.equal(result.applied, true);
  assert.equal(await readFile(join(target, "AGENTS_template.md"), "utf8"), "user-modified legacy seed\n");
  assert.equal(await readFile(join(target, "AGENTS.md"), "utf8"), "# Effective project governance\n");
  assert.equal((await lstat(join(target, "source", "agents_template.md"))).isFile(), true);
  assert.equal((await lstat(join(target, "source", "knowledge", "INDEX.md"))).isFile(), true);
  await assert.rejects(lstat(join(target, "workflows", "workflow-template.json")), { code: "ENOENT" });
  const checked = await runRaw(join(target, "harness"), ["check", "--json"], target);
  assert.equal(checked.code, 0, checked.stderr);
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.files.find((entry) => entry.path === "AGENTS_template.md").state, "orphaned");
  assert.equal(ledger.files.find((entry) => entry.path === "source/agents_template.md").state, "installed");
});

test("same-version upgrade migrates the legacy Runtime layout and abandons non-empty legacy directories", async () => {
  const target = await makeGitRepo();
  const legacySource = await legacyLayoutSource();
  let result = await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
  assert.equal(result.status, "applied");
  await writeFile(join(target, "scripts", "user-owned.txt"), "preserve me\n");

  const diagnosis = await command(target, "doctor");
  assert.ok(diagnosis.warnings.some((entry) => entry.code === "W_RUNTIME_LAYOUT_OUTDATED"));

  result = await command(target, "upgrade", { apply: true });
  assert.equal(result.status, "applied");
  assert.equal((await lstat(join(target, ".harness", "runtime", "cli.mjs"))).isFile(), true);
  assert.equal((await lstat(join(target, ".harness", "shared", "repository-guard.mjs"))).isFile(), true);
  await assert.rejects(lstat(join(target, "bin")), { code: "ENOENT" });
  await assert.rejects(lstat(join(target, "scripts", "harness")), { code: "ENOENT" });
  assert.equal(await readFile(join(target, "scripts", "user-owned.txt"), "utf8"), "preserve me\n");
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.equal(ledger.package.version, "0.5.0");
  assert.equal(ledger.createdDirectories.includes("bin"), false);
  assert.equal(ledger.createdDirectories.some((path) => path.startsWith("scripts/harness")), false);
  assert.equal(ledger.createdDirectories.includes("scripts"), false);
});

test("same-version legacy migration rejects modified managed files before writing", async () => {
  const target = await makeGitRepo();
  const legacySource = await legacyLayoutSource();
  await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
  await writeFile(join(target, "bin", "harness.mjs"), "modified legacy adapter\n");

  const result = await command(target, "upgrade", { apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_INSTALL_CONFLICT");
  assert.equal(await readFile(join(target, "bin", "harness.mjs"), "utf8"), "modified legacy adapter\n");
  await assert.rejects(lstat(join(target, ".harness", "runtime", "cli.mjs")), { code: "ENOENT" });
  const ledger = JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8"));
  assert.ok(ledger.files.some((entry) => entry.path === "bin/harness.mjs"));
});

test("same-version legacy migration rejects managed symlinks before writing", async () => {
  const target = await makeGitRepo();
  const legacySource = await legacyLayoutSource();
  await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
  await unlink(join(target, "bin", "harness.mjs"));
  await symlink("../README.md", join(target, "bin", "harness.mjs"));

  const result = await command(target, "upgrade", { apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_INSTALL_CONFLICT");
  assert.equal((await lstat(join(target, "bin", "harness.mjs"))).isSymbolicLink(), true);
  await assert.rejects(lstat(join(target, ".harness", "runtime", "cli.mjs")), { code: "ENOENT" });
});

test("same-version legacy migration refuses an active Work Item before writing", async () => {
  const target = await makeGitRepo();
  const legacySource = await legacyLayoutSource();
  await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
  await writeFile(join(target, "workflows", "active.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  const started = await runRuntimeCommand({
    runtimeRoot: sourceRoot,
    cwd: target,
    command: { kind: "start", workflow: "workflows/active.json", intent: "Protect legacy migration" },
  });
  assert.equal(started.exitCode, 0);

  const result = await command(target, "upgrade", { apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_ACTIVE_WORK_ITEM");
  assert.equal((await lstat(join(target, "bin", "harness.mjs"))).isFile(), true);
  await assert.rejects(lstat(join(target, ".harness", "runtime", "cli.mjs")), { code: "ENOENT" });
});

test("same-version migration resumes after directory cleanup interruption", async () => {
  const target = await makeGitRepo();
  const legacySource = await legacyLayoutSource();
  await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
  let injected = false;
  const interrupted = await command(target, "upgrade", {
    apply: true,
    fault: async (point) => {
      if (!injected && point === "directory-cleanup") {
        injected = true;
        throw new Error("interrupt directory cleanup");
      }
    },
  });
  assert.equal(interrupted.status, "error");
  assert.equal(injected, true);

  const recovered = await command(target, "recover", { strategy: "resume", apply: true });
  assert.equal(recovered.status, "applied");
  assert.equal(await readCanonicalMaintenance(target), null);
  await assert.rejects(lstat(join(target, "bin")), { code: "ENOENT" });
  assert.equal((await lstat(join(target, ".harness", "runtime", "cli.mjs"))).isFile(), true);
});

test("same-version migration transaction recovers every layout-specific persistence boundary", async (t) => {
  await t.test("staging failure retries with zero prior target writes", async () => {
    const target = await makeGitRepo();
    const legacySource = await legacyLayoutSource();
    await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
    let injected = false;
    const interrupted = await command(target, "upgrade", {
      apply: true,
      fault: async (point) => {
        if (!injected && point === "staging-persisted") {
          injected = true;
          throw new Error("interrupt migration staging");
        }
      },
    });
    assert.equal(interrupted.status, "error");
    assert.equal(await readCanonicalMaintenance(target), null);
    assert.equal((await lstat(join(target, "bin", "harness.mjs"))).isFile(), true);
    await assert.rejects(lstat(join(target, ".harness", "runtime", "cli.mjs")), { code: "ENOENT" });
    assert.equal((await command(target, "upgrade", { apply: true })).status, "applied");
  });

  await t.test("prepared migration rolls back to the old layout", async () => {
    const target = await makeGitRepo();
    const legacySource = await legacyLayoutSource();
    await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
    let injected = false;
    const interrupted = await command(target, "upgrade", {
      apply: true,
      fault: async (point) => {
        if (!injected && point === "tmp-to-canonical") {
          injected = true;
          throw new Error("interrupt prepared migration");
        }
      },
    });
    assert.equal(interrupted.status, "error");
    assert.equal((await readCanonicalMaintenance(target)).phase, "prepared");
    assert.equal((await command(target, "recover", { strategy: "rollback", apply: true })).status, "applied");
    assert.equal((await lstat(join(target, "bin", "harness.mjs"))).isFile(), true);
    await assert.rejects(lstat(join(target, ".harness", "runtime", "cli.mjs")), { code: "ENOENT" });
  });

  await t.test("ledger commit interruption resumes the migration", async () => {
    const target = await makeGitRepo();
    const legacySource = await legacyLayoutSource();
    await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
    let injected = false;
    const interrupted = await command(target, "upgrade", {
      apply: true,
      fault: async (point) => {
        if (!injected && point === "ledger-commit") {
          injected = true;
          throw new Error("interrupt migration ledger commit");
        }
      },
    });
    assert.equal(interrupted.status, "error");
    assert.equal((await command(target, "recover", { strategy: "resume", apply: true })).status, "applied");
    await assert.rejects(lstat(join(target, "bin")), { code: "ENOENT" });
    assert.equal((await lstat(join(target, ".harness", "runtime", "cli.mjs"))).isFile(), true);
  });

  await t.test("gc cleanup interruption leaves a non-blocking orphan", async () => {
    const target = await makeGitRepo();
    const legacySource = await legacyLayoutSource();
    await runDistributionCommand({ sourceRoot: legacySource, target, command: "init", apply: true });
    let injected = false;
    const interrupted = await command(target, "upgrade", {
      apply: true,
      fault: async (point) => {
        if (!injected && point === "gc-delete") {
          injected = true;
          throw new Error("interrupt migration gc cleanup");
        }
      },
    });
    assert.equal(interrupted.status, "error");
    assert.equal(await readCanonicalMaintenance(target), null);
    assert.equal((await lstat(join(target, ".harness", "runtime", "cli.mjs"))).isFile(), true);
    assert.equal((await command(target, "upgrade", { apply: true })).status, "idempotent");
    const paths = await repositoryPaths(target);
    assert.equal((await readdir(paths.controlDir)).some((entry) => entry.startsWith("maintenance.gc-")), false);
  });
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
  assert.equal(JSON.parse(await readFile(join(kindTarget, ".harness", "install-lock.json"), "utf8")).package.version, "0.5.0");

  const removedTarget = await makeGitRepo();
  await command(removedTarget, "init");
  await writeFile(join(removedTarget, "harness"), "modified managed\n");
  const removedSource = await distributionVariant("0.5.0", async ({ manifest }) => {
    manifest.files = manifest.files.filter((entry) => entry.targetPath !== "harness");
  });
  result = await runDistributionCommand({ sourceRoot: removedSource, target: removedTarget, command: "upgrade", apply: true });
  assert.equal(result.status, "conflict");
  assert.equal(await readFile(join(removedTarget, "harness"), "utf8"), "modified managed\n");
  assert.equal(JSON.parse(await readFile(join(removedTarget, ".harness", "install-lock.json"), "utf8")).package.version, "0.5.0");
});

test("Runtime start and Lifecycle Apply serialize through the shared RepositoryGuard lock", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  const nextSource = await distributionVariant("0.5.0", async ({ root }) => {
    const path = join(root, "source", "workflows", "workflow-template.json");
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
  const starting = runRaw(join(target, "harness"), ["start", "--workflow", "source/workflows/workflow-template.json", "--intent", "serialize start", "--json"], target);
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  release();
  const [upgraded, started] = await Promise.all([upgrade, starting]);
  assert.equal(upgraded.status, "applied");
  assert.equal(started.code, 0, started.stderr);
  const status = await runRaw(join(target, "harness"), ["status", "--json"], target);
  assert.equal(JSON.parse(status.stdout).workflowDrift, false);
});

test("active Work Items prevent orphan cleanup as well as target writes", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  await writeFile(join(target, "workflows", "active.json"), `${JSON.stringify(workflow(), null, 2)}\n`);
  const started = await runRaw(join(target, "harness"), ["start", "--workflow", "workflows/active.json", "--intent", "Protect all lifecycle writes", "--json"], target);
  assert.equal(started.code, 0, started.stderr);
  const paths = await repositoryPaths(target);
  const orphan = join(paths.controlDir, "maintenance.tmp-review-residue");
  await mkdir(orphan);

  const result = await command(target, "uninstall", { apply: true });

  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_ACTIVE_WORK_ITEM");
  assert.equal((await lstat(orphan)).isDirectory(), true);
});

test("upgrade rechecks preserved seed facts before committing the new ledger", async () => {
  const target = await makeGitRepo();
  await command(target, "init");
  await writeFile(join(target, "source", "agents_template.md"), "user-owned seed\n");
  const nextSource = await distributionVariant("0.5.0", async ({ root }) => {
    await writeFile(join(root, "harness"), "#!/usr/bin/env node\n// changed Runtime\n");
  });
  let changed = false;
  const result = await runDistributionCommand({
    sourceRoot: nextSource,
    target,
    command: "upgrade",
    apply: true,
    fault: async (point) => {
      if (!changed && point === "before-ledger-commit") {
        changed = true;
        await writeFile(join(target, "source", "agents_template.md"), "changed while applying\n");
      }
    },
  });

  assert.equal(result.status, "conflict");
  assert.equal(result.errors[0].code, "E_MAINTENANCE_CONFLICT");
  assert.equal(JSON.parse(await readFile(join(target, ".harness", "install-lock.json"), "utf8")).package.version, "0.5.0");
  assert.equal((await readCanonicalMaintenance(target)).phase, "applying");
});

test("every transaction persistence category fails recoverably", async (t) => {
  const initCases = [
    ["staged write", (point) => point.startsWith("write:") && point.includes("maintenance.tmp-")],
    ["staged rename", (point) => point.startsWith("rename:") && point.includes("maintenance.tmp-")],
    ["staged chmod", (point) => point.startsWith("chmod:") && point.includes("maintenance.tmp-")],
    ["staged fsync", (point) => point.startsWith("fsync:") && point.includes("maintenance.tmp-")],
    ["staging persistence", (point) => point === "staging-persisted"],
    ["tmp publication", (point) => point === "tmp-to-canonical"],
    ["journal update", (point) => point === "journal-update"],
    ["ledger commit", (point) => point === "ledger-commit"],
    ["committed verification", (point) => point === "committed-before-cleanup"],
    ["canonical gc publication", (point) => point === "canonical-to-gc"],
    ["gc deletion", (point) => point === "gc-delete"],
  ];

  for (const [name, genericMatch] of initCases) {
    await t.test(name, async () => {
      const target = await makeGitRepo();
      const paths = await repositoryPaths(target);
      const targetPath = join(target, "harness");
      const journalPath = join(paths.maintenancePath, "transaction.json");
      const match = name === "journal update"
        ? (point) => point === `rename:${journalPath}`
        : genericMatch;
      let injected = false;
      const result = await command(target, "init", {
        fault: async (point) => {
          if (!injected && match(point)) {
            injected = true;
            throw new Error(`injected ${name} failure at ${point}`);
          }
        },
      });
      assert.equal(injected, true, `${name} fault point was not reached`);
      assert.equal(result.status, "error");
      const transaction = await readCanonicalMaintenance(target);
      const recovered = transaction
        ? await command(target, "recover", { strategy: "resume", apply: true })
        : await command(target, "init");
      assert.ok(new Set(["applied", "idempotent"]).has(recovered.status), `${name}: ${JSON.stringify(recovered.errors)}`);
      assert.equal((await lstat(targetPath)).isFile(), true);
      assert.equal(await readCanonicalMaintenance(target), null);
      const controlEntries = await readdir(paths.controlDir);
      assert.equal(controlEntries.some((entry) => entry === "maintenance" || entry.startsWith("maintenance.tmp-") || entry.startsWith("maintenance.gc-")), false);
      assert.equal((await readdir(target)).some((entry) => entry.includes(".ai-vibe-demo-kit-") && entry.endsWith(".tmp")), false);
    });
  }

  for (const category of ["write", "rename", "chmod", "fsync"]) {
    await t.test(`worktree ${category}`, async () => {
      const target = await makeGitRepo();
      const targetPath = join(target, "harness");
      let injected = false;
      const result = await command(target, "init", {
        fault: async (point) => {
          if (!injected && point === `${category}:${targetPath}`) {
            injected = true;
            throw new Error(`injected worktree ${category} failure`);
          }
        },
      });
      assert.equal(injected, true);
      assert.equal(result.status, "error");
      const recovered = await command(target, "recover", { strategy: "resume", apply: true });
      assert.equal(recovered.status, "applied");
      assert.equal(await readCanonicalMaintenance(target), null);
      assert.equal((await readdir(target)).some((entry) => entry.includes(".ai-vibe-demo-kit-") && entry.endsWith(".tmp")), false);
    });
  }

  for (const category of ["remove", "fsync-remove"]) {
    await t.test(`worktree ${category}`, async () => {
      const target = await makeGitRepo();
      await command(target, "init");
      let injected = false;
      const result = await command(target, "uninstall", {
        apply: true,
        fault: async (point) => {
          if (!injected && point.startsWith(`${category}:`)) {
            injected = true;
            throw new Error(`injected ${category} failure`);
          }
        },
      });
      assert.equal(injected, true);
      assert.equal(result.status, "error");
      const recovered = await command(target, "recover", { strategy: "resume", apply: true });
      assert.equal(recovered.status, "applied");
      assert.equal(await readCanonicalMaintenance(target), null);
      await assert.rejects(readFile(join(target, ".harness", "install-lock.json")), { code: "ENOENT" });
    });
  }
});
