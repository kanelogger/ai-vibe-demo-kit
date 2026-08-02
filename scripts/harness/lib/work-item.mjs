// work-item.mjs — Work Item 状态外壳（PRD 7.1）与领域动作。
// envelope：status(active|suspended|closed) × outcome × result 与类型阶段分离；
// accepted 是关闭结果，不是阶段。

import { randomUUID } from "node:crypto";
import { E } from "./errors.mjs";
import { isLegalTransition, nextStages, stagesOf, WORK_ITEM_TYPES, OUTCOMES, RESULTS } from "./lifecycle.mjs";

export const STATE_VERSION = 2;

export function newWorkItemId(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `wi-${day}-${randomUUID().slice(0, 8)}`;
}

export function itemStatePath(workItemId) {
  return `work-items/${workItemId}/state.json`;
}

export function itemAuditPath(workItemId) {
  return `work-items/${workItemId}/audit.ndjson`;
}

export function createWorkItem({ id, type, quote, baseline, at, derivedFrom = null, supersedes = null, rollbackOf = [], contractRef = null }) {
  if (!WORK_ITEM_TYPES.includes(type)) throw E.INVALID_TYPE(type);
  if (typeof quote !== "string" || quote.trim() === "") {
    throw E.USAGE("start 必须携带 Developer 明确任务原话（--quote）", "harness start --type <type> --quote \"<任务原话>\"");
  }
  // 创建不变量（PRD 7.3）：Bugfix 恢复既有承诺，无承诺的新增期望不是 Bugfix。
  if (type === "bugfix" && (typeof contractRef !== "string" || contractRef.trim() === "")) {
    throw E.DEFECT_NO_CONTRACT();
  }
  return {
    version: STATE_VERSION,
    workItemId: id,
    type,
    typeProvisional: true,
    status: "active",
    stage: "initialized",
    outcome: null,
    result: null,
    risk: null,
    contractRef,
    baseAcceptance: baseline,
    integration: { branch: `harness/wi/${id}`, worktree: null },
    request: { quote, capturedAt: at, sessionRef: null },
    relations: {
      derivedFrom,
      supersedes,
      supersededBy: null,
      rollbackOf: [...rollbackOf],
      resumedFromBaseline: null,
    },
    suspension: null,
    humanStops: { budget: null, count: 0, events: [] },
    confirmations: [],
    history: [],
    createdAt: at,
    updatedAt: at,
    closedAt: null,
  };
}

export function validateWorkItem(item) {
  const problems = [];
  if (!item || typeof item !== "object") return ["state.json 不是对象"];
  if (item.version !== STATE_VERSION) problems.push(`version=${item.version}`);
  if (!WORK_ITEM_TYPES.includes(item.type)) problems.push(`type=${item.type}`);
  if (!["active", "suspended", "closed"].includes(item.status)) problems.push(`status=${item.status}`);
  if (WORK_ITEM_TYPES.includes(item.type) && !stagesOf(item.type).includes(item.stage)) {
    problems.push(`stage=${item.stage} 不属于 ${item.type}`);
  }
  if (item.outcome !== null && !OUTCOMES.includes(item.outcome)) problems.push(`outcome=${item.outcome}`);
  if (item.result !== null && !RESULTS.includes(item.result)) problems.push(`result=${item.result}`);
  if (item.status === "closed" && item.outcome === null) problems.push("closed 缺少 outcome");
  if (item.status !== "closed" && item.outcome !== null) problems.push("未关闭但已有 outcome");
  return problems;
}

function touch(item, at) {
  item.updatedAt = at;
}

function record(item, entry) {
  item.history.push(entry);
}

export const LOW_STOP_BUDGET = 3;

/**
 * 记录一次阻塞式人工停顿（FR-U05 / NFR-13）。
 * budget 只在 low 快路径设置；停顿计数与预算由 event log 计算验证，超预算事件
 * 标记 overBudget 供指标与 dogfood 分析（PRD 21.3），不阻断命令。
 */
export function recordHumanStop(item, { action, quote, at }) {
  item.humanStops ??= { budget: null, count: 0, events: [] };
  item.humanStops.count += 1;
  const overBudget = item.humanStops.budget !== null && item.humanStops.count > item.humanStops.budget;
  item.humanStops.events.push({ action, quote, at, overBudget });
}

/** 阶段推进：仅校验转移表与 active 状态；事实/证据门禁属于 Phase B/C。 */
export function applyAdvance(item, toStage, { at, transactionId, sequence, quote = null }) {
  if (item.status !== "active") throw E.ITEM_NOT_ACTIVE(item.workItemId, item.status);
  if (!isLegalTransition(item.type, item.stage, toStage)) {
    throw E.ILLEGAL_TRANSITION(item.type, item.stage, toStage);
  }
  const from = item.stage;
  item.stage = toStage;
  if (item.stage !== "initialized") item.typeProvisional = false;
  record(item, { sequence, transactionId, at, action: "advance", fromStage: from, toStage, actor: "developer", quote });
  touch(item, at);
  return { from, to: toStage };
}

export function applySuspend(item, reason, baseline, { at, transactionId, sequence }) {
  if (item.status !== "active") throw E.ITEM_NOT_ACTIVE(item.workItemId, item.status);
  item.status = "suspended";
  item.suspension = { reason, at, baseline };
  record(item, {
    sequence,
    transactionId,
    at,
    action: "suspend",
    fromStage: item.stage,
    toStage: item.stage,
    actor: "developer",
    quote: reason,
  });
  touch(item, at);
}

/**
 * 恢复：记录新的 Accepted Baseline 锚点。baseline 漂移时标注 baselineDrift；
 * 分支 rebase 与证据失效判断属于 Phase C。
 */
export function applyResume(item, currentBaseline, { at, transactionId, sequence }) {
  if (item.status !== "suspended") throw E.ITEM_NOT_SUSPENDED(item.workItemId, item.status);
  const suspendedBaseline = item.suspension?.baseline ?? item.baseAcceptance;
  const baselineDrift = suspendedBaseline?.commit !== currentBaseline?.commit;
  item.status = "active";
  item.relations.resumedFromBaseline = currentBaseline;
  record(item, {
    sequence,
    transactionId,
    at,
    action: "resume",
    fromStage: item.stage,
    toStage: item.stage,
    actor: "developer",
    quote: baselineDrift ? "baseline 已漂移；resume 后需按依赖重新判断证据有效性" : null,
  });
  item.suspension = null;
  touch(item, at);
  return { baselineDrift };
}

export function applyClose(item, { outcome, result = null, quote = null }, { at, transactionId, sequence }) {
  if (item.status === "closed") throw E.ITEM_NOT_ACTIVE(item.workItemId, "closed");
  if (!OUTCOMES.includes(outcome)) throw E.INVALID_OUTCOME(outcome);
  if (outcome === "accepted" && !RESULTS.includes(result)) {
    throw E.USAGE("accepted 关闭必须显式给出 --result changed|no-change", "harness close --outcome accepted --result <changed|no-change>");
  }
  item.status = "closed";
  item.outcome = outcome;
  item.result = result;
  item.closedAt = at;
  if (outcome === "accepted") recordHumanStop(item, { action: "final-acceptance", quote, at });
  record(item, {
    sequence,
    transactionId,
    at,
    action: "close",
    fromStage: item.stage,
    toStage: item.stage,
    actor: "developer",
    quote,
  });
  touch(item, at);
}

/** status 展示：当前允许的高层动作。 */
export function allowedActions(item) {
  if (!item) return ["start", "resume", "history", "status"];
  if (item.status === "suspended") return ["resume"];
  if (item.status === "closed") return [];
  return [
    ...nextStages(item.type, item.stage).map((stage) => `advance --to ${stage}`),
    "suspend",
    "close",
  ];
}
