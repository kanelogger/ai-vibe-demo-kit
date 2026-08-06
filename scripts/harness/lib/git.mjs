import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { E } from "./errors.mjs";

export function git(root, args, { input = null, buffer = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = execFile(
      "git",
      args,
      { cwd: root, encoding: buffer ? "buffer" : "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr ? String(stderr).trim() : error.message;
          rejectPromise(E.STATE(`git ${args.join(" ")} 失败：${detail}`));
          return;
        }
        resolvePromise(stdout);
      },
    );
    if (input === null) child.stdin.end();
    else {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

export async function repoRoot(cwd) {
  return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
}

export async function gitPrivatePath(root, path) {
  const raw = (await git(root, ["rev-parse", "--git-path", path])).trim();
  return isAbsolute(raw) ? raw : resolve(root, raw);
}

export async function worktreeStatus(root) {
  return git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
}

export async function assertClean(root) {
  if ((await worktreeStatus(root)) !== "") throw E.GIT_DIRTY();
}

export async function headIdentity(root) {
  let branch;
  try {
    branch = (await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  } catch {
    branch = null;
  }
  const commit = (await git(root, ["rev-parse", "HEAD^{commit}"])).trim();
  const tree = (await git(root, ["rev-parse", "HEAD^{tree}"])).trim();
  return { branch, commit, tree };
}

export async function headSnapshot(root) {
  const snapshot = await headIdentity(root);
  if (snapshot.branch === null) throw E.GIT_DRIFT("任务不支持 detached HEAD");
  return snapshot;
}

export async function isAncestor(root, ancestor, descendant) {
  try {
    await git(root, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

export async function changedFiles(root, base, candidate = "HEAD") {
  const output = await git(root, ["diff", "--name-only", "-z", "--diff-filter=ACDMRT", `${base}..${candidate}`], {
    buffer: true,
  });
  return output.toString("utf8").split("\0").filter(Boolean).sort();
}

export async function workspaceDigest(root) {
  const hash = createHash("sha256");
  hash.update(await git(root, ["rev-parse", "HEAD^{tree}"]));
  hash.update(await git(root, ["diff", "--binary", "HEAD"]));
  const raw = await git(root, ["ls-files", "--modified", "--deleted", "--others", "--exclude-standard", "-z"], {
    buffer: true,
  });
  const paths = raw.toString("utf8").split("\0").filter(Boolean).sort();
  for (const path of paths) {
    hash.update(path);
    try {
      const info = await lstat(resolve(root, path));
      if (info.isSymbolicLink()) hash.update(await readlink(resolve(root, path)));
      else if (info.isFile()) hash.update(await readFile(resolve(root, path)));
      else hash.update(String(info.mode));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      hash.update("<deleted>");
    }
  }
  return `sha256:${hash.digest("hex")}`;
}
