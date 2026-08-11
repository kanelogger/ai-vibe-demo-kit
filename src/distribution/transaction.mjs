import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fail } from "../shared/errors.mjs";
import { resolveInside } from "../shared/path-safety.mjs";
import { factEqual, fileFact, safeRelative, sha256, validateFact } from "./ownership.mjs";

const LEDGER_PATH = ".harness/install-lock.json";
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const modeNumber = (mode) => Number.parseInt(mode, 8);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

async function removeOwnedTemporaryFile(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("E_MAINTENANCE_CONFLICT", `transaction temporary path is unsafe: ${path}`);
    await unlink(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function atomicWrite(path, content, mode, fault = async () => {}, temporaryPath = null) {
  await mkdir(dirname(path), { recursive: true });
  const temp = temporaryPath ?? `${path}.ai-vibe-demo-kit-${randomUUID()}.tmp`;
  if (temporaryPath) await removeOwnedTemporaryFile(temp);
  let handle = null;
  try {
    handle = await open(temp, "wx", modeNumber(mode));
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await fault(`write:${path}`);
    await rename(temp, path);
    await chmod(path, modeNumber(mode));
    await fault(`rename:${path}`);
    await fault(`chmod:${path}`);
    await syncDirectory(dirname(path));
    await fault(`fsync:${path}`);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await unlink(temp).catch((cleanupError) => {
      if (cleanupError.code !== "ENOENT") throw cleanupError;
    });
    throw error;
  }
}

async function atomicJson(path, value, fault = async () => {}) {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`, "0644", fault);
}

export async function cleanupOrphans(paths, fault = async () => {}) {
  await mkdir(paths.controlDir, { recursive: true });
  for (const name of await readdir(paths.controlDir)) {
    if (!name.startsWith("maintenance.tmp-") && !name.startsWith("maintenance.gc-")) continue;
    const target = join(paths.controlDir, name);
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("E_MAINTENANCE_CONFLICT", `unsafe maintenance orphan: ${name}`);
    await rm(target, { recursive: true });
    await fault(`cleanup:${name}`);
  }
}

export function transactionView(transaction) {
  if (!transaction) return null;
  const { actions: ignoredActions, preserved: ignoredPreserved, ...view } = transaction;
  return view;
}

export async function prepareTransaction(paths, distribution, command, plan, fault) {
  const transactionId = randomUUID();
  const tempPath = join(paths.controlDir, `maintenance.tmp-${transactionId}`);
  await mkdir(tempPath, { recursive: false });
  const actions = [];
  for (const planned of plan.fileActions) {
    const before = await fileFact(paths.root, planned.path);
    let after = { type: "absent", sha256: null, mode: null };
    let stagedPath = null;
    let backupPath = null;
    if (planned.action !== "remove") {
      const source = distribution.files.find((entry) => entry.sourcePath === planned.sourcePath);
      after = { type: "file", sha256: source.source.sha256, mode: source.source.mode };
      stagedPath = join("staged", planned.path);
      await atomicWrite(join(tempPath, stagedPath), source.source.content, source.source.mode, fault);
    }
    if (before.type === "file") {
      backupPath = join("backup", planned.path);
      await atomicWrite(join(tempPath, backupPath), await readFile(resolveInside(paths.root, planned.path)), before.mode, fault);
    }
    actions.push({ ...planned, before, after, stagedPath, backupPath });
  }
  const ledgerBefore = await fileFact(paths.root, LEDGER_PATH);
  let ledgerAfter = { type: "absent", sha256: null, mode: null };
  let ledgerStaged = null;
  let ledgerBackup = null;
  if (plan.nextLedger !== null) {
    const content = `${JSON.stringify(plan.nextLedger, null, 2)}\n`;
    ledgerStaged = "target-ledger.json";
    await atomicWrite(join(tempPath, ledgerStaged), content, "0644", fault);
    ledgerAfter = { type: "file", sha256: sha256(content), mode: "0644" };
  }
  if (ledgerBefore.type === "file") {
    ledgerBackup = "backup-ledger.json";
    await atomicWrite(join(tempPath, ledgerBackup), await readFile(resolveInside(paths.root, LEDGER_PATH)), ledgerBefore.mode, fault);
  }
  actions.push({ action: plan.nextLedger === null ? "remove" : ledgerBefore.type === "absent" ? "create" : "replace", path: LEDGER_PATH, kind: "ledger", before: ledgerBefore, after: ledgerAfter, stagedPath: ledgerStaged, backupPath: ledgerBackup });
  const transaction = {
    schemaVersion: 1,
    transactionId,
    createdByPackageVersion: distribution.value.package.version,
    operation: command,
    sourceVersion: plan.installedVersion,
    targetVersion: command === "uninstall" ? null : distribution.value.package.version,
    distributionManifestDigest: distribution.digest,
    phase: "prepared",
    cursor: 0,
    createdDirectories: plan.transactionCreatedDirectories ?? [],
    removeDirectories: plan.removeDirectories ?? [],
    preserved: (plan.changes ?? [])
      .filter((change) => change.action === "preserve")
      .map((change) => ({ path: change.path, kind: change.kind, expected: change.before })),
    actions,
  };
  await atomicJson(join(tempPath, "transaction.json"), transaction, fault);
  await syncDirectory(tempPath);
  await fault("staging-persisted");
  await rename(tempPath, paths.maintenancePath);
  await syncDirectory(paths.controlDir);
  await fault("tmp-to-canonical");
  return transaction;
}

async function assertActionState(paths, action, expected) {
  const actual = await fileFact(paths.root, action.path);
  if (!factEqual(actual, expected)) fail("E_MAINTENANCE_CONFLICT", `maintenance target is neither declared before nor after state: ${action.path}`, { facts: { path: action.path, actual, before: action.before, after: action.after } });
  return actual;
}

async function writeActionState(paths, transaction, action, direction, fault) {
  const target = resolveInside(paths.root, action.path);
  const temporaryPath = `${target}.ai-vibe-demo-kit-${transaction.transactionId}.tmp`;
  await removeOwnedTemporaryFile(temporaryPath);
  const desired = direction === "after" ? action.after : action.before;
  const other = direction === "after" ? action.before : action.after;
  const actual = await fileFact(paths.root, action.path);
  if (factEqual(actual, desired)) return;
  if (!factEqual(actual, other)) fail("E_MAINTENANCE_CONFLICT", `maintenance target has an unrecognized third state: ${action.path}`, { facts: { path: action.path, actual, before: action.before, after: action.after } });
  if (desired.type === "absent") {
    await unlink(target).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await fault(`remove:${action.path}`);
    await syncDirectory(dirname(target));
    await fault(`fsync-remove:${action.path}`);
    return;
  }
  const relativeSource = direction === "after" ? action.stagedPath : action.backupPath;
  if (!relativeSource) fail("E_TRANSACTION_VERSION", `transaction lacks ${direction} content for ${action.path}`);
  await atomicWrite(target, await readFile(join(paths.maintenancePath, relativeSource)), desired.mode, fault, temporaryPath);
}

async function updateJournal(paths, transaction, fault) {
  await atomicJson(join(paths.maintenancePath, "transaction.json"), transaction, fault);
  await fault("journal-update");
}

async function removeOwnedDirectories(root, directories) {
  for (const path of [...(directories ?? [])].sort((a, b) => b.split("/").length - a.split("/").length)) {
    const target = resolveInside(root, path);
    if (!target) continue;
    try {
      const stat = await lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      await rmdir(target);
    } catch (error) {
      if (!new Set(["ENOENT", "ENOTEMPTY", "EEXIST"]).has(error.code)) throw error;
    }
  }
}

async function assertPreservedStates(paths, transaction) {
  for (const preserved of transaction.preserved) {
    const actual = await fileFact(paths.root, preserved.path);
    if (!factEqual(actual, preserved.expected)) fail("E_MAINTENANCE_CONFLICT", `preserved target changed during maintenance: ${preserved.path}`, { facts: { path: preserved.path, actual, expected: preserved.expected } });
  }
}

async function finalizeCommitted(paths, transaction, fault) {
  for (const action of transaction.actions) await assertActionState(paths, action, action.after);
  await assertPreservedStates(paths, transaction);
  await fault("committed-before-cleanup");
  const gcPath = join(paths.controlDir, `maintenance.gc-${transaction.transactionId}`);
  await rename(paths.maintenancePath, gcPath);
  await syncDirectory(paths.controlDir);
  await fault("canonical-to-gc");
  await rm(gcPath, { recursive: true });
  await fault("gc-delete");
}

export async function resumeTransaction(paths, transaction, fault) {
  if (transaction.phase === "committed") {
    await finalizeCommitted(paths, transaction, fault);
    return;
  }
  transaction.phase = "applying";
  await updateJournal(paths, transaction, fault);
  for (let index = transaction.cursor; index < transaction.actions.length; index += 1) {
    const action = transaction.actions[index];
    if (action.kind === "ledger") {
      await fault("before-ledger-commit");
      await assertPreservedStates(paths, transaction);
    }
    await writeActionState(paths, transaction, action, "after", fault);
    if (action.kind === "ledger") await fault("ledger-commit");
    transaction.cursor = index + 1;
    await updateJournal(paths, transaction, fault);
  }
  if (transaction.removeDirectories.length > 0) {
    await removeOwnedDirectories(paths.root, transaction.removeDirectories);
    await fault("directory-cleanup");
  }
  for (const action of transaction.actions) await assertActionState(paths, action, action.after);
  await assertPreservedStates(paths, transaction);
  transaction.phase = "committed";
  await updateJournal(paths, transaction, fault);
  await finalizeCommitted(paths, transaction, fault);
}

export async function rollbackTransaction(paths, transaction, fault) {
  if (transaction.phase === "committed") fail("E_RECOVERY_COMMITTED", "committed transactions cannot be rolled back");
  await assertPreservedStates(paths, transaction);
  transaction.phase = "rolling-back";
  transaction.cursor = transaction.actions.length;
  await updateJournal(paths, transaction, fault);
  for (let index = transaction.actions.length - 1; index >= 0; index -= 1) {
    await writeActionState(paths, transaction, transaction.actions[index], "before", fault);
    transaction.cursor = index;
    await updateJournal(paths, transaction, fault);
  }
  for (const action of transaction.actions) await assertActionState(paths, action, action.before);
  await assertPreservedStates(paths, transaction);
  await removeOwnedDirectories(paths.root, transaction.createdDirectories);
  const gcPath = join(paths.controlDir, `maintenance.gc-${transaction.transactionId}`);
  await rename(paths.maintenancePath, gcPath);
  await syncDirectory(paths.controlDir);
  await rm(gcPath, { recursive: true });
}

export function validateTransaction(transaction) {
  const version = (value) => value === null || typeof value === "string" && SEMVER.test(value);
  const directories = (value) => Array.isArray(value) && value.every(safeRelative);
  const preserved = Array.isArray(transaction?.preserved) && transaction.preserved.every((entry) => isObject(entry)
    && safeRelative(entry.path)
    && new Set(["managed", "seed"]).has(entry.kind)
    && validateFact(entry.expected));
  const actions = Array.isArray(transaction?.actions) && transaction.actions.every((action) => isObject(action)
    && new Set(["create", "replace", "remove", "chmod"]).has(action.action)
    && safeRelative(action.path)
    && new Set(["managed", "seed", "ledger"]).has(action.kind)
    && validateFact(action.before)
    && validateFact(action.after)
    && (action.stagedPath === null || safeRelative(action.stagedPath))
    && (action.backupPath === null || safeRelative(action.backupPath)));
  return isObject(transaction)
    && transaction.schemaVersion === 1
    && typeof transaction.transactionId === "string"
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(transaction.transactionId)
    && typeof transaction.createdByPackageVersion === "string"
    && SEMVER.test(transaction.createdByPackageVersion)
    && new Set(["init", "upgrade", "uninstall"]).has(transaction.operation)
    && version(transaction.sourceVersion)
    && version(transaction.targetVersion)
    && /^sha256:[a-f0-9]{64}$/.test(transaction.distributionManifestDigest ?? "")
    && new Set(["prepared", "applying", "rolling-back", "committed"]).has(transaction.phase)
    && Number.isInteger(transaction.cursor)
    && transaction.cursor >= 0
    && transaction.cursor <= (transaction.actions?.length ?? -1)
    && directories(transaction.createdDirectories)
    && directories(transaction.removeDirectories)
    && preserved
    && actions;
}

export function assertRecoveryBinding(transaction, distribution, strategy) {
  if (!validateTransaction(transaction)) fail("E_TRANSACTION_VERSION", "transaction schema is incompatible");
  if (transaction.createdByPackageVersion !== distribution.value.package.version) {
    fail("E_RECOVERY_VERSION_MISMATCH", "recover must use the package version that created the transaction", { facts: { expected: transaction.createdByPackageVersion, actual: distribution.value.package.version } });
  }
  if (transaction.distributionManifestDigest !== distribution.digest) fail("E_RECOVERY_MANIFEST_MISMATCH", "Distribution Manifest digest does not match the transaction");
  if (transaction.phase === "committed" && strategy === "rollback") fail("E_RECOVERY_COMMITTED", "committed transactions only support resume");
}
