import { spawn } from "node:child_process";
import { HarnessError, fail } from "../shared/errors.mjs";
import { formatInitCommand, formatUpgradeCommand } from "../shared/repository-guard.mjs";
import { readLedger } from "./planning.mjs";

const PACKAGE_NAME = "ai-vibe-demo-kit";
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const STATUS_EXIT = new Map([
  ["ok", 0], ["planned", 0], ["applied", 0], ["idempotent", 0],
  ["manual-action-required", 1], ["conflict", 2], ["error", 2],
]);

function parseSemver(value) {
  const match = SEMVER.exec(value ?? "");
  if (!match) fail("E_REGISTRY_RESPONSE", "npm latest did not resolve to a valid SemVer");
  const prerelease = match[4] === undefined ? null : match[4].split(".");
  if (prerelease?.some((entry) => /^\d+$/.test(entry) && entry.length > 1 && entry.startsWith("0"))) {
    fail("E_REGISTRY_RESPONSE", "npm latest did not resolve to a valid SemVer");
  }
  return {
    value,
    core: match.slice(1, 4).map(BigInt),
    prerelease,
  };
}

export function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  if (a.prerelease === null || b.prerelease === null) return a.prerelease === b.prerelease ? 0 : a.prerelease === null ? 1 : -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const x = a.prerelease[index];
    const y = b.prerelease[index];
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1;
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function runProcess(command, args, { timeout = null, forwardSignals = false } = {}) {
  return new Promise((resolve, reject) => {
    const grouped = forwardSignals || timeout !== null;
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: grouped });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const forwarded = [];
    const forward = (signal) => {
      forwarded.push(signal);
      try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") reject(error); }
    };
    const handlers = new Map(["SIGINT", "SIGTERM"].map((signal) => [signal, () => forward(signal)]));
    if (forwardSignals) for (const [signal, handler] of handlers) process.on(signal, handler);
    let forceTimer = null;
    const terminateGroup = (signal) => {
      try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") reject(error); }
    };
    const timer = timeout === null ? null : setTimeout(() => {
      timedOut = true;
      terminateGroup("SIGTERM");
      forceTimer = setTimeout(() => terminateGroup("SIGKILL"), 1_000);
    }, timeout);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      if (forwardSignals) for (const [name, handler] of handlers) process.off(name, handler);
      resolve({ code, signal, stdout, stderr, timedOut, forwarded });
    });
  });
}

function parseWholeJson(stdout, code, message) {
  try {
    const value = JSON.parse(stdout.trim());
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    fail(code, message);
  }
}

export function createNpmSyncAdapter() {
  return {
    async resolveLatestVersion() {
      let result;
      try { result = await runProcess("npm", ["view", `${PACKAGE_NAME}@latest`, "version", "--json"], { timeout: 30_000 }); }
      catch (error) {
        if (error.code === "ENOENT") fail("E_NPM_UNAVAILABLE", "npm executable is unavailable");
        throw error;
      }
      if (result.timedOut) fail("E_REGISTRY_TIMEOUT", "npm latest query exceeded 30 seconds");
      if (result.code !== 0) fail("E_REGISTRY_QUERY", "npm latest query failed", { facts: { exitCode: result.code } });
      let value;
      try { value = JSON.parse(result.stdout.trim()); } catch { fail("E_REGISTRY_RESPONSE", "npm latest response is not valid JSON"); }
      if (typeof value !== "string") fail("E_REGISTRY_RESPONSE", "npm latest response must contain one version string");
      parseSemver(value);
      return value;
    },
    async runPinnedUpgrade({ version, gitRoot, apply }) {
      const args = ["--yes", `${PACKAGE_NAME}@${version}`, "upgrade", "--target", gitRoot];
      if (apply) args.push("--apply");
      args.push("--json");
      let result;
      try { result = await runProcess("npx", args, { forwardSignals: true }); }
      catch (error) {
        if (error.code === "ENOENT") fail("E_NPM_UNAVAILABLE", "npx executable is unavailable");
        throw error;
      }
      if (result.forwarded.length) fail("E_DELEGATE_INTERRUPTED", "delegated upgrade was interrupted", { facts: { signal: result.forwarded[0] } });
      return { exitCode: result.code, payload: parseWholeJson(result.stdout, "E_DELEGATE_PROTOCOL", "delegated upgrade stdout is not one JSON object") };
    },
  };
}

const issue = (code, message, facts = null, repair = null) => ({ code, path: null, message, facts, repair });

export async function runSync({ distribution, gitRoot, apply, adapter }) {
  const resolvedVersion = await adapter.resolveLatestVersion();
  parseSemver(resolvedVersion);
  const ledger = await readLedger(gitRoot, { strict: false });
  if (ledger?.invalid) return {
    status: "conflict", installedVersion: null, applied: false, changes: [], warnings: [],
    errors: [issue("E_LEDGER_INVALID", "install ledger is invalid")], nextActions: [],
    update: { tag: "latest", resolvedVersion, relation: "invalid-ledger" },
  };
  if (!ledger) return {
    status: "manual-action-required", installedVersion: null, applied: false, changes: [],
    warnings: [issue("W_NOT_INSTALLED", "AI Vibe Demo Kit is not installed", null, formatInitCommand(resolvedVersion, gitRoot))], errors: [],
    nextActions: [formatInitCommand(resolvedVersion, gitRoot)], update: { tag: "latest", resolvedVersion, relation: "not-installed" },
  };
  let comparison;
  try { comparison = compareSemver(ledger.package.version, resolvedVersion); }
  catch (error) {
    if (error instanceof HarnessError) return {
      status: "conflict", installedVersion: ledger.package.version, applied: false, changes: [], warnings: [],
      errors: [issue("E_LEDGER_INVALID", "installed package version is not valid SemVer")], nextActions: [],
      update: { tag: "latest", resolvedVersion, relation: "invalid-ledger" },
    };
    throw error;
  }
  const relation = comparison < 0 ? "older" : comparison > 0 ? "newer" : "equal";
  const update = { tag: "latest", resolvedVersion, relation };
  if (comparison > 0) return {
    status: "manual-action-required", installedVersion: ledger.package.version, applied: false, changes: [],
    warnings: [issue("W_INSTALLED_VERSION_AHEAD", "installed version is newer than npm latest; automatic downgrade is refused")], errors: [], nextActions: [], update,
  };
  const delegated = await adapter.runPinnedUpgrade({ version: resolvedVersion, gitRoot, apply });
  const payload = delegated.payload;
  if (payload.schemaVersion !== 1 || payload.command !== "upgrade" || payload.target !== gitRoot
      || payload.package?.name !== PACKAGE_NAME || payload.package?.version !== resolvedVersion
      || STATUS_EXIT.get(payload.status) !== delegated.exitCode || typeof payload.applied !== "boolean"
      || !Array.isArray(payload.changes) || !Array.isArray(payload.warnings)
      || !Array.isArray(payload.errors) || !Array.isArray(payload.nextActions)) {
    fail("E_DELEGATE_PROTOCOL", "delegated upgrade Envelope does not match the pinned request");
  }
  const canApply = !apply && (payload.status === "planned" || payload.status === "manual-action-required" && payload.changes?.length > 0);
  return {
    ...payload,
    command: "sync",
    package: { name: PACKAGE_NAME, version: distribution.value.package.version, installedVersion: ledger.package.version },
    nextActions: canApply ? [formatUpgradeCommand(resolvedVersion, gitRoot)] : payload.nextActions ?? [],
    update,
  };
}
