// registry.mjs — Project Workflow Registry（PRD 6.3 / ADR-0011）。
// 根 registry 只保存 active/suspended/Accepted Baseline/序列，不复制类型阶段。

import { E } from "./errors.mjs";

export const REGISTRY_VERSION = 2;
export const REGISTRY_PATH = "registry.json";
export const ROOT_AUDIT_PATH = "audit.ndjson";

export function createRegistry({ targetRef, stateRef, baseline, migration = null }) {
  return {
    version: REGISTRY_VERSION,
    targetRef,
    stateRef,
    activeWorkItemId: null,
    suspendedWorkItemIds: [],
    lastAcceptedBaseline: baseline,
    sequence: 0,
    lastTransactionId: null,
    migration,
  };
}

export function validateRegistry(registry) {
  const problems = [];
  if (!registry || typeof registry !== "object") return ["registry.json 不是对象"];
  if (registry.version !== REGISTRY_VERSION) problems.push(`version=${registry.version}`);
  if (typeof registry.targetRef !== "string" || registry.targetRef === "") problems.push("targetRef 缺失");
  if (typeof registry.stateRef !== "string" || registry.stateRef === "") problems.push("stateRef 缺失");
  if (!(registry.activeWorkItemId === null || typeof registry.activeWorkItemId === "string")) {
    problems.push("activeWorkItemId 非法");
  }
  if (!Array.isArray(registry.suspendedWorkItemIds)) problems.push("suspendedWorkItemIds 非数组");
  if (registry.activeWorkItemId && registry.suspendedWorkItemIds?.includes(registry.activeWorkItemId)) {
    problems.push("active 项同时出现在 suspended 列表");
  }
  if (!Number.isInteger(registry.sequence) || registry.sequence < 0) problems.push("sequence 非法");
  return problems;
}

export function assertCanStart(registry) {
  if (registry.activeWorkItemId !== null) throw E.ACTIVE_EXISTS(registry.activeWorkItemId);
}

export function markActive(registry, workItemId) {
  assertCanStart(registry);
  registry.activeWorkItemId = workItemId;
}

export function markSuspended(registry, workItemId) {
  if (registry.activeWorkItemId !== workItemId) throw E.NO_ACTIVE();
  registry.activeWorkItemId = null;
  if (!registry.suspendedWorkItemIds.includes(workItemId)) registry.suspendedWorkItemIds.push(workItemId);
}

export function markResumed(registry, workItemId) {
  if (registry.activeWorkItemId !== null) throw E.ACTIVE_EXISTS(registry.activeWorkItemId);
  if (!registry.suspendedWorkItemIds.includes(workItemId)) throw E.ITEM_NOT_SUSPENDED(workItemId, "not-suspended");
  registry.suspendedWorkItemIds = registry.suspendedWorkItemIds.filter((id) => id !== workItemId);
  registry.activeWorkItemId = workItemId;
}

export function markClosed(registry, workItemId) {
  if (registry.activeWorkItemId === workItemId) registry.activeWorkItemId = null;
  registry.suspendedWorkItemIds = registry.suspendedWorkItemIds.filter((id) => id !== workItemId);
}

const ITEM_STATE_PATTERN = /^work-items\/[^/]+\/state\.json$/;

/**
 * accepted lineage：从冻结的 Work Item namespace 派生（FR-B02 / NFR-05）。
 * 唯一真相是各关闭项自身的 outcome 与 close 事件序列；registry 不复制第二份。
 * files: Map<path, string>（状态快照）。按 close 事件的 transaction sequence 排序。
 */
export function deriveAcceptedLineage(files) {
  const accepted = [];
  for (const [path, text] of files) {
    if (!ITEM_STATE_PATTERN.test(path)) continue;
    const item = JSON.parse(text);
    if (item.outcome !== "accepted") continue;
    const closeEvent = (item.history ?? []).find((entry) => entry.action === "close");
    accepted.push({ workItemId: item.workItemId, result: item.result, sequence: closeEvent?.sequence ?? 0 });
  }
  return accepted.sort((a, b) => a.sequence - b.sequence);
}
