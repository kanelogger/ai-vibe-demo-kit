// git.mjs — Git plumbing 薄封装：tree 读写、blob 写入、commit-tree 与 ref CAS。
// 只使用确定性 plumbing 命令；不触发 hooks，不联网（NFR-01/02）。

import { execFile } from "node:child_process";
import { E } from "./errors.mjs";

const ZERO_SHA = "0000000000000000000000000000000000000000";

export function git(root, args, { input = null, buffer = false, env = {} } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = execFile(
      "git",
      args,
      {
        cwd: root,
        encoding: buffer ? "buffer" : "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...env },
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr ? String(stderr).trim() : error.message;
          rejectPromise(E.GIT(`git ${args.join(" ")} 失败：${detail}`));
          return;
        }
        resolvePromise(stdout);
      },
    );
    // execFile 不支持 input 选项；手动供 stdin，防止 --stdin 类命令挂起。
    if (input === null) child.stdin.end();
    else {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

export async function repoRoot(cwd) {
  const out = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return out.trim();
}

/** ref 存在则返回 commit sha，否则返回 null。 */
export async function resolveRef(root, ref) {
  try {
    const out = await git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    const sha = out.trim();
    return sha === "" ? null : sha;
  } catch {
    return null;
  }
}

export async function commitTreeOid(root, commit) {
  const out = await git(root, ["rev-parse", `${commit}^{tree}`]);
  return out.trim();
}

/** 递归列出某个 commit 的全部文件：Map<path, oid>。 */
export async function readTreeFiles(root, commit) {
  const out = await git(root, ["ls-tree", "-r", "-z", commit], { buffer: true });
  const files = new Map();
  for (const entry of out.toString("utf8").split("\0")) {
    if (!entry) continue;
    const tab = entry.indexOf("\t");
    const meta = entry.slice(0, tab);
    const path = entry.slice(tab + 1);
    const oid = meta.split(" ")[2];
    files.set(path, oid);
  }
  return files;
}

export async function readBlob(root, oid) {
  return git(root, ["cat-file", "blob", oid]);
}

export async function writeBlob(root, content) {
  const out = await git(root, ["hash-object", "-w", "--stdin"], { input: content });
  return out.trim();
}

/**
 * 由完整文件映射（path → oid）构建嵌套 tree，返回根 tree oid。
 * files 必须包含该 tree 的全部文件（调用方负责从旧快照合并）。
 */
export async function writeTree(root, files) {
  // 构建目录 trie：dirs: Map<dirPath, { files: Map<name, oid>, subdirs: Set<name> }>
  const root_ = { files: new Map(), subdirs: new Map() };
  for (const [path, oid] of files) {
    const parts = path.split("/");
    let node = root_;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i];
      if (!node.subdirs.has(name)) node.subdirs.set(name, { files: new Map(), subdirs: new Map() });
      node = node.subdirs.get(name);
    }
    node.files.set(parts[parts.length - 1], oid);
  }
  async function flush(node) {
    const lines = [];
    for (const [name, oid] of [...node.files.entries()].sort()) {
      lines.push(`100644 blob ${oid}\t${name}`);
    }
    for (const [name, child] of [...node.subdirs.entries()].sort()) {
      lines.push(`040000 tree ${await flush(child)}\t${name}`);
    }
    const out = await git(root, ["mktree"], { input: `${lines.join("\n")}\n` });
    return out.trim();
  }
  return flush(root_);
}

export const HARNESS_IDENTITY = {
  GIT_AUTHOR_NAME: "harness",
  GIT_AUTHOR_EMAIL: "harness@harness.local",
  GIT_COMMITTER_NAME: "harness",
  GIT_COMMITTER_EMAIL: "harness@harness.local",
};

export async function commitState(root, { treeOid, parent, message, at }) {
  const out = await git(root, ["commit-tree", treeOid, ...(parent ? ["-p", parent] : []), "-m", message], {
    env: {
      ...HARNESS_IDENTITY,
      GIT_AUTHOR_DATE: at,
      GIT_COMMITTER_DATE: at,
    },
  });
  return out.trim();
}

/**
 * compare-and-swap 更新 ref。oldCommit 为 null 表示要求 ref 当前不存在。
 * 并发漂移时抛 E_REF_DRIFT，绝不半更新（NFR-02）。
 */
export async function casRef(root, ref, newCommit, oldCommit) {
  const expected = oldCommit ?? ZERO_SHA;
  try {
    await git(root, ["update-ref", ref, newCommit, expected]);
  } catch (error) {
    if (error.code === "E_GIT") throw E.REF_DRIFT(ref);
    throw error;
  }
}

/** CAS 删除 ref：仅当 ref 仍指向 expected 时删除（迁移失败补偿用）。 */
export async function deleteRefCas(root, ref, expected) {
  await git(root, ["update-ref", "-d", ref, expected]);
}
