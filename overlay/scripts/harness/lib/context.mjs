// context.mjs — 项目上下文解析：root、配置、targetRef/stateRef。
// 配置候选：项目根 .harness/config.json（安装态），overlay/.harness/config.json（本开发仓）。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot, resolveRef, commitTreeOid } from "./git.mjs";
import { E } from "./errors.mjs";

const CONFIG_CANDIDATES = [".harness/config.json", "overlay/.harness/config.json"];

export const DEFAULT_TARGET_REF = "refs/heads/main";
export const DEFAULT_STATE_REF = "refs/heads/harness/state";

export async function resolveContext({ root = null } = {}) {
  const resolvedRoot = root ?? (await repoRoot(process.cwd()));
  let config = {};
  for (const candidate of CONFIG_CANDIDATES) {
    try {
      config = JSON.parse(await readFile(join(resolvedRoot, candidate), "utf8"));
      break;
    } catch {
      // 尝试下一个候选
    }
  }
  const git = config.git ?? {};
  return {
    root: resolvedRoot,
    config,
    targetRef: typeof git.targetRef === "string" && git.targetRef ? git.targetRef : DEFAULT_TARGET_REF,
    stateRef: typeof git.stateRef === "string" && git.stateRef ? git.stateRef : DEFAULT_STATE_REF,
  };
}

/** 当前 Accepted Baseline：targetRef tip 的 commit 与 tree。 */
export async function currentBaseline(root, targetRef) {
  const commit = await resolveRef(root, targetRef);
  if (commit === null) throw E.NO_TARGET_REF(targetRef);
  return { commit, tree: await commitTreeOid(root, commit) };
}
