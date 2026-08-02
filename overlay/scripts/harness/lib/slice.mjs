// slice.mjs — Slice 模型：六态正常路径 + invalidated、DAG/frontier、Write Scope、revision（PRD 9.1–9.3）。
// 纯数据驱动转移表（同 lifecycle.mjs 约定）；状态唯一真相在 stateRef 的
// work-items/<work-item-id>/slices/<slice-id>.json，单一事实源。
// Quick 证据门禁（FR-S02）在 lib/quick.mjs 并叠加于 ops 层；Human Review（FR-S03）与 done 的
// 集成语义（FR-S08）属后续 slice；本模块保证状态机、依赖与 scope 边界不可绕过。

import { E } from "./errors.mjs";
import { normalizeQuickPlan } from "./quick.mjs";

export const SLICE_VERSION = 2;

// 六态正常路径 + 异常态 invalidated（PRD 9.1）；相邻状态构成唯一合法前向转移。
export const SLICE_MAIN_PATH = ["ready", "implementing", "runnable", "human-reviewed", "verified", "done"];
export const SLICE_STATUSES = [...SLICE_MAIN_PATH, "invalidated"];

// live = 占用 Write Scope、参与冲突计算的 Slice；done/invalidated 释放 scope。
export const SLICE_INACTIVE_STATUSES = new Set(["done", "invalidated"]);

const SLICE_EDGES = (() => {
  const edges = new Set();
  for (let i = 0; i < SLICE_MAIN_PATH.length - 1; i += 1) {
    edges.add(`${SLICE_MAIN_PATH[i]}>${SLICE_MAIN_PATH[i + 1]}`);
  }
  // any downstream state → invalidated（PRD 9.1，含 done；reopen 级联驱动属 slice 06）。
  for (const from of SLICE_MAIN_PATH) edges.add(`${from}>invalidated`);
  return edges;
})();

export function isLegalSliceTransition(from, to) {
  return SLICE_EDGES.has(`${from}>${to}`);
}

export function nextSliceStates(from) {
  const result = [];
  for (const edge of SLICE_EDGES) {
    const [a, b] = edge.split(">");
    if (a === from) result.push(b);
  }
  return result;
}

// ---------------------------------------------------------------------------
// stateRef 路径（PRD 6.4 namespace）

export function slicesPrefix(workItemId) {
  return `work-items/${workItemId}/slices/`;
}

export function slicePath(workItemId, sliceId) {
  return `${slicesPrefix(workItemId)}${sliceId}.json`;
}

/** 从状态快照（Map<path, text>）收集一个 Work Item 的全部 Slice。 */
export function collectSlices(files, workItemId) {
  const slices = new Map();
  const prefix = slicesPrefix(workItemId);
  for (const [path, text] of files) {
    if (!path.startsWith(prefix) || !path.endsWith(".json")) continue;
    const slice = JSON.parse(text);
    slices.set(slice.sliceId, slice);
  }
  return slices;
}

// ---------------------------------------------------------------------------
// Write Scope 语法（PRD 9.3 / NFR-06 路径层）

const GLOB_CHARS = /[*?[\]{}]/;

/**
 * 规范化 scope 路径：拒绝 glob、绝对路径、反斜杠、空段与 . / .. 段。
 * 返回规范化的 repo 相对 POSIX 路径（无首尾多余斜杠）。
 */
export function normalizeScopePath(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw E.INVALID_WRITE_SCOPE("路径必须是非空字符串");
  }
  const value = raw.trim();
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    throw E.INVALID_WRITE_SCOPE(`不接受绝对路径：${raw}`);
  }
  if (value.includes("\\")) throw E.INVALID_WRITE_SCOPE(`不接受反斜杠分隔符：${raw}`);
  if (GLOB_CHARS.test(value)) throw E.INVALID_WRITE_SCOPE(`不支持 glob 语法：${raw}`);
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw E.INVALID_WRITE_SCOPE(`路径必须规范化（不含空段、.、..）：${raw}`);
  }
  return segments.join("/");
}

function lower(path) {
  return path.toLowerCase();
}

/** path 位于 dir subtree 内（含相等）；大小写不敏感比较（NFR-06 case 语义）。 */
export function underSubtree(path, subtree) {
  const p = lower(path);
  const d = lower(subtree);
  return p === d || p.startsWith(`${d}/`);
}

function requireStringArray(value, label) {
  if (!Array.isArray(value)) throw E.SLICE_INCOMPLETE([`${label} 必须是数组`]);
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") throw E.SLICE_INCOMPLETE([`${label} 条目必须是非空字符串`]);
  }
  return value;
}

/**
 * 校验并规范化 Write Scope：{ exact[], subtrees[], renames[{from,to}] }。
 * rename 必须同时拥有 source 与 destination；destination（新文件）只能落在 owned subtree。
 */
export function validateWriteScope(scope) {
  if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
    throw E.SLICE_INCOMPLETE(["writeScope 必须是对象"]);
  }
  for (const key of ["exact", "subtrees", "renames"]) {
    if (scope[key] !== undefined && !Array.isArray(scope[key])) {
      throw E.INVALID_WRITE_SCOPE(`writeScope.${key} 必须是数组`);
    }
  }
  const exact = (scope.exact ?? []).map((path) => normalizeScopePath(path));
  const subtrees = (scope.subtrees ?? []).map((path) => normalizeScopePath(path));
  const renames = [];
  for (const entry of scope.renames ?? []) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw E.INVALID_WRITE_SCOPE("rename 条目必须是 {from, to} 对象");
    }
    if (typeof entry.from !== "string" || entry.from.trim() === "") {
      throw E.INVALID_WRITE_SCOPE(`rename 缺 source（from）：${JSON.stringify(entry)}`);
    }
    if (typeof entry.to !== "string" || entry.to.trim() === "") {
      throw E.INVALID_WRITE_SCOPE(`rename 缺 destination（to）：${JSON.stringify(entry)}`);
    }
    const from = normalizeScopePath(entry.from);
    const to = normalizeScopePath(entry.to);
    if (!exact.some((file) => lower(file) === lower(from)) && !subtrees.some((subtree) => underSubtree(from, subtree))) {
      throw E.INVALID_WRITE_SCOPE(`rename source ${from} 不在声明的 exact/subtree 内（不能移动未拥有的文件）`);
    }
    if (!subtrees.some((subtree) => underSubtree(to, subtree))) {
      throw E.INVALID_WRITE_SCOPE(`rename destination ${to} 不在 owned subtree 内（新文件只能落在 owned subtree）`);
    }
    renames.push({ from, to });
  }
  return { exact, subtrees, renames };
}

/** Slice 实际占用的文件路径：exact + rename source（移出）+ rename destination（新文件）。 */
function occupiedFiles(scope) {
  return [...scope.exact, ...scope.renames.flatMap((rename) => [rename.from, rename.to])];
}

/** 两个已规范化 scope 是否重叠；返回 null 或人类可读原因。 */
export function scopesOverlap(a, b) {
  const filesA = occupiedFiles(a);
  const filesB = occupiedFiles(b);
  for (const fileA of filesA) {
    for (const fileB of filesB) {
      if (lower(fileA) === lower(fileB)) return `文件 ${fileA} 双方同时占用`;
    }
    for (const subtree of b.subtrees) {
      if (underSubtree(fileA, subtree)) return `文件 ${fileA} 落入对方 subtree ${subtree}/`;
    }
  }
  for (const fileB of filesB) {
    for (const subtree of a.subtrees) {
      if (underSubtree(fileB, subtree)) return `文件 ${fileB} 落入对方 subtree ${subtree}/`;
    }
  }
  for (const subtreeA of a.subtrees) {
    for (const subtreeB of b.subtrees) {
      if (underSubtree(subtreeA, subtreeB) || underSubtree(subtreeB, subtreeA)) {
        return `subtree ${subtreeA}/ 与 ${subtreeB}/ 相互包含`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// DAG 与 frontier（PRD 9.3 / FR-S07）

/** 未 done 的前驱列表；dependsOn 只在前驱 Slice 为 done 时满足。 */
export function depsPending(slice, slices) {
  return slice.dependsOn.filter((dep) => slices.get(dep)?.status !== "done");
}

/** frontier：live 且全部前驱 done 的 Slice id（排序，输出稳定）。 */
export function computeFrontier(slices) {
  const frontier = [];
  for (const [sliceId, slice] of slices) {
    if (SLICE_INACTIVE_STATUSES.has(slice.status)) continue;
    if (depsPending(slice, slices).length === 0) frontier.push(sliceId);
  }
  return frontier.sort();
}

/**
 * 新边 id→dependsOn 是否成环。既有图每次创建时已验无环，环必经过新 Slice：
 * 从 dependsOn 出发沿依赖边可达 id 即成环。返回环路径或 null。
 */
export function wouldCycle(slices, sliceId, dependsOn) {
  if (dependsOn.includes(sliceId)) return [sliceId, sliceId];
  const stack = dependsOn.map((dep) => [dep]);
  const seen = new Set();
  while (stack.length > 0) {
    const path = stack.pop();
    const current = path[path.length - 1];
    if (current === sliceId) return [sliceId, ...path];
    if (seen.has(current)) continue;
    seen.add(current);
    const slice = slices.get(current);
    if (!slice) continue; // 未知引用由 E_UNKNOWN_SLICE_REF 单独拒绝
    for (const dep of slice.dependsOn) stack.push([...path, dep]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Slice 记录与领域动作

const SLICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

function validatePinnedRefs(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw E.SLICE_INCOMPLETE([`${label} 必须是数组`]);
  return value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw E.UNPINNED_CONTRACT(String(entry));
    }
    const ref = typeof entry.ref === "string" ? entry.ref.trim() : "";
    const digest = typeof entry.digest === "string" ? entry.digest.trim() : "";
    if (ref === "" || digest === "") throw E.UNPINNED_CONTRACT(ref || JSON.stringify(entry));
    return { ref, digest };
  });
}

/**
 * 创建 Slice：校验最小字段（PRD 9.2）、dependsOn 引用与无环、
 * Write Scope 语法与冲突、共享契约固定（PRD 9.3）。
 */
export function createSlice({ workItemId, spec, slices, at, transactionId, sequence }) {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    throw E.SLICE_INCOMPLETE(["整个 spec"]);
  }
  const missing = [];
  if (typeof spec.sliceId !== "string" || spec.sliceId.trim() === "") missing.push("sliceId");
  if (typeof spec.primaryUncertainty !== "string" || spec.primaryUncertainty.trim() === "") {
    missing.push("primaryUncertainty");
  }
  if (!Array.isArray(spec.acceptanceCriteria) || spec.acceptanceCriteria.length === 0) {
    missing.push("acceptanceCriteria");
  }
  if (spec.writeScope === undefined) missing.push("writeScope");
  if (!Array.isArray(spec.verification?.quick) || spec.verification.quick.length === 0) {
    missing.push("verification.quick");
  }
  if (missing.length > 0) throw E.SLICE_INCOMPLETE(missing);
  normalizeQuickPlan(spec.verification.quick); // 非法条目（空命令/负 TTL）在创建时拒绝

  const sliceId = spec.sliceId.trim();
  if (!SLICE_ID_PATTERN.test(sliceId)) {
    throw E.USAGE(`sliceId ${spec.sliceId} 非法：必须是小写字母/数字/连字符 slug`, "例如 s1、ingest-api");
  }
  if (slices.has(sliceId)) throw E.SLICE_EXISTS(sliceId);

  const dependsOn = requireStringArray(spec.dependsOn ?? [], "dependsOn");
  for (const dep of dependsOn) {
    if (!slices.has(dep) && dep !== sliceId) throw E.UNKNOWN_SLICE_REF(dep);
  }
  const cycle = wouldCycle(slices, sliceId, dependsOn);
  if (cycle !== null) throw E.SLICE_CYCLE(cycle.join(" → "));

  const writeScope = validateWriteScope(spec.writeScope);
  const contractRefs = validatePinnedRefs(spec.contractRefs, "contractRefs");
  const dependencyDigests = validatePinnedRefs(spec.dependencyDigests, "dependencyDigests");
  const acceptanceCriteria = requireStringArray(spec.acceptanceCriteria, "acceptanceCriteria");
  const nonGoals = requireStringArray(spec.nonGoals ?? [], "nonGoals");
  if (spec.reviewPath !== undefined && spec.reviewPath !== null && typeof spec.reviewPath !== "string") {
    throw E.SLICE_INCOMPLETE(["reviewPath 必须是字符串"]);
  }

  for (const [otherId, other] of slices) {
    if (SLICE_INACTIVE_STATUSES.has(other.status)) continue;
    const detail = scopesOverlap(writeScope, other.writeScope);
    if (detail !== null) throw E.SCOPE_OVERLAP(sliceId, otherId, detail);
  }

  const slice = {
    version: SLICE_VERSION,
    workItemId,
    sliceId,
    revision: 1,
    status: "ready",
    primaryUncertainty: spec.primaryUncertainty,
    nonGoals,
    dependsOn,
    writeScope,
    contractRefs,
    dependencyDigests,
    acceptanceCriteria,
    reviewPath: spec.reviewPath ?? null,
    verificationPlan: { quick: [...spec.verification.quick] },
    quickReport: null,
    reviewAttempts: [],
    currentHumanReview: null,
    feedback: [],
    commit: null,
    integratedAt: null,
    rollback: null,
    history: [
      { action: "create", revision: 1, dependsOn, writeScope, contractRefs, at, transactionId, sequence },
    ],
    updatedAt: at,
  };
  return slice;
}

/**
 * 状态推进：仅校验转移表与依赖门禁（FR-S01/S07）；
 * Quick/Human Review/集成证据门禁由后续 slice 在进入 runnable/verified/done 前叠加。
 */
export function applySliceAdvance(slice, to, { slices, at, transactionId, sequence }) {
  const from = slice.status;
  if (!isLegalSliceTransition(from, to)) throw E.ILLEGAL_SLICE_TRANSITION(from, to);
  if (to === "implementing") {
    const pending = depsPending(slice, slices);
    if (pending.length > 0) throw E.SLICE_BLOCKED(slice.sliceId, pending);
  }
  slice.status = to;
  slice.history.push({ action: "advance", from, to, revision: slice.revision, at, transactionId, sequence });
  slice.updatedAt = at;
  return slice;
}

/**
 * Write Scope 修订（FR-S06 / PRD 9.3）：扩大或缩小 scope 必须创建新 revision、
 * 重算冲突，并使既有 Quick/Human Review 失效——Slice 回到 ready 重新走正常路径。
 * done Slice 的 scope 已冻结，不可修订。
 */
export function applyScopeRevision(slice, scopeInput, { slices, at, transactionId, sequence }) {
  if (slice.status === "done") throw E.ILLEGAL_SLICE_TRANSITION("done", "update-scope");
  const writeScope = validateWriteScope(scopeInput);
  for (const [otherId, other] of slices) {
    if (otherId === slice.sliceId || SLICE_INACTIVE_STATUSES.has(other.status)) continue;
    const detail = scopesOverlap(writeScope, other.writeScope);
    if (detail !== null) throw E.SCOPE_OVERLAP(slice.sliceId, otherId, detail);
  }

  const invalidatedEvidence = [];
  if (slice.quickReport !== null) {
    invalidatedEvidence.push("quick");
    slice.quickReport = null;
  }
  if (slice.currentHumanReview !== null) {
    invalidatedEvidence.push("humanReview");
    slice.currentHumanReview = null;
  }
  if (slice.reviewAttempts.length > 0) invalidatedEvidence.push("reviewAttempts");

  const fromRevision = slice.revision;
  const fromStatus = slice.status;
  slice.revision += 1;
  slice.status = "ready";
  slice.writeScope = writeScope;
  slice.history.push({
    action: "scope-revised",
    fromRevision,
    toRevision: slice.revision,
    fromStatus,
    writeScope,
    invalidatedEvidence,
    at,
    transactionId,
    sequence,
  });
  slice.updatedAt = at;
  return { fromRevision, toRevision: slice.revision, fromStatus, invalidatedEvidence };
}
