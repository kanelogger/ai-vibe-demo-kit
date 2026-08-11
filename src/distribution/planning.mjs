import { lstat, readFile } from "node:fs/promises";
import { HarnessError, fail } from "../shared/errors.mjs";
import { firstSymlinkInPath, resolveInside } from "../shared/path-safety.mjs";
import { factEqual, factView, fileFact, planInitialDirectoryOwnership, planUpgradeDirectoryOwnership, relation, safeRelative, validateFact } from "./ownership.mjs";

const PACKAGE_NAME = "ai-vibe-demo-kit";
const LEDGER_PATH = ".harness/install-lock.json";
const FILE_STATES = new Set(["installed", "preserved", "orphaned"]);
const issue = (code, path, message, facts = null, repair = null) => ({ code, path, message, facts, repair });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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

export async function readLedger(root, { strict = true } = {}) {
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

function ledgerEntry(entry, source, observed, state = "installed") {
  return {
    path: entry.targetPath,
    kind: entry.kind,
    state,
    source: { version: source.version, sha256: source.sha256, mode: source.mode },
    observed: factView(observed),
  };
}

export function publicChange(action, path, kind, before, after, reason = null) {
  return { action, path, kind, before: factView(before), after: factView(after), reason };
}

export function conflictPlan(installedVersion, errors) {
  return { status: "conflict", installedVersion, applied: false, changes: [], warnings: [], errors, nextLedger: undefined, fileActions: [] };
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
    const createdDirectories = await planInitialDirectoryOwnership(root, targets);
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
  const targetEntries = distribution.files.filter((entry) => entry.kind !== "package-only");
  const directoryPlan = await planUpgradeDirectoryOwnership(root, targetEntries, ledger.createdDirectories);
  const nextLedger = {
    ...ledger,
    installationState: "installed",
    package: { name: PACKAGE_NAME, version },
    createdDirectories: directoryPlan.ledgerDirectories,
    files: [...next.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
  const changedVersion = ledger.package.version !== version;
  return {
    status: warnings.length ? "manual-action-required" : changes.length || changedVersion ? "applied" : "idempotent",
    installedVersion: ledger.package.version,
    applied: changes.length > 0 || changedVersion,
    changes, warnings, errors: [], fileActions, nextLedger,
    transactionCreatedDirectories: directoryPlan.transactionCreatedDirectories,
    removeDirectories: directoryPlan.removeDirectories,
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

export async function planOperation(command, root, distribution) {
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

