// ops.mjs — 领域动作：start / advance / suspend / resume / close 及原子组合。
// 每个动作恰好一个状态事务；registry 与 Work Item 在同一 commit 中更新（FR-G02）。

import { E } from "./errors.mjs";
import { transact } from "./state-store.mjs";
import {
  markActive,
  markSuspended,
  markResumed,
  markClosed,
} from "./registry.mjs";
import {
  createWorkItem,
  validateWorkItem,
  applyAdvance,
  applySuspend,
  applyResume,
  applyClose,
  newWorkItemId,
  itemStatePath,
} from "./work-item.mjs";

function writeItem(tx, item) {
  const problems = validateWorkItem(item);
  if (problems.length > 0) throw E.STATE_INCONSISTENT(`Work Item ${item.workItemId} 非法：${problems.join("；")}`);
  tx.writeJson(itemStatePath(item.workItemId), item);
}

function readItem(tx, workItemId) {
  const item = tx.readJson(itemStatePath(workItemId));
  if (item === undefined) throw E.ITEM_NOT_FOUND(workItemId);
  return item;
}

/** start：从当前 Accepted Baseline 创建唯一 active Work Item。 */
export async function opStart(root, ctx, { type, quote, now = () => new Date(), derivedFrom = null, supersedes = null, rollbackOf = [] }) {
  return transact(root, ctx.stateRef, {
    message: `harness: start ${type}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      const id = newWorkItemId(now());
      const item = createWorkItem({
        id,
        type,
        quote,
        baseline: registry.lastAcceptedBaseline,
        at: tx.at,
        derivedFrom,
        supersedes,
        rollbackOf,
      });
      markActive(registry, id);
      writeItem(tx, item);
      tx.emit({ action: "start", workItemId: id, detail: { type, baseCommit: registry.lastAcceptedBaseline?.commit ?? null } });
      tx.result = { workItemId: id, type, stage: item.stage };
    },
  });
}

/** advance：按类型转移表推进 active 项。 */
export async function opAdvance(root, ctx, { to, quote = null, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: `harness: advance → ${to}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const item = readItem(tx, registry.activeWorkItemId);
      const { from } = applyAdvance(item, to, {
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
        quote,
      });
      writeItem(tx, item);
      tx.emit({ action: "advance", workItemId: item.workItemId, detail: { from, to } });
      tx.result = { workItemId: item.workItemId, from, to };
    },
  });
}

/** suspend：冻结 active 项（branch/state 冻结由 Phase C 集成）。 */
export async function opSuspend(root, ctx, { reason, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: "harness: suspend",
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const item = readItem(tx, registry.activeWorkItemId);
      applySuspend(item, reason, registry.lastAcceptedBaseline, {
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
      });
      markSuspended(registry, item.workItemId);
      writeItem(tx, item);
      tx.emit({ action: "suspend", workItemId: item.workItemId, detail: { reason } });
      tx.result = { workItemId: item.workItemId, status: "suspended" };
    },
  });
}

/** resume：恢复 suspended 项；要求当前无 active 项。 */
export async function opResume(root, ctx, { workItemId, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: `harness: resume ${workItemId}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      const item = readItem(tx, workItemId);
      const { baselineDrift } = applyResume(item, registry.lastAcceptedBaseline, {
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
      });
      markResumed(registry, workItemId);
      writeItem(tx, item);
      tx.emit({ action: "resume", workItemId, detail: { baselineDrift } });
      tx.result = { workItemId, status: "active", baselineDrift };
    },
  });
}

/** close：以 accepted|abandoned|superseded 关闭；accepted 必须显式 result。 */
export async function opClose(root, ctx, { outcome, result = null, quote = null, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: `harness: close ${outcome}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const item = readItem(tx, registry.activeWorkItemId);
      applyClose(item, { outcome, result, quote }, {
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
      });
      markClosed(registry, item.workItemId);
      writeItem(tx, item);
      tx.emit({ action: "close", workItemId: item.workItemId, detail: { outcome, result } });
      tx.result = { workItemId: item.workItemId, status: "closed", outcome, result };
    },
  });
}

/** suspend-and-start：原子冻结当前项并创建紧急 successor（PRD 7.2）。 */
export async function opSuspendAndStart(root, ctx, { type, quote, reason, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: `harness: suspend-and-start ${type}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const suspended = readItem(tx, registry.activeWorkItemId);
      applySuspend(suspended, reason, registry.lastAcceptedBaseline, {
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
      });
      markSuspended(registry, suspended.workItemId);
      writeItem(tx, suspended);
      tx.emit({ action: "suspend", workItemId: suspended.workItemId, detail: { reason, atomic: "suspend-and-start" } });

      const id = newWorkItemId(now());
      const item = createWorkItem({
        id,
        type,
        quote,
        baseline: registry.lastAcceptedBaseline,
        at: tx.at,
        derivedFrom: suspended.workItemId,
      });
      markActive(registry, id);
      writeItem(tx, item);
      tx.emit({ action: "start", workItemId: id, detail: { type, derivedFrom: suspended.workItemId } });
      tx.result = { suspendedWorkItemId: suspended.workItemId, workItemId: id, type };
    },
  });
}

/** close-and-start：原子关闭当前项并创建 successor（PRD 7.1/7.3 重分类）。 */
export async function opCloseAndStart(root, ctx, { outcome, result = null, type, quote, reason = null, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: `harness: close-and-start ${outcome} → ${type}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const closed = readItem(tx, registry.activeWorkItemId);
      applyClose(closed, { outcome, result, quote: reason }, {
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
      });
      markClosed(registry, closed.workItemId);
      writeItem(tx, closed);
      tx.emit({ action: "close", workItemId: closed.workItemId, detail: { outcome, result, atomic: "close-and-start" } });

      const id = newWorkItemId(now());
      const item = createWorkItem({
        id,
        type,
        quote,
        baseline: registry.lastAcceptedBaseline,
        at: tx.at,
        derivedFrom: closed.workItemId,
        supersedes: outcome === "superseded" ? closed.workItemId : null,
      });
      if (outcome === "superseded") closed.relations.supersededBy = id;
      writeItem(tx, closed);
      markActive(registry, id);
      writeItem(tx, item);
      tx.emit({ action: "start", workItemId: id, detail: { type, derivedFrom: closed.workItemId } });
      tx.result = { closedWorkItemId: closed.workItemId, outcome, workItemId: id, type };
    },
  });
}
