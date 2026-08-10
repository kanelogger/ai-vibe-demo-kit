import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createIdleState } from "./kernel.mjs";
import { HarnessError, fail } from "./errors.mjs";
import {
  assertRuntimeMutationAllowed,
  assertSafePrivatePath,
  probeLockOwner,
  repositoryPaths,
  withRepositoryMutation,
} from "./repository-guard.mjs";
import { validateControlState } from "./validator.mjs";

export { probeLockOwner };
export const statePaths = repositoryPaths;

export async function loadState(start) {
  const paths = await repositoryPaths(start);
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
  return withRepositoryMutation(start, async (paths) => {
    await assertRuntimeMutationAllowed(paths);
    const current = await loadState(paths.root);
    if (current.revision !== expectedRevision) fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${current.revision}`, { facts: { expectedRevision, currentRevision: current.revision } });
    const result = await mutate(structuredClone(current));
    if (!result?.state || result.state.revision !== current.revision + 1) fail("E_STATE_INVALID", "mutation must increment revision exactly once");
    const report = validateControlState(result.state);
    if (!report.valid) fail("E_STATE_INVALID", "mutation produced invalid control state", { facts: report });
    await archiveIfTerminal(paths, result.state);
    await atomicJson(paths.controlPath, result.state);
    return result;
  });
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
  const { gitDir } = await repositoryPaths(start);
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
