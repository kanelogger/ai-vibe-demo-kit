// migrate-v1.mjs — v1→v2 一次性迁移（FR-G09 / 验收场景 28）。
// 原子性：全部变更在一个 state commit + 一次 CAS 内完成；
// rollback ref 在 CAS 成功后创建，失败则补偿删除 stateRef，target/state 与旧工作区保持原样。
// 幂等：已迁移/已初始化的项目重跑为 no-op。

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { E } from "./errors.mjs";
import { resolveRef } from "./git.mjs";
import { loadRegistry, transact } from "./state-store.mjs";
import { createRegistry, REGISTRY_PATH } from "./registry.mjs";
import { itemStatePath, STATE_VERSION } from "./work-item.mjs";
import { currentBaseline } from "./context.mjs";
import { git } from "./git.mjs";

export const V1_STATE_CANDIDATES = ["overlay/workflow-state.json", "workflow-state.json"];
export const MIGRATION_BACKUP_REF = "refs/heads/harness/state-migration-backup";
export const LEGACY_WORK_ITEM_ID = "wi-legacy-v1";

// v1 单前向阶段表（harness-stage.mjs）；accepted 在 v1 是阶段，v2 是关闭结果。
const V1_STAGES = [
  "initialized",
  "requirements-draft",
  "requirements-confirmed",
  "design-confirmed",
  "solution-options",
  "solution-selected",
  "implementation-ready",
  "accepted",
];

async function readV1State(root) {
  for (const candidate of V1_STATE_CANDIDATES) {
    try {
      const text = await readFile(join(root, candidate), "utf8");
      return { path: candidate, text, state: JSON.parse(text) };
    } catch (error) {
      if (error.code !== "ENOENT" && error instanceof SyntaxError) {
        throw E.MIGRATION_FAILED(`${candidate} 不是合法 JSON`);
      }
    }
  }
  return null;
}

function mapV1WorkItem(v1, baseline, at) {
  const stage = v1.stage;
  if (!V1_STAGES.includes(stage)) throw E.MIGRATION_FAILED(`未知 v1 阶段 ${stage}`);
  const closed = stage === "accepted";
  const lastQuote = [...(v1.history ?? [])].reverse().find((entry) => entry?.quote)?.quote;
  return {
    version: STATE_VERSION,
    workItemId: LEGACY_WORK_ITEM_ID,
    type: "feature",
    typeProvisional: true,
    status: closed ? "closed" : "active",
    stage: closed ? "acceptance-ready" : stage,
    outcome: closed ? "accepted" : null,
    result: closed ? "changed" : null,
    risk: null,
    baseAcceptance: baseline,
    integration: { branch: `harness/wi/${LEGACY_WORK_ITEM_ID}`, worktree: null },
    request: {
      quote: lastQuote ?? "(v1 迁移：v1 状态未记录原始任务原话)",
      capturedAt: at,
      sessionRef: null,
    },
    relations: { derivedFrom: null, supersedes: null, supersededBy: null, rollbackOf: [], resumedFromBaseline: null },
    suspension: null,
    history: [
      {
        sequence: 1,
        transactionId: null,
        at,
        action: "migrate-v1",
        fromStage: stage,
        toStage: closed ? "acceptance-ready" : stage,
        actor: "developer",
        quote: "v1→v2 一次性迁移",
      },
    ],
    createdAt: at,
    updatedAt: at,
    closedAt: closed ? at : null,
    legacy: { v1Stage: stage, v1History: v1.history ?? [], confirmation: v1.confirmation ?? null, selection: v1.selection ?? null },
  };
}

/**
 * 执行迁移。返回 { migrated, reason?, commit?, backupRef?, workItemId? }。
 * - stateRef 已含有效 registry：no-op（幂等）。
 * - stateRef 存在但无 registry：E_STATE_EXISTS 拒绝覆盖。
 * - 无 v1 文件：按 v2 新项目初始化空 registry（idle）。
 */
export async function migrateState(root, ctx, { now = () => new Date() } = {}) {
  const existing = await resolveRef(root, ctx.stateRef);
  if (existing !== null) {
    const { registry } = await loadRegistry(root, ctx.stateRef);
    if (registry !== null) {
      return { migrated: false, reason: registry.migration ? "already-migrated" : "already-initialized", commit: existing };
    }
    throw E.STATE_EXISTS(ctx.stateRef);
  }

  const baseline = await currentBaseline(root, ctx.targetRef);
  const at = now().toISOString();
  const v1 = await readV1State(root);
  const sourceDigest = v1 ? createHash("sha256").update(v1.text).digest("hex") : null;

  const txResult = await transact(root, ctx.stateRef, {
    message: v1 ? "harness: migrate v1 → v2" : "harness: init v2 state",
    now,
    mutate: async (tx) => {
      const registry = createRegistry({
        targetRef: ctx.targetRef,
        stateRef: ctx.stateRef,
        baseline,
        migration: v1
          ? { from: "v1", at, sourcePath: v1.path, sourceDigest, rollbackRef: MIGRATION_BACKUP_REF }
          : null,
      });

      if (!v1) {
        tx.writeJson(REGISTRY_PATH, registry);
        tx.emit({ action: "init", workItemId: null, detail: { baseline } });
        tx.result = { mode: "init" };
        return;
      }

      const legacyHistory = Array.isArray(v1.state.history) ? v1.state.history : [];
      const idle = v1.state.stage === "initialized" && legacyHistory.length === 0;
      tx.emit({
        action: "migrate-v1",
        workItemId: null,
        detail: { sourcePath: v1.path, sourceDigest, v1Stage: v1.state.stage, idle },
        legacy: true,
      });
      if (idle) {
        tx.writeJson(REGISTRY_PATH, registry);
        tx.result = { mode: "migrate-idle" };
        return;
      }

      // 先确定 active 指针再序列化 registry，避免写入过期快照。
      const item = mapV1WorkItem(v1.state, baseline, at);
      if (item.status === "active") registry.activeWorkItemId = item.workItemId;
      tx.writeJson(REGISTRY_PATH, registry);
      tx.writeJson(itemStatePath(item.workItemId), item);
      tx.emit({
        action: "migrate-v1-item",
        workItemId: item.workItemId,
        detail: { type: item.type, stage: item.stage, status: item.status, outcome: item.outcome },
        legacy: true,
      });
      tx.result = { mode: "migrate-item", workItemId: item.workItemId, status: item.status };
    },
  });

  // rollback ref：记录迁移前 targetRef tip（含 v1 工作区的最后 accepted 代码版本）。
  // 仅真实迁移需要；失败时补偿删除 stateRef，保持“失败不半更新”。
  if (v1) {
    try {
      await git(root, ["update-ref", MIGRATION_BACKUP_REF, baseline.commit]);
    } catch (error) {
      await git(root, ["update-ref", "-d", ctx.stateRef, txResult.commit]).catch(() => {});
      throw E.MIGRATION_FAILED(`rollback ref 创建失败：${error.message}`);
    }
  }

  return {
    migrated: true,
    commit: txResult.commit,
    transactionId: txResult.transactionId,
    backupRef: v1 ? MIGRATION_BACKUP_REF : null,
    ...txResult.result,
  };
}
