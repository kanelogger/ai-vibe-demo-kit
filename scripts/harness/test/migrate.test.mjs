// migrate.test.mjs — v1→v2 一次性迁移契约（FR-G09 / 验收场景 28）。
// 幂等、rollback ref、失败不半更新。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeRepo, ctxOf, refTip, stateFileJson, sh } from "./helpers.mjs";
import { migrateState, MIGRATION_BACKUP_REF, LEGACY_WORK_ITEM_ID } from "../lib/migrate-v1.mjs";
import { REGISTRY_PATH } from "../lib/registry.mjs";
import { itemStatePath } from "../lib/work-item.mjs";
import { opAdvance } from "../lib/ops.mjs";

async function writeV1State(root, state) {
  await mkdir(join(root, "overlay"), { recursive: true });
  const text = `${JSON.stringify(state, null, 2)}\n`;
  await writeFile(join(root, "overlay", "workflow-state.json"), text);
  await sh("git", ["add", "-A"], root);
  await sh("git", ["commit", "-m", "add v1 state"], root);
  return text;
}

test("无 v1 文件：按 v2 新项目初始化 idle registry，无 backup ref", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  const result = await migrateState(root, ctx);
  assert.equal(result.migrated, true);
  assert.equal(result.mode, "init");
  assert.equal(result.backupRef, null);

  const registry = await stateFileJson(root, REGISTRY_PATH);
  assert.equal(registry.activeWorkItemId, null);
  assert.deepEqual(registry.suspendedWorkItemIds, []);
  assert.equal(registry.lastAcceptedBaseline.commit, await refTip(root, "refs/heads/main"));
  assert.equal(await refTip(root, MIGRATION_BACKUP_REF), null);
});

test("v1 initialized 空历史：迁移为 idle，保留 rollback ref 与来源摘要", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  const v1Text = await writeV1State(root, {
    stage: "initialized",
    allowedNextStages: ["requirements-draft"],
    currentStageDoc: null,
    lastConfirmedDoc: null,
    confirmation: null,
    selection: null,
    history: [],
  });
  const result = await migrateState(root, ctx);
  assert.equal(result.mode, "migrate-idle");

  const registry = await stateFileJson(root, REGISTRY_PATH);
  assert.equal(registry.activeWorkItemId, null);
  assert.equal(registry.migration.from, "v1");
  assert.equal(registry.migration.rollbackRef, MIGRATION_BACKUP_REF);
  assert.equal(registry.migration.sourceDigest, createHash("sha256").update(v1Text).digest("hex"));
  assert.equal(await refTip(root, MIGRATION_BACKUP_REF), await refTip(root, "refs/heads/main"));
});

test("v1 中间阶段：迁移为 active legacy Feature 项，可继续推进", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  await writeV1State(root, {
    stage: "solution-selected",
    allowedNextStages: ["implementation-ready"],
    currentStageDoc: "workflow/solution-selected.md",
    lastConfirmedDoc: "workflow/solution-selected.md",
    confirmation: { quote: "就用方案 B" },
    selection: { option: "B" },
    history: [{ stage: "requirements-confirmed", quote: "需求确认" }],
  });
  const result = await migrateState(root, ctx);
  assert.equal(result.mode, "migrate-item");
  assert.equal(result.workItemId, LEGACY_WORK_ITEM_ID);

  const registry = await stateFileJson(root, REGISTRY_PATH);
  assert.equal(registry.activeWorkItemId, LEGACY_WORK_ITEM_ID);
  const item = await stateFileJson(root, itemStatePath(LEGACY_WORK_ITEM_ID));
  assert.equal(item.type, "feature");
  assert.equal(item.stage, "solution-selected");
  assert.equal(item.status, "active");
  assert.equal(item.legacy.confirmation.quote, "就用方案 B");

  // 迁移后可沿 feature 生命周期继续推进
  const advanced = await opAdvance(root, ctx, { to: "implementation-ready" });
  assert.equal(advanced.result.to, "implementation-ready");
});

test("v1 accepted（旧把 accepted 当阶段）：迁移为 closed(outcome=accepted)", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  await writeV1State(root, { stage: "accepted", allowedNextStages: [], history: [{ stage: "accepted", quote: "可以" }] });
  const result = await migrateState(root, ctx);
  assert.equal(result.mode, "migrate-item");

  const registry = await stateFileJson(root, REGISTRY_PATH);
  assert.equal(registry.activeWorkItemId, null, "closed 项不得占用 active slot");
  const item = await stateFileJson(root, itemStatePath(LEGACY_WORK_ITEM_ID));
  assert.equal(item.status, "closed");
  assert.equal(item.outcome, "accepted");
  assert.equal(item.result, "changed");
});

test("幂等：已迁移项目重跑为 no-op", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  const first = await migrateState(root, ctx);
  const second = await migrateState(root, ctx);
  assert.equal(second.migrated, false);
  assert.equal(second.reason, "already-initialized");
  assert.equal(await refTip(root, ctx.stateRef), first.commit, "no-op 不得产生新 commit");
});

test("stateRef 已存在但无 registry：拒绝覆盖且不改动任何 ref", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  // 手工创建一个不含 registry.json 的 stateRef
  await sh("git", ["update-ref", ctx.stateRef, "refs/heads/main"], root);
  const before = await refTip(root, ctx.stateRef);
  await assert.rejects(migrateState(root, ctx), (error) => error.code === "E_STATE_EXISTS");
  assert.equal(await refTip(root, ctx.stateRef), before, "失败不得改动 stateRef");
  assert.equal(await refTip(root, MIGRATION_BACKUP_REF), null, "失败不得创建 backup ref");
});
