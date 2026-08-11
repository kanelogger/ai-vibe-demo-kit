import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fail } from "../shared/errors.mjs";
import { firstSymlinkInPath, resolveInside } from "../shared/path-safety.mjs";

export const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const modeString = (mode) => (mode & 0o777).toString(8).padStart(4, "0");

export function safeRelative(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.startsWith("/")
    && !path.split(/[\\/]/).includes("..")
    && !path.includes("\\");
}

export function factEqual(left, right) {
  if (!left || !right || left.type !== right.type) return false;
  if (left.type !== "file") return left.type === right.type;
  return left.sha256 === right.sha256 && left.mode === right.mode;
}

export function factView(value) {
  return { type: value.type, sha256: value.sha256 ?? null, mode: value.mode ?? null };
}

export function validateFact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !new Set(["file", "absent", "symlink", "other"]).has(value.type)) return false;
  return value.type !== "file" || (typeof value.sha256 === "string" && /^sha256:[a-f0-9]{64}$/.test(value.sha256) && /^0[0-7]{3}$/.test(value.mode));
}

export async function fileFact(root, path) {
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

export function relation(entry, actual) {
  if (actual.type === "absent") return "A";
  if (actual.type !== "file") return "U";
  const source = { type: "file", sha256: entry.source.sha256, mode: entry.source.mode };
  if (actual.sha256 === source.sha256 && actual.mode === source.mode) return "B";
  if (actual.sha256 === source.sha256) return "M";
  if (factEqual(actual, entry.observed)) return "O";
  return "T";
}

function targetDirectories(targetEntries) {
  const result = new Set();
  for (const entry of targetEntries) {
    let cursor = dirname(entry.targetPath);
    while (cursor !== "." && cursor !== "") {
      result.add(cursor);
      cursor = dirname(cursor);
    }
  }
  return result;
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

export async function planInitialDirectoryOwnership(root, targetEntries) {
  return missingCreatedDirectories(root, targetEntries);
}

export async function planUpgradeDirectoryOwnership(root, targetEntries, priorCreatedDirectories) {
  const desired = targetDirectories(targetEntries);
  const retained = priorCreatedDirectories.filter((path) => desired.has(path));
  const created = await missingCreatedDirectories(root, targetEntries);
  return {
    ledgerDirectories: [...new Set([...retained, ...created])]
      .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)),
    transactionCreatedDirectories: created.filter((path) => !priorCreatedDirectories.includes(path)),
    removeDirectories: priorCreatedDirectories.filter((path) => !desired.has(path)),
  };
}
