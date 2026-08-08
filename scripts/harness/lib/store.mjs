import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { createIdleState } from "./kernel.mjs";
import { HarnessError, fail } from "./errors.mjs";
import { validateControlState } from "./validator.mjs";

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
const LOCK_REPAIR = (path) => `Inspect ${path}, verify its PID with "kill -0 <pid>", and remove the lock only when no live owner can be confirmed.`;

async function assertSafePrivatePath(path, { directory = false } = {}) {
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

export async function statePaths(start) {
  const { root, gitDir } = await gitContext(start);
  const controlDir = join(gitDir, "harness");
  return {
    root,
    gitDir,
    controlDir,
    controlPath: join(controlDir, "control.json"),
    lockPath: join(controlDir, "control.lock"),
    historyDir: join(controlDir, "history"),
  };
}

export async function loadState(start) {
  const paths = await statePaths(start);
  try {
    await assertSafePrivatePath(paths.controlDir, { directory: true });
    await assertSafePrivatePath(paths.controlPath);
    const parsed = JSON.parse(await readFile(paths.controlPath, "utf8"));
    const state = parsed?.schemaVersion === undefined && parsed?.version === 1 && parsed?.active === null
      ? {
          schemaVersion: 1,
          revision: parsed.revision,
          active: null,
          last: parsed.last ? { ...parsed.last, legacy: true, events: parsed.last.events ?? [] } : null,
        }
      : parsed;
    const report = validateControlState(state);
    if (!report.valid) fail("E_STATE_INVALID", "control state is invalid", { facts: report });
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return createIdleState();
    if (error instanceof HarnessError) throw error;
    fail("E_STATE_INVALID", `cannot read control state: ${error.message}`);
  }
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
  fail("E_STATE_BUSY", "control state is locked by another process", {
    facts: owner,
    repair: LOCK_REPAIR(paths.lockPath),
  });
}

async function atomicJson(path, value) {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temp, path);
}

async function archiveIfTerminal(paths, state) {
  const record = state.last;
  if (!record?.id || !record.outcome) return;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(record.id)) fail("E_STATE_INVALID", "work item id is not safe for archival");
  await assertSafePrivatePath(paths.historyDir, { directory: true });
  await mkdir(paths.historyDir, { recursive: true });
  const target = join(paths.historyDir, `${record.id}.json`);
  await assertSafePrivatePath(target);
  try {
    const existing = JSON.parse(await readFile(target, "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(record)) fail("E_ARCHIVE_CONFLICT", `history already contains different content for ${record.id}`);
  } catch (error) {
    if (error.code === "ENOENT") await atomicJson(target, record);
    else throw error;
  }
}

export async function mutateState(start, expectedRevision, mutate) {
  const paths = await statePaths(start);
  const lock = await acquireLock(paths);
  try {
    const current = await loadState(paths.root);
    if (current.revision !== expectedRevision) fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${current.revision}`, { facts: { expectedRevision, currentRevision: current.revision } });
    const result = await mutate(structuredClone(current));
    if (!result?.state || result.state.revision !== current.revision + 1) fail("E_STATE_INVALID", "mutation must increment revision exactly once");
    const report = validateControlState(result.state);
    if (!report.valid) fail("E_STATE_INVALID", "mutation produced invalid control state", { facts: report });
    await archiveIfTerminal(paths, result.state);
    await atomicJson(paths.controlPath, result.state);
    return result;
  } finally {
    await releaseLock(paths.lockPath, lock);
  }
}

function parseGitName(config) {
  let section = "";
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[([^\]]+)]$/.exec(line);
    if (header) {
      section = header[1].trim().toLowerCase();
      continue;
    }
    if (section === "user") {
      const entry = /^name\s*=\s*(.+)$/i.exec(line);
      if (entry?.[1].trim()) return entry[1].trim();
    }
  }
  return null;
}

export async function readGitActor(start) {
  const { gitDir } = await gitContext(start);
  const candidates = [join(gitDir, "config")];
  try {
    const commonRef = await readFile(join(gitDir, "commondir"), "utf8");
    candidates.push(join(resolve(gitDir, commonRef.trim()), "config"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const path of candidates) {
    try {
      const name = parseGitName(await readFile(path, "utf8"));
      if (name) return name;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const globalCandidates = [join(homedir(), ".gitconfig")];
  if (process.env.XDG_CONFIG_HOME) globalCandidates.unshift(join(process.env.XDG_CONFIG_HOME, "git", "config"));
  for (const path of globalCandidates) {
    try {
      const name = parseGitName(await readFile(path, "utf8"));
      if (name) return name;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return null;
}
