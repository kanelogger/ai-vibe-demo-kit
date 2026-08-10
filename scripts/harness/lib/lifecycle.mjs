import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { HarnessError, fail } from "./errors.mjs";
import { loadHarnessManifest } from "./manifest.mjs";
import { firstSymlinkInPath, resolveInside } from "./path-safety.mjs";
import { readCanonicalMaintenance, repositoryPaths, withRepositoryMutation } from "./repository-guard.mjs";
import { loadState } from "./store.mjs";
import { validateEnvironmentManifest, validateWorkflow } from "./validator.mjs";

const PACKAGE_NAME = "ai-vibe-demo-kit";
const MANIFEST_PATH = ".harness/distribution-manifest.json";
const LEDGER_PATH = ".harness/install-lock.json";
const KINDS = new Set(["managed", "seed", "package-only"]);
const FILE_STATES = new Set(["installed", "preserved", "orphaned"]);
const STATUS_EXIT = new Map([
  ["ok", 0], ["planned", 0], ["applied", 0], ["idempotent", 0],
  ["manual-action-required", 1], ["conflict", 2], ["error", 2],
]);

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const modeString = (mode) => (mode & 0o777).toString(8).padStart(4, "0");
const modeNumber = (mode) => Number.parseInt(mode, 8);
const issue = (code, path, message, facts = null, repair = null) => ({ code, path, message, facts, repair });

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelative(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.startsWith("/")
    && !path.split(/[\\/]/).includes("..")
    && !path.includes("\\");
}

function factEqual(left, right) {
  if (!left || !right || left.type !== right.type) return false;
  if (left.type !== "file") return left.type === right.type;
  return left.sha256 === right.sha256 && left.mode === right.mode;
}

function factView(value) {
  return { type: value.type, sha256: value.sha256 ?? null, mode: value.mode ?? null };
}

async function fileFact(root, path) {
  const target = resolveInside(root, path);
  if (!target) fail("E_PATH_OUTSIDE", `path leaves repository: ${path}`);
  const linked = await firstSymlinkInPath(root, target);
  if (linked) return { type: "symlink", sha256: null, mode: null };
  try {
    const stat = await lstat(target);
    if (!stat.isFile()) return { type: "other", sha256: null, mode: modeString(stat.mode) };
    return { type: "file", sha256: sha256(await readFile(target)), mode: modeString(stat.mode) };
  } catch (error) {
    if (error.code === "ENOENT") return { type: "absent", sha256: null, mode: null };
    throw error;
  }
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
  if (value.package.name !== PACKAGE_NAME || typeof value.package.version !== "string" || !/^\d+\.\d+\.\d+/.test(value.package.version)) {
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

function validateFact(value) {
  if (!isObject(value) || !new Set(["file", "absent", "symlink", "other"]).has(value.type)) return false;
  return value.type !== "file" || (typeof value.sha256 === "string" && /^sha256:[a-f0-9]{64}$/.test(value.sha256) && /^0[0-7]{3}$/.test(value.mode));
}

function validateLedger(value) {
  if (!isObject(value) || value.schemaVersion !== 1 || !new Set(["installed", "residual"]).has(value.installationState)) return false;
  if (!isObject(value.package) || value.package.name !== PACKAGE_NAME || typeof value.package.version !== "string") return false;
  if (!Array.isArray(value.createdDirectories) || value.createdDirectories.some((path) => !safeRelative(path))) return false;
  if (!Array.isArray(value.files)) return false;
  const paths = new Set();
  for (const entry of value.files) {
    if (!isObject(entry) || !safeRelative(entry.path) || !new Set(["managed", "seed"]).has(entry.kind) || !FILE_STATES.has(entry.state)) return false;
    if (paths.has(entry.path)) return false;
    paths.add(entry.path);
    if (!isObject(entry.source) || typeof entry.source.version !== "string" || !/^sha256:[a-f0-9]{64}$/.test(entry.source.sha256 ?? "") || !/^0[0-7]{3}$/.test(entry.source.mode ?? "")) return false;
    if (!validateFact(entry.observed)) return false;
  }
  return true;
}

async function readLedger(root, { strict = true } = {}) {
  const path = resolveInside(root, LEDGER_PATH);
  try {
    if (await firstSymlinkInPath(root, path)) fail("E_LEDGER_INVALID", "install ledger must not use symlinks");
    const stat = await lstat(path);
    if (!stat.isFile()) fail("E_LEDGER_INVALID", "install ledger must be a regular file");
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!validateLedger(value)) fail("E_LEDGER_INVALID", "install ledger schema is invalid");
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (!strict) return { invalid: true, error };
    if (error instanceof HarnessError) throw error;
    fail("E_LEDGER_INVALID", `install ledger cannot be read: ${error.message}`);
  }
}

function relation(entry, actual) {
  if (actual.type === "absent") return "A";
  if (actual.type !== "file") return "U";
  const source = { type: "file", sha256: entry.source.sha256, mode: entry.source.mode };
  if (actual.sha256 === source.sha256 && actual.mode === source.mode) return "B";
  if (actual.sha256 === source.sha256) return "M";
  if (factEqual(actual, entry.observed)) return "O";
  return "T";
}

function ledgerEntry(entry, source, observed, state = "installed") {
  return {
    path: entry.targetPath,
    kind: entry.kind,
    state,
    source: { version: source.version, sha256: source.sha256, mode: source.mode },
    observed: factView(observed),
  };
}

function publicChange(action, path, kind, before, after, reason = null) {
  return { action, path, kind, before: factView(before), after: factView(after), reason };
}

function conflictPlan(installedVersion, errors) {
  return { status: "conflict", installedVersion, applied: false, changes: [], warnings: [], errors, nextLedger: undefined, fileActions: [] };
}

async function missingCreatedDirectories(root, targetEntries) {
  const missing = new Set();
  for (const entry of targetEntries) {
    let cursor = dirname(entry.targetPath);
    while (cursor !== "." && cursor !== "") {
      const target = resolveInside(root, cursor);
      try {
        const stat = await lstat(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        missing.add(cursor);
      }
      cursor = dirname(cursor);
    }
  }
  return [...missing].sort((a, b) => a.split("/").length - b.split("/").length);
}

async function planInit(root, distribution, ledger) {
  const targets = distribution.files.filter((entry) => entry.kind !== "package-only");
  if (!ledger) {
    const occupied = [];
    for (const entry of targets) {
      const actual = await fileFact(root, entry.targetPath);
      if (actual.type !== "absent") occupied.push(entry.targetPath);
    }
    if (occupied.length) return conflictPlan(null, [issue("E_INSTALL_CONFLICT", null, "fresh init found existing Manifest targets", { paths: occupied }, "Remove or relocate the paths; this CLI does not adopt untracked installations.")]);
    const createdDirectories = await missingCreatedDirectories(root, targets);
    const files = targets.map((entry) => ledgerEntry(entry, { version: distribution.value.package.version, ...entry.source }, entry.source));
    return {
      status: "applied",
      installedVersion: null,
      applied: true,
      changes: targets.map((entry) => publicChange("create", entry.targetPath, entry.kind, { type: "absent", sha256: null, mode: null }, entry.source)),
      warnings: [], errors: [],
      fileActions: targets.map((entry) => ({ action: "create", path: entry.targetPath, kind: entry.kind, sourcePath: entry.sourcePath })),
      nextLedger: { schemaVersion: 1, installationState: "installed", package: { name: PACKAGE_NAME, version: distribution.value.package.version }, createdDirectories, files },
      transactionCreatedDirectories: createdDirectories,
    };
  }
  if (ledger.installationState === "residual") return conflictPlan(ledger.package.version, [issue("E_RESIDUAL_INSTALL", LEDGER_PATH, "residual installation must be uninstalled before init")]);
  if (ledger.package.version !== distribution.value.package.version) return conflictPlan(ledger.package.version, [issue("E_UPGRADE_REQUIRED", LEDGER_PATH, "installed version differs; use upgrade")]);
  const byPath = new Map(ledger.files.map((entry) => [entry.path, entry]));
  const seedWarnings = [];
  for (const target of targets) {
    const entry = byPath.get(target.targetPath);
    const actual = await fileFact(root, target.targetPath);
    if (!entry || entry.kind !== target.kind || entry.kind === "managed" && (entry.state !== "installed" || relation(entry, actual) !== "B")) {
      return conflictPlan(ledger.package.version, [issue("E_INSTALL_CONFLICT", target.targetPath, "same-version managed installation or ledger is not exact")]);
    }
    if (entry.kind === "seed" && (entry.state !== "installed" || relation(entry, actual) !== "B")) {
      seedWarnings.push(issue("W_SEED_DRIFT", target.targetPath, "seed differs from its installed source", { state: entry.state, relation: relation(entry, actual) }, "Review the seed manually or uninstall it explicitly."));
    }
  }
  if (byPath.size !== targets.length) return conflictPlan(ledger.package.version, [issue("E_LEDGER_INVALID", LEDGER_PATH, "same-version ledger file set differs from the Distribution Manifest")]);
  return { status: seedWarnings.length ? "manual-action-required" : "idempotent", installedVersion: ledger.package.version, applied: false, changes: [], warnings: seedWarnings, errors: [], fileActions: [], nextLedger: ledger };
}

async function planUpgrade(root, distribution, ledger) {
  if (!ledger || ledger.installationState !== "installed") return conflictPlan(ledger?.package?.version ?? null, [issue("E_UPGRADE_REQUIRES_LEDGER", LEDGER_PATH, "upgrade requires an installed ledger")]);
  const old = new Map(ledger.files.map((entry) => [entry.path, entry]));
  const next = new Map();
  const changes = [];
  const fileActions = [];
  const warnings = [];
  const conflicts = [];
  const version = distribution.value.package.version;
  for (const target of distribution.files.filter((entry) => entry.kind !== "package-only")) {
    const prior = old.get(target.targetPath);
    const actual = await fileFact(root, target.targetPath);
    if (!prior) {
      if (actual.type !== "absent") conflicts.push(issue("E_INSTALL_CONFLICT", target.targetPath, "new Manifest target is occupied by an unregistered object"));
      else {
        changes.push(publicChange("create", target.targetPath, target.kind, actual, target.source));
        fileActions.push({ action: "create", path: target.targetPath, kind: target.kind, sourcePath: target.sourcePath });
        next.set(target.targetPath, ledgerEntry(target, { version, ...target.source }, target.source));
      }
      continue;
    }
    old.delete(target.targetPath);
    if (prior.kind !== target.kind) {
      conflicts.push(issue("E_OWNERSHIP_CHANGE", target.targetPath, "managed/seed ownership kind cannot change"));
      continue;
    }
    const state = relation(prior, actual);
    if (prior.kind === "managed") {
      if (prior.state !== "installed" || new Set(["O", "T", "U"]).has(state)) {
        conflicts.push(issue("E_INSTALL_CONFLICT", target.targetPath, "managed target has an unsafe third state", { ledgerState: prior.state, relation: state }));
        continue;
      }
      const action = actual.type === "absent" ? "create" : actual.sha256 === target.source.sha256 && actual.mode !== target.source.mode ? "chmod" : factEqual(actual, target.source) ? null : "replace";
      if (action) {
        changes.push(publicChange(action, target.targetPath, target.kind, actual, target.source));
        fileActions.push({ action, path: target.targetPath, kind: target.kind, sourcePath: target.sourcePath });
      }
      next.set(target.targetPath, ledgerEntry(target, { version, ...target.source }, target.source));
      continue;
    }
    if (prior.state === "installed" && state === "B") {
      const action = factEqual(actual, target.source) ? null : "replace";
      if (action) {
        changes.push(publicChange(action, target.targetPath, target.kind, actual, target.source));
        fileActions.push({ action, path: target.targetPath, kind: target.kind, sourcePath: target.sourcePath });
      }
      next.set(target.targetPath, ledgerEntry(target, { version, ...target.source }, target.source));
    } else {
      changes.push(publicChange("preserve", target.targetPath, target.kind, actual, actual, "seed is modified, absent, unsafe or already preserved"));
      warnings.push(issue("W_SEED_PRESERVED", target.targetPath, "seed was preserved for manual review", { ledgerState: prior.state, relation: state }));
      next.set(target.targetPath, ledgerEntry(target, { version, ...target.source }, actual, "preserved"));
    }
  }
  for (const prior of old.values()) {
    const actual = await fileFact(root, prior.path);
    const state = relation(prior, actual);
    if (prior.kind === "managed") {
      if (prior.state !== "installed" || !new Set(["B", "A"]).has(state)) conflicts.push(issue("E_INSTALL_CONFLICT", prior.path, "removed managed target is modified or unsafe", { relation: state }));
      else {
        if (state === "B") {
          changes.push(publicChange("remove", prior.path, prior.kind, actual, { type: "absent", sha256: null, mode: null }));
          fileActions.push({ action: "remove", path: prior.path, kind: prior.kind, sourcePath: null });
        } else changes.push(publicChange("drop-ledger-entry", prior.path, prior.kind, actual, actual));
      }
    } else if (prior.state === "installed" && new Set(["B", "A"]).has(state)) {
      if (state === "B") {
        changes.push(publicChange("remove", prior.path, prior.kind, actual, { type: "absent", sha256: null, mode: null }));
        fileActions.push({ action: "remove", path: prior.path, kind: prior.kind, sourcePath: null });
      } else changes.push(publicChange("drop-ledger-entry", prior.path, prior.kind, actual, actual));
    } else if (actual.type === "absent" && prior.state !== "installed") {
      changes.push(publicChange("drop-ledger-entry", prior.path, prior.kind, actual, actual));
    } else {
      changes.push(publicChange("preserve", prior.path, prior.kind, actual, actual, "removed seed is retained as orphaned"));
      warnings.push(issue("W_SEED_ORPHANED", prior.path, "removed seed remains for manual review"));
      next.set(prior.path, { ...prior, state: "orphaned", observed: actual });
    }
  }
  if (conflicts.length) return conflictPlan(ledger.package.version, conflicts);
  const nextLedger = {
    ...ledger,
    installationState: "installed",
    package: { name: PACKAGE_NAME, version },
    createdDirectories: [...new Set([...ledger.createdDirectories, ...await missingCreatedDirectories(root, distribution.files.filter((entry) => entry.kind !== "package-only"))])],
    files: [...next.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
  const changedVersion = ledger.package.version !== version;
  return {
    status: warnings.length ? "manual-action-required" : changes.length || changedVersion ? "applied" : "idempotent",
    installedVersion: ledger.package.version,
    applied: changes.length > 0 || changedVersion,
    changes, warnings, errors: [], fileActions, nextLedger,
    transactionCreatedDirectories: nextLedger.createdDirectories.filter((path) => !ledger.createdDirectories.includes(path)),
  };
}

async function planUninstall(root, ledger) {
  if (!ledger) return { status: "idempotent", installedVersion: null, applied: false, changes: [], warnings: [], errors: [], fileActions: [], nextLedger: null, createdDirectories: [] };
  const residual = [];
  const changes = [];
  const warnings = [];
  const fileActions = [];
  for (const entry of ledger.files) {
    const actual = await fileFact(root, entry.path);
    const state = relation(entry, actual);
    if (entry.state === "installed" && state === "B") {
      changes.push(publicChange("remove", entry.path, entry.kind, actual, { type: "absent", sha256: null, mode: null }));
      fileActions.push({ action: "remove", path: entry.path, kind: entry.kind, sourcePath: null });
    } else if (actual.type === "absent") {
      changes.push(publicChange("drop-ledger-entry", entry.path, entry.kind, actual, actual));
    } else {
      changes.push(publicChange("preserve", entry.path, entry.kind, actual, actual, "uninstall never deletes modified or unsafe content"));
      warnings.push(issue("W_UNINSTALL_RESIDUAL", entry.path, "path was preserved as an uninstall residual", { relation: state }));
      residual.push({ ...entry, state: "orphaned", observed: actual });
    }
  }
  const nextLedger = residual.length ? { ...ledger, installationState: "residual", files: residual } : null;
  return {
    status: warnings.length ? "manual-action-required" : changes.length ? "applied" : "idempotent",
    installedVersion: ledger.package.version,
    applied: changes.length > 0,
    changes, warnings, errors: [], fileActions, nextLedger, removeDirectories: ledger.createdDirectories,
  };
}

async function planOperation(command, root, distribution) {
  let ledger;
  try {
    ledger = await readLedger(root);
  } catch (error) {
    if (error.code === "E_LEDGER_INVALID") return conflictPlan(null, [issue(error.code, LEDGER_PATH, error.message)]);
    throw error;
  }
  if (command === "init") return planInit(root, distribution, ledger);
  if (command === "upgrade") return planUpgrade(root, distribution, ledger);
  if (command === "uninstall") return planUninstall(root, ledger);
  fail("E_USAGE", `unsupported lifecycle operation: ${command}`);
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
  };
}

export function exitCodeForStatus(status) {
  return STATUS_EXIT.get(status) ?? 2;
}

async function atomicWrite(path, content, mode, fault = async () => {}) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.ai-vibe-demo-kit-${randomUUID()}.tmp`;
  const handle = await open(temp, "wx", modeNumber(mode));
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fault(`write:${path}`);
  await rename(temp, path);
  await chmod(path, modeNumber(mode));
  await fault(`rename:${path}`);
  await fault(`chmod:${path}`);
  await syncDirectory(dirname(path));
  await fault(`fsync:${path}`);
}

async function atomicJson(path, value, fault = async () => {}) {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`, "0644", fault);
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function cleanupOrphans(paths, fault = async () => {}) {
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

function transactionView(transaction) {
  if (!transaction) return null;
  const { actions: ignored, ...view } = transaction;
  return view;
}

function recoveryCommand(transaction, root, strategy = "resume") {
  return `npx --yes ${PACKAGE_NAME}@${transaction.createdByPackageVersion} recover --target ${JSON.stringify(root)} --strategy ${strategy} --apply --json`;
}

async function prepareTransaction(paths, distribution, command, plan, fault) {
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
  const desired = direction === "after" ? action.after : action.before;
  const other = direction === "after" ? action.before : action.after;
  const actual = await fileFact(paths.root, action.path);
  if (factEqual(actual, desired)) return;
  if (!factEqual(actual, other)) fail("E_MAINTENANCE_CONFLICT", `maintenance target has an unrecognized third state: ${action.path}`, { facts: { path: action.path, actual, before: action.before, after: action.after } });
  const target = resolveInside(paths.root, action.path);
  if (desired.type === "absent") {
    await unlink(target).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await fault(`remove:${action.path}`);
    await syncDirectory(dirname(target));
    await fault(`fsync-remove:${action.path}`);
    return;
  }
  const relativeSource = direction === "after" ? action.stagedPath : action.backupPath;
  if (!relativeSource) fail("E_TRANSACTION_VERSION", `transaction lacks ${direction} content for ${action.path}`);
  await atomicWrite(target, await readFile(join(paths.maintenancePath, relativeSource)), desired.mode, fault);
}

async function updateJournal(paths, transaction, fault) {
  await atomicJson(join(paths.maintenancePath, "transaction.json"), transaction, fault);
  await fault("journal-update");
}

async function removeCreatedDirectories(root, directories) {
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

async function finalizeCommitted(paths, transaction, fault) {
  for (const action of transaction.actions) await assertActionState(paths, action, action.after);
  await fault("committed-before-cleanup");
  const gcPath = join(paths.controlDir, `maintenance.gc-${transaction.transactionId}`);
  await rename(paths.maintenancePath, gcPath);
  await syncDirectory(paths.controlDir);
  await fault("canonical-to-gc");
  await rm(gcPath, { recursive: true });
  await fault("gc-delete");
}

async function resumeTransaction(paths, transaction, plan, fault) {
  if (transaction.phase === "committed") {
    await finalizeCommitted(paths, transaction, fault);
    return;
  }
  transaction.phase = "applying";
  await updateJournal(paths, transaction, fault);
  for (let index = transaction.cursor; index < transaction.actions.length; index += 1) {
    const action = transaction.actions[index];
    await writeActionState(paths, transaction, action, "after", fault);
    if (action.kind === "ledger") await fault("ledger-commit");
    transaction.cursor = index + 1;
    await updateJournal(paths, transaction, fault);
  }
  if (transaction.operation === "uninstall") await removeCreatedDirectories(paths.root, transaction.removeDirectories);
  for (const action of transaction.actions) await assertActionState(paths, action, action.after);
  transaction.phase = "committed";
  await updateJournal(paths, transaction, fault);
  await finalizeCommitted(paths, transaction, fault);
}

async function rollbackTransaction(paths, transaction, fault) {
  if (transaction.phase === "committed") fail("E_RECOVERY_COMMITTED", "committed transactions cannot be rolled back");
  transaction.phase = "rolling-back";
  transaction.cursor = transaction.actions.length;
  await updateJournal(paths, transaction, fault);
  for (let index = transaction.actions.length - 1; index >= 0; index -= 1) {
    await writeActionState(paths, transaction, transaction.actions[index], "before", fault);
    transaction.cursor = index;
    await updateJournal(paths, transaction, fault);
  }
  for (const action of transaction.actions) await assertActionState(paths, action, action.before);
  await removeCreatedDirectories(paths.root, transaction.createdDirectories);
  const gcPath = join(paths.controlDir, `maintenance.gc-${transaction.transactionId}`);
  await rename(paths.maintenancePath, gcPath);
  await syncDirectory(paths.controlDir);
  await rm(gcPath, { recursive: true });
}

function validateTransaction(transaction) {
  const version = (value) => value === null || typeof value === "string" && /^\d+\.\d+\.\d+/.test(value);
  const directories = (value) => Array.isArray(value) && value.every(safeRelative);
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
    && typeof transaction.createdByPackageVersion === "string"
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
    && actions;
}

async function applyPlan(command, target, distribution, fault) {
  return withRepositoryMutation(target, async (paths) => {
    if (await readCanonicalMaintenance(paths)) fail("E_MAINTENANCE_PENDING", "canonical maintenance already exists");
    await cleanupOrphans(paths, fault);
    const state = await loadState(paths.root);
    if (state.active !== null) fail("E_ACTIVE_WORK_ITEM", "lifecycle apply requires an idle Runtime", { facts: { revision: state.revision, workItemId: state.active.id } });
    const plan = await planOperation(command, paths.root, distribution);
    if (plan.status === "conflict" || plan.status === "idempotent" || plan.status === "manual-action-required" && !plan.applied) return { plan, transaction: null };
    const transaction = await prepareTransaction(paths, distribution, command, plan, fault);
    await resumeTransaction(paths, transaction, plan, fault);
    return { plan: { ...plan, applied: true }, transaction };
  });
}

async function recover(target, distribution, strategy, apply, fault) {
  const paths = await repositoryPaths(target);
  const transaction = await readCanonicalMaintenance(paths);
  if (!transaction) return envelope("recover", distribution, paths.root, conflictPlan(null, [issue("E_MAINTENANCE_MISSING", null, "no canonical maintenance transaction exists")]));
  const installed = await readLedger(paths.root, { strict: false });
  const installedVersion = installed?.invalid ? null : installed?.package?.version ?? null;
  const base = { status: "planned", installedVersion, applied: false, changes: transaction.actions?.filter((entry) => entry.kind !== "ledger").map((entry) => publicChange(entry.action, entry.path, entry.kind, entry.before, entry.after)) ?? [], warnings: [], errors: [], nextActions: [recoveryCommand(transaction, paths.root, strategy)] };
  if (!validateTransaction(transaction)) return envelope("recover", distribution, paths.root, { ...base, status: "conflict", errors: [issue("E_TRANSACTION_VERSION", null, "transaction schema is incompatible")] }, transactionView(transaction));
  if (transaction.createdByPackageVersion !== distribution.value.package.version) return envelope("recover", distribution, paths.root, { ...base, status: "conflict", errors: [issue("E_RECOVERY_VERSION_MISMATCH", null, "recover must use the package version that created the transaction", { expected: transaction.createdByPackageVersion, actual: distribution.value.package.version })] }, transactionView(transaction));
  if (transaction.distributionManifestDigest !== distribution.digest) return envelope("recover", distribution, paths.root, { ...base, status: "conflict", errors: [issue("E_RECOVERY_MANIFEST_MISMATCH", null, "Distribution Manifest digest does not match the transaction")] }, transactionView(transaction));
  if (transaction.phase === "committed" && strategy === "rollback") return envelope("recover", distribution, paths.root, { ...base, status: "conflict", errors: [issue("E_RECOVERY_COMMITTED", null, "committed transactions only support resume")] }, transactionView(transaction));
  if (!apply) return envelope("recover", distribution, paths.root, base, transactionView(transaction));
  try {
    await withRepositoryMutation(paths.root, async (lockedPaths) => {
      await cleanupOrphans(lockedPaths, fault);
      const current = await readCanonicalMaintenance(lockedPaths);
      if (!current || current.transactionId !== transaction.transactionId) fail("E_MAINTENANCE_CONFLICT", "canonical transaction changed while waiting for the lock");
      if (strategy === "resume") await resumeTransaction(lockedPaths, current, null, fault);
      else await rollbackTransaction(lockedPaths, current, fault);
    });
  } catch (error) {
    const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
    const status = normalized.code === "E_MAINTENANCE_CONFLICT" ? "conflict" : "error";
    return envelope("recover", distribution, paths.root, { ...base, status, errors: [issue(normalized.code, null, normalized.message, normalized.facts, normalized.repair)], nextActions: [recoveryCommand(transaction, paths.root, strategy)] }, transactionView(transaction));
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
  if (transaction) errors.push(issue("E_MAINTENANCE_PENDING", null, "canonical maintenance transaction exists", transactionView(transaction), recoveryCommand(transaction, paths.root)));
  if (!ledger && errors.length === 0) {
    const traces = [];
    for (const entry of targets) if ((await fileFact(paths.root, entry.targetPath)).type !== "absent") traces.push(entry.targetPath);
    if (traces.length) errors.push(issue("E_UNTRACKED_INSTALL", null, "managed targets exist without an install ledger", { paths: traces }));
    else warnings.push(issue("W_NOT_INSTALLED", null, "AI Vibe Demo Kit is not installed", null, `npx --yes ${PACKAGE_NAME}@${distribution.value.package.version} init --target ${JSON.stringify(paths.root)} --json`));
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
    if (managedHealthy) {
      try {
        await loadHarnessManifest(paths.root);
        const workflow = JSON.parse(await readFile(join(paths.root, "workflows", "workflow-template.json"), "utf8"));
        const report = await validateWorkflow(workflow, { root: paths.root, workflowPath: "workflows/workflow-template.json" });
        if (!report.valid) errors.push(issue("E_RUNTIME_DAMAGED", "workflows/workflow-template.json", "default Workflow or Required Skill is invalid", report));
        else readiness.runtimeReady = true;
      } catch (error) {
        errors.push(issue(error.code ?? "E_RUNTIME_DAMAGED", null, error.message));
      }
    }
    const toolingPaths = ["bin/harness.mjs", "workflows/stage-result-template.json", "workflows/verification-report-template.json"];
    readiness.completionEvidenceToolingReady = (await Promise.all(toolingPaths.map((path) => fileFact(paths.root, path)))).every((fact) => fact.type === "file");
    if (readiness.completionEvidenceToolingReady) {
      try {
        const runtime = await readFile(join(paths.root, "bin", "harness.mjs"), "utf8");
        const stageTemplate = JSON.parse(await readFile(join(paths.root, "workflows", "stage-result-template.json"), "utf8"));
        const reportTemplate = JSON.parse(await readFile(join(paths.root, "workflows", "verification-report-template.json"), "utf8"));
        readiness.completionEvidenceToolingReady = runtime.includes('"check-result"')
          && Array.isArray(stageTemplate.conditions)
          && Array.isArray(stageTemplate.skills)
          && Array.isArray(stageTemplate.artifacts)
          && reportTemplate.schemaVersion === 1
          && Array.isArray(reportTemplate.conditions)
          && Array.isArray(reportTemplate.checks)
          && Array.isArray(reportTemplate.cleanup);
      } catch {
        readiness.completionEvidenceToolingReady = false;
      }
    }
    if (!readiness.completionEvidenceToolingReady) errors.push(issue("E_COMPLETION_TOOLING", null, "completion Evidence tooling is incomplete"));
    const agents = await fileFact(paths.root, "AGENTS.md");
    const environment = await fileFact(paths.root, "AI_ENVIRONMENT.md");
    if (agents.type === "file" && environment.type === "file") {
      const content = await readFile(join(paths.root, "AI_ENVIRONMENT.md"), "utf8");
      const report = validateEnvironmentManifest(content);
      const hasUnknown = /\|\s*`?unknown`?\s*\|/i.test(content);
      readiness.governanceReady = report.valid && !hasUnknown;
      if (!readiness.governanceReady) warnings.push(issue("W_GOVERNANCE_INCOMPLETE", "AI_ENVIRONMENT.md", "environment governance contains unknown or incomplete facts", { ...report, hasUnknown }));
    } else warnings.push(issue("W_GOVERNANCE_INCOMPLETE", null, "effective AGENTS.md and AI_ENVIRONMENT.md are required for Governance readiness"));
  }
  let status = "ok";
  if (errors.length) status = "conflict";
  else if (!ledger || warnings.length || !readiness.governanceReady) status = "manual-action-required";
  return envelope("doctor", distribution, paths.root, { status, installedVersion: ledger?.package?.version ?? null, applied: false, changes: [], readiness, warnings, errors, nextActions: transaction ? [recoveryCommand(transaction, paths.root)] : [] }, transactionView(transaction));
}

export async function runDistributionCommand({ sourceRoot, command, target = process.cwd(), apply = false, strategy = null, fault = async () => {} }) {
  const distribution = await loadDistributionManifest(sourceRoot);
  if (command === "version") return envelope(command, distribution, null, { status: "ok", installedVersion: null, applied: false, changes: [], warnings: [], errors: [] });
  try {
    if ((await lstat(resolve(target))).isSymbolicLink()) fail("E_PATH_SYMLINK", "lifecycle target must not be a symlink");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const paths = await repositoryPaths(target);
  if (command === "doctor") return doctor(paths.root, distribution);
  if (command === "recover") {
    if (!new Set(["resume", "rollback"]).has(strategy)) fail("E_USAGE", "recover requires --strategy resume or rollback");
    return recover(paths.root, distribution, strategy, apply, fault);
  }
  const transaction = await readCanonicalMaintenance(paths);
  if (transaction) return envelope(command, distribution, paths.root, { ...conflictPlan(null, [issue("E_MAINTENANCE_PENDING", null, "canonical maintenance transaction exists")]), nextActions: [recoveryCommand(transaction, paths.root)] }, transactionView(transaction));
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
      const status = new Set(["E_ACTIVE_WORK_ITEM", "E_MAINTENANCE_PENDING", "E_LEDGER_INVALID", "E_INSTALL_CONFLICT"]).has(normalized.code) ? "conflict" : "error";
      return envelope(command, distribution, paths.root, { status, installedVersion: installed?.package?.version ?? null, applied, changes: [], warnings: [], errors: [issue(normalized.code, null, normalized.message, normalized.facts, normalized.repair)], nextActions: current ? [recoveryCommand(current, paths.root)] : [] }, transactionView(current));
    }
  }
  const plan = await planOperation(command, paths.root, distribution);
  if (plan.status === "applied") plan.status = "planned";
  plan.applied = false;
  return envelope(command, distribution, paths.root, plan);
}
