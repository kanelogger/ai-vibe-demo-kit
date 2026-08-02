// ops.mjs — 领域动作：start / advance / suspend / resume / close、原子组合与 Slice 动作。
// 每个动作恰好一个状态事务；registry 与 Work Item/Slice 在同一 commit 中更新（FR-G02）。

import { E } from "./errors.mjs";
import { transact } from "./state-store.mjs";
import { classifyRisk } from "./risk.mjs";
import { validateBrief, BRIEF_SPEC } from "./brief.mjs";
import { factPath, makeFactRevision } from "./facts.mjs";
import { MAIN_PATH } from "./lifecycle.mjs";
import {
  markActive,
  markSuspended,
  markResumed,
  markClosed,
  deriveAcceptedLineage,
} from "./registry.mjs";
import {
  collectSlices,
  computeFrontier,
  createSlice,
  applySliceAdvance,
  applyScopeRevision,
  slicePath,
} from "./slice.mjs";
import {
  createWorkItem,
  validateWorkItem,
  applyAdvance,
  applySuspend,
  applyResume,
  applyClose,
  newWorkItemId,
  itemStatePath,
  recordHumanStop,
  LOW_STOP_BUDGET,
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

/** start：从当前 Accepted Baseline 创建唯一 active Work Item；可携带显式风险事实。 */
export async function opStart(root, ctx, { type, quote, now = () => new Date(), derivedFrom = null, supersedes = null, rollbackOf = [], risk: riskInput = null, contractRef = null }) {
  const risk = riskInput === null ? null : classifyRisk(riskInput);
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
        contractRef,
      });
      if (risk !== null) item.risk = { ...risk, classifiedAt: tx.at };
      markActive(registry, id);
      writeItem(tx, item);
      tx.emit({ action: "start", workItemId: id, detail: { type, baseCommit: registry.lastAcceptedBaseline?.commit ?? null, riskLevel: risk?.level ?? null } });
      tx.result = { workItemId: id, type, stage: item.stage, risk: item.risk };
    },
  });
}

/**
 * confirm --brief：低风险快路径的批量确认（PRD 11.2 / FR-U04）。
 * 一次 Human Confirmation 在同一事务内：冻结全部前置事实 revision、
 * 按序走完类型生命周期的前置阶段（不是跳过状态）、进入 implementation-ready。
 */
export async function opConfirmBrief(root, ctx, { brief, quote, sessionRef = null, now = () => new Date() }) {
  if (typeof quote !== "string" || quote.trim() === "") {
    throw E.USAGE("confirm 必须携带 Developer 确认原话（--quote）", "harness confirm --brief '<json>' --quote \"<确认原话>\"");
  }
  let parsed;
  try {
    parsed = JSON.parse(brief);
  } catch {
    throw E.USAGE("--brief 不是合法 JSON", "harness confirm --brief '<json>' --quote \"<确认原话>\"");
  }
  return transact(root, ctx.stateRef, {
    message: "harness: confirm brief",
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const item = readItem(tx, registry.activeWorkItemId);
      if (!BRIEF_SPEC[item.type]) throw E.BRIEF_NOT_ALLOWED(item.type, "该类型不支持 Brief 快路径");
      const spec = BRIEF_SPEC[item.type];
      const kinds = [...spec.facts, "brief"];
      for (const kind of kinds) {
        if (tx.has(factPath(item.workItemId, kind, 1))) throw E.FACT_FROZEN(kind);
      }
      if (item.stage !== "initialized") {
        throw E.BRIEF_NOT_ALLOWED(item.type, `当前阶段 ${item.stage} 已过前置事实决策点`);
      }
      const level = item.risk?.level ?? null;
      if (level !== "low") throw E.RISK_TOO_HIGH_FOR_BRIEF(level ?? "未分类");
      validateBrief(item.type, parsed, item);

      const confirmation = { quote, at: tx.at, sessionRef };
      const facts = {};
      for (const kind of spec.facts) {
        const revision = makeFactRevision({ kind, revision: 1, body: parsed[kind], at: tx.at, confirmation });
        tx.writeJson(factPath(item.workItemId, kind, 1), revision);
        facts[kind] = { revision: 1, digest: revision.digest };
      }
      const briefRevision = makeFactRevision({ kind: "brief", revision: 1, body: parsed, at: tx.at, confirmation });
      tx.writeJson(factPath(item.workItemId, "brief", 1), briefRevision);
      facts.brief = { revision: 1, digest: briefRevision.digest };

      const walk = MAIN_PATH[item.type].slice(1, MAIN_PATH[item.type].indexOf("implementation-ready") + 1);
      for (const toStage of walk) {
        applyAdvance(item, toStage, { at: tx.at, transactionId: tx.transactionId, sequence: registry.sequence + 1 });
      }

      item.humanStops.budget ??= LOW_STOP_BUDGET;
      recordHumanStop(item, { action: "confirm-brief", quote, at: tx.at });
      item.confirmations ??= [];
      item.confirmations.push({ quote, at: tx.at, sessionRef, binds: facts });
      writeItem(tx, item);
      tx.emit({
        action: "confirm-brief",
        workItemId: item.workItemId,
        detail: { type: item.type, facts, stage: item.stage, humanStops: item.humanStops.count },
      });
      tx.result = { workItemId: item.workItemId, stage: item.stage, facts, humanStops: item.humanStops };
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
export async function opSuspendAndStart(root, ctx, { type, quote, reason, now = () => new Date(), contractRef = null }) {
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
        contractRef,
      });
      markActive(registry, id);
      writeItem(tx, item);
      tx.emit({ action: "start", workItemId: id, detail: { type, derivedFrom: suspended.workItemId } });
      tx.result = { suspendedWorkItemId: suspended.workItemId, workItemId: id, type };
    },
  });
}

/** close-and-start：原子关闭当前项并创建 successor（PRD 7.1/7.3 重分类）。 */
export async function opCloseAndStart(root, ctx, { outcome, result = null, type, quote, reason = null, now = () => new Date(), contractRef = null }) {
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
        contractRef,
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

/**
 * rollback：按 accepted lineage 计算逆序级联并创建 Rollback Work Item（PRD 7.9/11.7、FR-B01–B03）。
 * 单事务内：必要时原子 suspend 当前 active 项 → start rollback 项 → 冻结 rollbackPlan 事实 → planned。
 */
export async function opRollback(root, ctx, { targetId, only = false, quote, now = () => new Date() }) {
  if (typeof quote !== "string" || quote.trim() === "") {
    throw E.USAGE("rollback 必须携带 Developer 明确原话（--quote）", "harness rollback <work-item-id> --quote \"<回退原话>\"");
  }
  return transact(root, ctx.stateRef, {
    message: `harness: rollback ${targetId}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      const lineage = deriveAcceptedLineage(tx.snapshot.files);
      const targetIndex = lineage.findIndex((entry) => entry.workItemId === targetId);
      if (targetIndex === -1) throw E.ROLLBACK_TARGET_NOT_ACCEPTED(targetId);
      // 目标之后的全部后继 accepted 项按逆序级联；目标是最新项时集合只有它自身。
      const cascade = lineage.slice(targetIndex).map((entry) => entry.workItemId).reverse();
      const successors = cascade.slice(0, -1);
      if (only && successors.length > 0) throw E.ROLLBACK_REQUIRES_CASCADE(targetId, successors);

      let suspendedWorkItemId = null;
      if (registry.activeWorkItemId !== null) {
        const suspended = readItem(tx, registry.activeWorkItemId);
        applySuspend(suspended, `rollback: ${quote}`, registry.lastAcceptedBaseline, {
          at: tx.at,
          transactionId: tx.transactionId,
          sequence: registry.sequence + 1,
        });
        markSuspended(registry, suspended.workItemId);
        writeItem(tx, suspended);
        suspendedWorkItemId = suspended.workItemId;
        tx.emit({ action: "suspend", workItemId: suspended.workItemId, detail: { reason: `rollback ${targetId}`, atomic: "rollback" } });
      }

      const id = newWorkItemId(now());
      const item = createWorkItem({
        id,
        type: "rollback",
        quote,
        baseline: registry.lastAcceptedBaseline,
        at: tx.at,
        rollbackOf: [targetId],
      });
      markActive(registry, id);
      applyAdvance(item, "planned", { at: tx.at, transactionId: tx.transactionId, sequence: registry.sequence + 1, quote });

      const planBody = {
        target: targetId,
        cascade,
        order: "reverse-accepted-lineage",
        atomicSlice: { count: 1, applies: cascade, order: "reverse-accepted-lineage" },
      };
      const plan = makeFactRevision({
        kind: "rollbackPlan",
        revision: 1,
        body: planBody,
        at: tx.at,
        confirmation: { quote, at: tx.at, sessionRef: null },
      });
      tx.writeJson(factPath(id, "rollbackPlan", 1), plan);
      item.confirmations ??= [];
      item.confirmations.push({ quote, at: tx.at, sessionRef: null, binds: { rollbackPlan: plan.digest } });
      writeItem(tx, item);
      tx.emit({ action: "start", workItemId: id, detail: { type: "rollback", rollbackOf: [targetId], cascade } });
      tx.emit({ action: "rollback-plan", workItemId: id, detail: { target: targetId, cascade, digest: plan.digest } });
      tx.result = { workItemId: id, target: targetId, cascade, stage: item.stage, suspendedWorkItemId };
    },
  });
}

// ---------------------------------------------------------------------------
// Slice 动作（PRD 9.1–9.3）。每个动作恰好一个状态事务；Slice 状态唯一真相在
// work-items/<id>/slices/<slice-id>.json（stateRef，单一事实源）。

/** 从事务视图（snapshot + 未提交 writes）收集 active 项的全部 Slice。 */
function readSlices(tx, workItemId) {
  const merged = new Map(tx.snapshot.files);
  for (const [path, text] of tx.writes) merged.set(path, text);
  return collectSlices(merged, workItemId);
}

function readSlice(tx, slices, sliceId) {
  const slice = slices.get(sliceId);
  if (slice === undefined) throw E.SLICE_NOT_FOUND(sliceId);
  return slice;
}

/** slice create：声明六态 Slice；dependsOn/环/scope 冲突/未固定契约在创建时拒绝（PRD 9.3）。 */
export async function opSliceCreate(root, ctx, { spec, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: `harness: slice create ${spec?.sliceId ?? "?"}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const item = readItem(tx, registry.activeWorkItemId);
      const slices = readSlices(tx, item.workItemId);
      const slice = createSlice({
        workItemId: item.workItemId,
        spec,
        slices,
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
      });
      slices.set(slice.sliceId, slice);
      tx.writeJson(slicePath(item.workItemId, slice.sliceId), slice);
      tx.emit({
        action: "slice-create",
        workItemId: item.workItemId,
        detail: { sliceId: slice.sliceId, revision: 1, dependsOn: slice.dependsOn },
      });
      tx.result = {
        workItemId: item.workItemId,
        sliceId: slice.sliceId,
        revision: slice.revision,
        status: slice.status,
        frontier: computeFrontier(slices),
      };
    },
  });
}

/** slice advance：六态逐态推进（FR-S01）；进入 implementing 要求全部前驱 done（FR-S07）。 */
export async function opSliceAdvance(root, ctx, { sliceId, to, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: `harness: slice advance ${sliceId} → ${to}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const item = readItem(tx, registry.activeWorkItemId);
      const slices = readSlices(tx, item.workItemId);
      const slice = readSlice(tx, slices, sliceId);
      const from = slice.status;
      applySliceAdvance(slice, to, {
        slices,
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
      });
      tx.writeJson(slicePath(item.workItemId, slice.sliceId), slice);
      tx.emit({
        action: "slice-advance",
        workItemId: item.workItemId,
        detail: { sliceId, from, to, revision: slice.revision },
      });
      tx.result = { workItemId: item.workItemId, sliceId, from, to, revision: slice.revision };
    },
  });
}

/**
 * slice update-scope：扩缩 Write Scope 创建新 revision、重算冲突（FR-S06），
 * 既有 Quick/Human Review 失效，Slice 回 ready 重新走正常路径。
 */
export async function opSliceUpdateScope(root, ctx, { sliceId, writeScope, now = () => new Date() }) {
  return transact(root, ctx.stateRef, {
    message: `harness: slice update-scope ${sliceId}`,
    now,
    mutate: async (tx) => {
      const registry = tx.registry();
      if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
      const item = readItem(tx, registry.activeWorkItemId);
      const slices = readSlices(tx, item.workItemId);
      const slice = readSlice(tx, slices, sliceId);
      const revised = applyScopeRevision(slice, writeScope, {
        slices,
        at: tx.at,
        transactionId: tx.transactionId,
        sequence: registry.sequence + 1,
      });
      tx.writeJson(slicePath(item.workItemId, slice.sliceId), slice);
      tx.emit({
        action: "slice-update-scope",
        workItemId: item.workItemId,
        detail: { sliceId, ...revised },
      });
      tx.result = { workItemId: item.workItemId, sliceId, status: slice.status, ...revised };
    },
  });
}
