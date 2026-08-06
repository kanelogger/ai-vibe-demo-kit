import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { E } from "./errors.mjs";
import { gitPrivatePath } from "./git.mjs";

const STATE_VERSION = 1;

function emptyState() {
  return { version: STATE_VERSION, revision: 0, active: null, last: null };
}

function validateState(value) {
  if (value?.version !== STATE_VERSION || !Number.isInteger(value.revision) || value.revision < 0) {
    throw E.STATE(".git/harness/control.json 格式损坏");
  }
  if (!(value.active === null || typeof value.active === "object")) throw E.STATE("control.active 必须是 object 或 null");
  if (!(value.last === null || typeof value.last === "object")) throw E.STATE("control.last 必须是 object 或 null");
  return value;
}

export async function controlPath(root) {
  return gitPrivatePath(root, "harness/control.json");
}

export async function loadState(root) {
  const path = await controlPath(root);
  try {
    return validateState(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState();
    if (error instanceof SyntaxError) throw E.STATE(".git/harness/control.json 不是合法 JSON");
    throw error;
  }
}

async function acquireLock(path) {
  const startedAt = Date.now();
  while (true) {
    try {
      return await open(path, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() - startedAt > 2000) throw E.STATE("本地控制状态正被另一个进程修改");
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
}

export async function mutateState(root, mutate) {
  const path = await controlPath(root);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  const lock = await acquireLock(lockPath);
  try {
    const state = await loadState(root);
    const result = await mutate(state);
    state.revision += 1;
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
    return result;
  } finally {
    await lock.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}
