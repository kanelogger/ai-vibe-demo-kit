import { link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fail } from "./errors.mjs";

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
const LOCK_REPAIR = (path) => `Inspect ${path}, verify its PID with "kill -0 <pid>", and remove the lock only when no live owner can be confirmed.`;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PACKAGE_NAME = "ai-vibe-demo-kit";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export function formatRecoveryCommand(transaction, root, strategy = "resume") {
  if (!SEMVER.test(transaction?.createdByPackageVersion ?? "") || !new Set(["resume", "rollback"]).has(strategy)) {
    fail("E_TRANSACTION_VERSION", "canonical maintenance journal cannot produce a safe recovery command");
  }
  return `npx --yes ${shellQuote(`${PACKAGE_NAME}@${transaction.createdByPackageVersion}`)} recover --target ${shellQuote(root)} --strategy ${strategy} --apply --json`;
}

export function formatInitCommand(packageVersion, root) {
  if (!SEMVER.test(packageVersion ?? "")) fail("E_DISTRIBUTION_MANIFEST", "Distribution version cannot produce a safe init command");
  return `npx --yes ${shellQuote(`${PACKAGE_NAME}@${packageVersion}`)} init --target ${shellQuote(root)} --json`;
}

export async function assertSafePrivatePath(path, { directory = false } = {}) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) fail("E_PATH_SYMLINK", `Git-private Harness path must not be a symlink: ${path}`);
    if (directory && !stat.isDirectory()) fail("E_STATE_PATH", `Git-private Harness path must be a directory: ${path}`);
    return stat;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function gitContext(start) {
  let root = resolve(start);
  while (true) {
    const marker = join(root, ".git");
    try {
      const stat = await lstat(marker);
      if (stat.isSymbolicLink()) fail("E_GIT_INVALID", ".git must not be a symlink");
      if (stat.isDirectory()) return { root, gitDir: marker };
      if (stat.isFile()) {
        const match = /^gitdir:\s*(.+)\s*$/m.exec(await readFile(marker, "utf8"));
        if (!match) fail("E_GIT_INVALID", ".git file does not contain a gitdir reference");
        return { root, gitDir: resolve(root, match[1]) };
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname(root);
    if (parent === root) fail("E_NOT_GIT", "target is not inside a Git repository");
    root = parent;
  }
}

export async function repositoryPaths(start) {
  const { root, gitDir } = await gitContext(start);
  const controlDir = join(gitDir, "harness");
  return {
    root,
    gitDir,
    controlDir,
    controlPath: join(controlDir, "control.json"),
    lockPath: join(controlDir, "control.lock"),
    historyDir: join(controlDir, "history"),
    maintenancePath: join(controlDir, "maintenance"),
  };
}

function parseLockPid(raw) {
  const value = raw.trim();
  if (!/^[1-9]\d*$/.test(value)) return null;
  const pid = Number(value);
  return Number.isSafeInteger(pid) ? pid : null;
}

export function probeLockOwner(pid, signal = process.kill) {
  try {
    signal(pid, 0);
    return "alive";
  } catch (error) {
    if (error.code === "ESRCH") return "dead";
    if (error.code === "EPERM") return "alive";
    throw error;
  }
}

async function inspectLock(path) {
  try {
    await assertSafePrivatePath(path);
    const handle = await open(path, "r");
    try {
      const identity = await handle.stat();
      const raw = await handle.readFile("utf8");
      const ownerPid = parseLockPid(raw);
      return {
        raw,
        ownerPid,
        ownerState: ownerPid === null ? "unknown" : probeLockOwner(ownerPid),
        identity: { dev: identity.dev, ino: identity.ino },
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function sameLock(left, right) {
  return left.raw === right.raw
    && left.identity.dev === right.identity.dev
    && left.identity.ino === right.identity.ino;
}

async function reclaimDeadLock(path, observed) {
  const claimPath = `${path}.reclaim-${observed.identity.dev}-${observed.identity.ino}`;
  try {
    await link(path, claimPath);
  } catch (error) {
    if (error.code === "ENOENT") return true;
    if (error.code === "EEXIST") return false;
    throw error;
  }
  try {
    const [claimed, current] = await Promise.all([inspectLock(claimPath), inspectLock(path)]);
    if (!claimed || !sameLock(observed, claimed) || claimed.ownerState !== "dead") return false;
    if (!current) return true;
    if (!sameLock(claimed, current)) return false;
    await unlink(path);
    return true;
  } finally {
    await unlink(claimPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function releaseLock(path, lock) {
  await lock.handle.close();
  const current = await inspectLock(path);
  if (!current || !sameLock(lock, current)) return;
  await unlink(path).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

async function acquireLock(paths) {
  await assertSafePrivatePath(paths.controlDir, { directory: true });
  await mkdir(paths.controlDir, { recursive: true });
  await assertSafePrivatePath(paths.lockPath);
  let conflicts = 0;
  let owner = { ownerPid: null, ownerState: "unknown" };
  while (conflicts < 100) {
    try {
      const handle = await open(paths.lockPath, "wx");
      const raw = `${process.pid}\n`;
      try {
        await handle.writeFile(raw);
        const identity = await handle.stat();
        return { handle, raw, identity: { dev: identity.dev, ino: identity.ino } };
      } catch (error) {
        await handle.close().catch(() => {});
        await unlink(paths.lockPath).catch(() => {});
        throw error;
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const observed = await inspectLock(paths.lockPath);
      if (!observed) continue;
      owner = { ownerPid: observed.ownerPid, ownerState: observed.ownerState };
      if (observed.ownerState === "dead" && await reclaimDeadLock(paths.lockPath, observed)) continue;
      conflicts += 1;
      await wait(10);
    }
  }
  fail("E_STATE_BUSY", "repository mutation is locked by another process", {
    facts: owner,
    repair: LOCK_REPAIR(paths.lockPath),
  });
}

export async function readCanonicalMaintenance(start) {
  const paths = typeof start === "object" && start.maintenancePath ? start : await repositoryPaths(start);
  const stat = await assertSafePrivatePath(paths.maintenancePath, { directory: true });
  if (!stat) return null;
  const journalPath = join(paths.maintenancePath, "transaction.json");
  await assertSafePrivatePath(journalPath);
  try {
    return JSON.parse(await readFile(journalPath, "utf8"));
  } catch (error) {
    fail("E_TRANSACTION_VERSION", `canonical maintenance journal cannot be read: ${error.message}`);
  }
}

export async function assertRuntimeMutationAllowed(paths) {
  const transaction = await readCanonicalMaintenance(paths);
  if (!transaction) return;
  fail("E_MAINTENANCE_PENDING", "repository lifecycle maintenance is pending", {
    facts: transaction,
    repair: "Run the exact recover command reported by ./harness status --json.",
  });
}

export async function withRepositoryMutation(start, callback) {
  const paths = await repositoryPaths(start);
  const lock = await acquireLock(paths);
  try {
    return await callback(paths);
  } finally {
    await releaseLock(paths.lockPath, lock);
  }
}
