import { readFile, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { HarnessError, fail } from "./errors.mjs";
import { firstSymlinkInPath, isInside, resolveInside } from "./path-safety.mjs";

export async function readRepoText(root, path, label) {
  if (typeof path !== "string" || path.trim() === "" || isAbsolute(path)) fail("E_PATH_OUTSIDE", `${label} path must be repository-relative`);
  const target = resolveInside(root, path);
  if (!target) fail("E_PATH_OUTSIDE", `${label} path leaves the repository`);
  try {
    if (await firstSymlinkInPath(root, target)) fail("E_PATH_SYMLINK", `${label} path must not use symlinks`);
    const actual = await realpath(target);
    if (!isInside(root, actual)) fail("E_PATH_OUTSIDE", `${label} resolves outside the repository`);
    return await readFile(target, "utf8");
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    if (error.code === "ENOENT") fail("E_REFERENCE_INVALID", `${label} file does not exist: ${path}`);
    fail("E_REFERENCE_INVALID", `${label} cannot be read: ${error.message}`);
  }
}

export async function readRepoJson(root, path, label) {
  const content = await readRepoText(root, path, label);
  try { return JSON.parse(content); }
  catch (error) { fail("E_REFERENCE_INVALID", `${label} is not valid JSON: ${error.message}`); }
}
