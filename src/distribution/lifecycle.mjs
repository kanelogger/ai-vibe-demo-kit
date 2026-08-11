import {
  lstat,
  readFile,
  readdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { HarnessError, fail } from "../shared/errors.mjs";
import { firstSymlinkInPath, resolveInside } from "../shared/path-safety.mjs";
import { formatInitCommand, formatRecoveryCommand, formatUpgradeCommand, readCanonicalMaintenance, repositoryPaths, withRepositoryMutation } from "../shared/repository-guard.mjs";
import { loadState } from "../runtime/store.mjs";
import { inspectDoctorReadiness, runtimeLayoutOutdated } from "./doctor.mjs";
import { fileFact, relation, safeRelative, sha256 } from "./ownership.mjs";
import { conflictPlan, planOperation, publicChange, readLedger } from "./planning.mjs";
import { assertRecoveryBinding, cleanupOrphans, prepareTransaction, resumeTransaction, rollbackTransaction, transactionView, validateTransaction } from "./transaction.mjs";
import { createNpmSyncAdapter, runSync } from "./sync.mjs";

const PACKAGE_NAME = "ai-vibe-demo-kit";
const MANIFEST_PATH = "source/manifest.json";
const LEDGER_PATH = ".harness/install-lock.json";
const KINDS = new Set(["managed", "seed", "package-only"]);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const STATUS_EXIT = new Map([
  ["ok", 0], ["planned", 0], ["applied", 0], ["idempotent", 0],
  ["manual-action-required", 1], ["conflict", 2], ["error", 2],
]);

const issue = (code, path, message, facts = null, repair = null) => ({ code, path, message, facts, repair });

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function sourceFact(sourceRoot, entry) {
  const target = resolveInside(sourceRoot, entry.sourcePath);
  if (!target) fail("E_DISTRIBUTION_MANIFEST", `source path leaves package: ${entry.sourcePath}`);
  if (await firstSymlinkInPath(sourceRoot, target)) fail("E_DISTRIBUTION_MANIFEST", `source path uses a symlink: ${entry.sourcePath}`);
  try {
    const stat = await lstat(target);
    if (!stat.isFile()) fail("E_DISTRIBUTION_MANIFEST", `source is not a regular file: ${entry.sourcePath}`);
    const content = await readFile(target);
    return { type: "file", sha256: sha256(content), mode: entry.mode, content };
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    fail("E_DISTRIBUTION_MANIFEST", `source cannot be read: ${entry.sourcePath}`);
  }
}

export async function loadDistributionManifest(sourceRoot) {
  const path = join(resolve(sourceRoot), MANIFEST_PATH);
  let raw;
  let value;
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("E_DISTRIBUTION_MANIFEST", "Distribution Manifest must be a regular file");
    raw = await readFile(path);
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    fail("E_DISTRIBUTION_MANIFEST", `Distribution Manifest cannot be read: ${error.message}`);
  }
  if (!isObject(value) || value.schemaVersion !== 1 || !isObject(value.package) || !Array.isArray(value.files)) {
    fail("E_DISTRIBUTION_MANIFEST", "Distribution Manifest schema is invalid");
  }
  if (value.package.name !== PACKAGE_NAME || typeof value.package.version !== "string" || !SEMVER.test(value.package.version)) {
    fail("E_DISTRIBUTION_MANIFEST", "Distribution Manifest package identity is invalid");
  }
  if (!/^[1-9]\d*$/.test(value.package.minimumNodeVersion ?? "")) fail("E_DISTRIBUTION_MANIFEST", "minimumNodeVersion is invalid");
  const sources = new Set();
  const targets = new Set();
  let selfCount = 0;
  const prepared = [];
  for (const [index, entry] of value.files.entries()) {
    if (!isObject(entry) || !safeRelative(entry.sourcePath) || !KINDS.has(entry.kind) || !/^0[0-7]{3}$/.test(entry.mode ?? "")) {
      fail("E_DISTRIBUTION_MANIFEST", `invalid files entry at index ${index}`);
    }
    if (sources.has(entry.sourcePath)) fail("E_DISTRIBUTION_MANIFEST", `duplicate sourcePath: ${entry.sourcePath}`);
    sources.add(entry.sourcePath);
    if (entry.sourcePath === MANIFEST_PATH && entry.kind === "package-only" && entry.targetPath === null) selfCount += 1;
    if (entry.kind === "package-only") {
      if (entry.targetPath !== null) fail("E_DISTRIBUTION_MANIFEST", `package-only targetPath must be null: ${entry.sourcePath}`);
    } else {
      if (!safeRelative(entry.targetPath)) fail("E_DISTRIBUTION_MANIFEST", `targetPath is invalid: ${entry.sourcePath}`);
      if (targets.has(entry.targetPath)) fail("E_DISTRIBUTION_MANIFEST", `duplicate targetPath: ${entry.targetPath}`);
      targets.add(entry.targetPath);
    }
    prepared.push({ ...entry, source: await sourceFact(sourceRoot, entry) });
  }
  if (selfCount !== 1) fail("E_DISTRIBUTION_MANIFEST", "Distribution Manifest must register itself exactly once as package-only");
  return { value, raw, digest: sha256(raw), files: prepared };
}

function envelope(command, distribution, target, plan, transaction = null) {
  return {
    schemaVersion: 1,
    command,
    status: plan.status,
    target,
    applied: plan.applied === true,
    package: { name: PACKAGE_NAME, version: distribution.value.package.version, installedVersion: plan.installedVersion ?? null },
    transaction,
    changes: plan.changes ?? [],
    readiness: plan.readiness ?? null,
    warnings: plan.warnings ?? [],
    errors: plan.errors ?? [],
    nextActions: plan.nextActions ?? [],
    ...(plan.update ? { update: plan.update } : {}),
  };
}

export function exitCodeForStatus(status) {
  return STATUS_EXIT.get(status) ?? 2;
}

async function applyPlan(command, target, distribution, fault) {
  return withRepositoryMutation(target, async (paths) => {
    if (await readCanonicalMaintenance(paths)) fail("E_MAINTENANCE_PENDING", "canonical maintenance already exists");
    const state = await loadState(paths.root);
    if (state.active !== null) fail("E_ACTIVE_WORK_ITEM", "lifecycle apply requires an idle Runtime", { facts: { revision: state.revision, workItemId: state.active.id } });
    await cleanupOrphans(paths, fault);
    const plan = await planOperation(command, paths.root, distribution);
    if (plan.status === "conflict" || plan.status === "idempotent" || plan.status === "manual-action-required" && !plan.applied) return { plan, transaction: null };
    const transaction = await prepareTransaction(paths, distribution, command, plan, fault);
    await resumeTransaction(paths, transaction, fault);
    return { plan: { ...plan, applied: true }, transaction };
  });
}

async function recover(target, distribution, strategy, apply, fault) {
  const paths = await repositoryPaths(target);
  const transaction = await readCanonicalMaintenance(paths);
  if (!transaction) return envelope("recover", distribution, paths.root, conflictPlan(null, [issue("E_MAINTENANCE_MISSING", null, "no canonical maintenance transaction exists")]));
  const installed = await readLedger(paths.root, { strict: false });
  const installedVersion = installed?.invalid ? null : installed?.package?.version ?? null;
  const transactionValid = validateTransaction(transaction);
  const base = {
    status: "planned",
    installedVersion,
    applied: false,
    changes: transactionValid
      ? transaction.actions.filter((entry) => entry.kind !== "ledger").map((entry) => publicChange(entry.action, entry.path, entry.kind, entry.before, entry.after))
      : [],
    warnings: [],
    errors: [],
    nextActions: transactionValid ? [formatRecoveryCommand(transaction, paths.root, strategy)] : [],
  };
  try {
    assertRecoveryBinding(transaction, distribution, strategy);
  } catch (error) {
    const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
    return envelope("recover", distribution, paths.root, {
      ...base,
      status: "conflict",
      errors: [issue(normalized.code, null, normalized.message, normalized.facts, normalized.repair)],
    }, transactionView(transaction));
  }
  if (!apply) return envelope("recover", distribution, paths.root, base, transactionView(transaction));
  try {
    await withRepositoryMutation(paths.root, async (lockedPaths) => {
      await cleanupOrphans(lockedPaths, fault);
      const current = await readCanonicalMaintenance(lockedPaths);
      if (!current || current.transactionId !== transaction.transactionId) fail("E_MAINTENANCE_CONFLICT", "canonical transaction changed while waiting for the lock");
      assertRecoveryBinding(current, distribution, strategy);
      if (strategy === "resume") await resumeTransaction(lockedPaths, current, fault);
      else await rollbackTransaction(lockedPaths, current, fault);
    });
  } catch (error) {
    const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
    const status = new Set(["E_MAINTENANCE_CONFLICT", "E_TRANSACTION_VERSION", "E_RECOVERY_VERSION_MISMATCH", "E_RECOVERY_MANIFEST_MISMATCH", "E_RECOVERY_COMMITTED"]).has(normalized.code) ? "conflict" : "error";
    return envelope("recover", distribution, paths.root, { ...base, status, errors: [issue(normalized.code, null, normalized.message, normalized.facts, normalized.repair)] }, transactionView(transaction));
  }
  return envelope("recover", distribution, paths.root, { ...base, status: "applied", applied: true, nextActions: [] }, transactionView(transaction));
}

async function doctor(target, distribution) {
  const paths = await repositoryPaths(target);
  const transaction = await readCanonicalMaintenance(paths);
  const readiness = { runtimeReady: false, governanceReady: false, completionEvidenceToolingReady: false };
  const warnings = [];
  const errors = [];
  try {
    for (const name of await readdir(paths.controlDir)) {
      if (!name.startsWith("maintenance.tmp-") && !name.startsWith("maintenance.gc-")) continue;
      const stat = await lstat(join(paths.controlDir, name));
      if (stat.isDirectory() && !stat.isSymbolicLink()) warnings.push(issue("W_MAINTENANCE_ORPHAN", null, "non-canonical maintenance residue will be cleaned by the next Lifecycle Apply", { name }));
      else errors.push(issue("E_MAINTENANCE_CONFLICT", null, "non-canonical maintenance residue is unsafe", { name }));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let ledger = null;
  try { ledger = await readLedger(paths.root); }
  catch (error) { errors.push(issue(error.code, LEDGER_PATH, error.message)); }
  const targets = distribution.files.filter((entry) => entry.kind !== "package-only");
  let transactionNextActions = [];
  if (transaction) {
    if (validateTransaction(transaction)) {
      const command = formatRecoveryCommand(transaction, paths.root);
      transactionNextActions = [command];
      errors.push(issue("E_MAINTENANCE_PENDING", null, "canonical maintenance transaction exists", transactionView(transaction), command));
    } else errors.push(issue("E_TRANSACTION_VERSION", null, "transaction schema is incompatible"));
  }
  if (!ledger && errors.length === 0) {
    const traces = [];
    for (const entry of targets) if ((await fileFact(paths.root, entry.targetPath)).type !== "absent") traces.push(entry.targetPath);
    if (traces.length) errors.push(issue("E_UNTRACKED_INSTALL", null, "managed targets exist without an install ledger", { paths: traces }));
    else warnings.push(issue("W_NOT_INSTALLED", null, "AI Vibe Demo Kit is not installed", null, formatInitCommand(distribution.value.package.version, paths.root)));
  }
  if (ledger && errors.length === 0) {
    let managedHealthy = ledger.installationState === "installed";
    for (const entry of ledger.files) {
      const state = relation(entry, await fileFact(paths.root, entry.path));
      if (entry.kind === "managed" && (entry.state !== "installed" || state !== "B")) {
        managedHealthy = false;
        errors.push(issue("E_RUNTIME_DAMAGED", entry.path, "managed Runtime file is damaged or unsafe", { state }));
      } else if (entry.kind === "seed" && (entry.state !== "installed" || state !== "B")) warnings.push(issue("W_SEED_DRIFT", entry.path, "seed differs from installed source", { state }));
    }
    const layoutOutdated = runtimeLayoutOutdated(targets, ledger);
    if (layoutOutdated) {
      const repair = formatUpgradeCommand(distribution.value.package.version, paths.root);
      warnings.push(issue(
        "W_RUNTIME_LAYOUT_OUTDATED",
        LEDGER_PATH,
        "installed Runtime layout is healthy but requires an upgrade to the current managed layout",
        { installedVersion: ledger.package.version, targetVersion: distribution.value.package.version },
        repair,
      ));
      if (!transaction) transactionNextActions.push(repair);
    }
    const inspected = await inspectDoctorReadiness({ root: paths.root, runtimeFilesHealthy: managedHealthy, allowLegacy: layoutOutdated });
    Object.assign(readiness, inspected.readiness);
    warnings.push(...inspected.warnings);
    errors.push(...inspected.errors);
  }
  let status = "ok";
  if (errors.length) status = "conflict";
  else if (!ledger || warnings.length || !readiness.governanceReady) status = "manual-action-required";
  return envelope("doctor", distribution, paths.root, { status, installedVersion: ledger?.package?.version ?? null, applied: false, changes: [], readiness, warnings, errors, nextActions: transactionNextActions }, transactionView(transaction));
}

export async function runDistributionCommand({ sourceRoot, command, target = process.cwd(), apply = false, strategy = null, fault = async () => {}, syncAdapter = createNpmSyncAdapter() }) {
  const distribution = await loadDistributionManifest(sourceRoot);
  if (command === "version") return envelope(command, distribution, null, { status: "ok", installedVersion: null, applied: false, changes: [], warnings: [], errors: [] });
  try {
    if ((await lstat(resolve(target))).isSymbolicLink()) fail("E_PATH_SYMLINK", "lifecycle target must not be a symlink");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const paths = await repositoryPaths(target);
  if (command === "sync") {
    try {
      const plan = await runSync({ distribution, gitRoot: paths.root, apply, adapter: syncAdapter });
      return envelope(command, distribution, paths.root, {
        ...plan,
        installedVersion: plan.installedVersion ?? plan.package?.installedVersion,
      }, plan.transaction ?? null);
    }
    catch (error) {
      const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
      return envelope(command, distribution, paths.root, { status: "error", installedVersion: null, applied: false, changes: [], warnings: [], errors: [issue(normalized.code, null, normalized.message, normalized.facts, normalized.repair)], nextActions: [] });
    }
  }
  if (command === "doctor") return doctor(paths.root, distribution);
  if (command === "recover") {
    if (!new Set(["resume", "rollback"]).has(strategy)) fail("E_USAGE", "recover requires --strategy resume or rollback");
    return recover(paths.root, distribution, strategy, apply, fault);
  }
  const transaction = await readCanonicalMaintenance(paths);
  if (transaction) {
    const valid = validateTransaction(transaction);
    const error = valid
      ? issue("E_MAINTENANCE_PENDING", null, "canonical maintenance transaction exists")
      : issue("E_TRANSACTION_VERSION", null, "transaction schema is incompatible");
    return envelope(command, distribution, paths.root, {
      ...conflictPlan(null, [error]),
      nextActions: valid ? [formatRecoveryCommand(transaction, paths.root)] : [],
    }, transactionView(transaction));
  }
  if (!new Set(["init", "upgrade", "uninstall"]).has(command)) fail("E_USAGE", `unknown command: ${command}`);
  if (command === "init" || apply) {
    try {
      const result = await applyPlan(command, paths.root, distribution, fault);
      return envelope(command, distribution, paths.root, result.plan, transactionView(result.transaction));
    } catch (error) {
      const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
      const current = await readCanonicalMaintenance(paths).catch(() => null);
      const installed = await readLedger(paths.root, { strict: false });
      const applied = current
        ? current.phase !== "prepared" || current.cursor > 0
        : installed?.package?.version === distribution.value.package.version && command !== "uninstall";
      const status = new Set(["E_ACTIVE_WORK_ITEM", "E_MAINTENANCE_PENDING", "E_MAINTENANCE_CONFLICT", "E_LEDGER_INVALID", "E_INSTALL_CONFLICT"]).has(normalized.code) ? "conflict" : "error";
      const currentValid = current && validateTransaction(current);
      return envelope(command, distribution, paths.root, { status, installedVersion: installed?.package?.version ?? null, applied, changes: [], warnings: [], errors: [issue(normalized.code, null, normalized.message, normalized.facts, normalized.repair)], nextActions: currentValid ? [formatRecoveryCommand(current, paths.root)] : [] }, transactionView(current));
    }
  }
  const plan = await planOperation(command, paths.root, distribution);
  if (plan.status === "applied") plan.status = "planned";
  plan.applied = false;
  return envelope(command, distribution, paths.root, plan);
}
