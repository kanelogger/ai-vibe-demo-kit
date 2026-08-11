import { lstat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function isInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function resolveInside(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "" || isAbsolute(relativePath)) return null;
  const target = resolve(root, relativePath);
  return isInside(root, target) ? target : null;
}

export async function firstSymlinkInPath(root, target) {
  if (!isInside(root, target)) throw new RangeError("target must stay inside root");
  const rel = relative(root, target);
  let cursor = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) return cursor;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  return null;
}
