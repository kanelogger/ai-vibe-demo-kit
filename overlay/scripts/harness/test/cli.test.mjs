// cli.test.mjs — 端到端 CLI 契约（FR-H01/H02、FR-G03/G05、退出码与 JSON 稳定性）。
// 全流程：init → start → advance → evidence-only close → suspend/resume → 原子组合。

import test from "node:test";
import assert from "node:assert/strict";
import { makeRepo, runCli, stateFile, stateFileJson } from "./helpers.mjs";

test("完整生命周期：init → idle → start → advance → evidence-only → close(no-change)", async () => {
  const root = await makeRepo();

  let r = await runCli(root, ["status", "--json"]);
  assert.equal(r.code, 0);
  assert.equal(r.json.migrated, false, "未迁移时 status 必须能回答且为只读");

  r = await runCli(root, ["migrate-state", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.migrated, true);

  r = await runCli(root, ["status", "--json"]);
  assert.equal(r.json.idle, true);
  assert.equal(r.json.active, null);

  r = await runCli(root, ["start", "--type", "feature", "--quote", "给 CLI 加状态输出", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  const itemId = r.json.workItemId;
  assert.equal(r.json.stage, "initialized");

  r = await runCli(root, ["advance", "--to", "requirements-draft", "--quote", "需求草稿过一遍", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  r = await runCli(root, ["advance", "--to", "requirements-confirmed", "--quote", "确认", "--json"]);
  assert.equal(r.code, 0);

  // evidence-only：requirements-confirmed 是 feature 的合法 evidence-ready 入口
  r = await runCli(root, ["advance", "--to", "evidence-ready", "--quote", "现有行为已满足", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  r = await runCli(root, ["advance", "--to", "acceptance-ready", "--json"]);
  assert.equal(r.code, 0);

  r = await runCli(root, ["close", "--outcome", "accepted", "--result", "no-change", "--quote", "验收", "--json"]);
  assert.equal(r.code, 0, r.stderr);

  r = await runCli(root, ["status", "--json"]);
  assert.equal(r.json.idle, true);
  assert.equal(r.json.active, null);

  // 关闭项 namespace 冻结在 stateRef，不占用 registry
  const closed = await stateFileJson(root, `work-items/${itemId}/state.json`);
  assert.equal(closed.status, "closed");
  assert.equal(closed.outcome, "accepted");
  assert.equal(closed.result, "no-change");
});

test("suspend / resume 与原子组合命令", async () => {
  const root = await makeRepo();
  await runCli(root, ["migrate-state"]);

  const a = (await runCli(root, ["start", "--type", "feature", "--quote", "做功能 A", "--json"])).json.workItemId;

  let r = await runCli(root, [
    "suspend-and-start", "--type", "bugfix", "--quote", "紧急修复 B", "--reason", "线上报错",
    "--contract-ref", "SPECS/payments.md#refund", "--json",
  ]);
  assert.equal(r.code, 0, r.stderr);
  const b = r.json.workItemId;
  assert.equal(r.json.suspendedWorkItemId, a);

  r = await runCli(root, ["status", "--json"]);
  assert.equal(r.json.active.workItemId, b);
  assert.deepEqual(r.json.suspended.map((s) => s.workItemId), [a]);
  assert.equal(r.json.suspended[0].baselineDrift, false);

  // suspended 项不可推进
  r = await runCli(root, ["resume", a, "--json"]);
  assert.equal(r.code, 1, "有 active 项时 resume 必须拒绝");
  assert.match(r.stderr, /E_ACTIVE_EXISTS/);

  r = await runCli(root, ["close", "--outcome", "abandoned", "--quote", "误报", "--json"]);
  assert.equal(r.code, 0);

  r = await runCli(root, ["resume", a, "--json"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.baselineDrift, false);

  // close-and-start：supersede A，开 maintenance 后继
  r = await runCli(root, [
    "close-and-start", "--outcome", "superseded", "--type", "maintenance", "--quote", "改为维护性收口", "--json",
  ]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.closedWorkItemId, a);
  const successor = r.json.workItemId;
  const closedA = await stateFileJson(root, `work-items/${a}/state.json`);
  assert.equal(closedA.outcome, "superseded");
  assert.equal(closedA.relations.supersededBy, successor);
  const successorState = await stateFileJson(root, `work-items/${successor}/state.json`);
  assert.equal(successorState.relations.supersedes, a);
});

test("门禁拒绝与退出码契约", async () => {
  const root = await makeRepo();

  // 未迁移时状态命令拒绝并给出修复命令
  let r = await runCli(root, ["start", "--type", "feature", "--quote", "x"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /E_NOT_MIGRATED/);
  assert.match(r.stderr, /REPAIR: harness migrate-state/);

  await runCli(root, ["migrate-state"]);

  // 无 active 时 advance 拒绝
  r = await runCli(root, ["advance", "--to", "requirements-draft"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /E_NO_ACTIVE/);

  await runCli(root, ["start", "--type", "bugfix", "--quote", "修 B", "--contract-ref", "SPECS/b.md#contract"]);

  // 第二个 start 拒绝
  r = await runCli(root, ["start", "--type", "feature", "--quote", "y"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /E_ACTIVE_EXISTS/);

  // 非法跳转：initialized → solution-selected
  r = await runCli(root, ["advance", "--to", "solution-selected"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /E_ILLEGAL_TRANSITION/);

  // 类型外阶段：bugfix → requirements-draft
  r = await runCli(root, ["advance", "--to", "requirements-draft"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /E_ILLEGAL_TRANSITION/);

  // accepted 不是阶段
  r = await runCli(root, ["advance", "--to", "accepted"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /E_ILLEGAL_TRANSITION/);

  // accepted 关闭缺 --result → 用法错误 exit 2
  r = await runCli(root, ["close", "--outcome", "accepted"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /E_USAGE/);

  // 未知类型 → exit 2
  r = await runCli(root, ["close-and-start", "--outcome", "abandoned", "--type", "chore", "--quote", "z"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /E_INVALID_TYPE/);

  // 缺 quote → exit 2
  r = await runCli(root, ["close-and-start", "--outcome", "abandoned", "--type", "feature"]);
  assert.equal(r.code, 2);
});

test("审计账本：序列、transactionId 与 per-item 派生视图一致", async () => {
  const root = await makeRepo();
  await runCli(root, ["migrate-state"]);
  const id = (await runCli(root, ["start", "--type", "maintenance", "--quote", "升级依赖", "--json"])).json.workItemId;
  await runCli(root, ["advance", "--to", "scope-confirmed", "--quote", "范围 OK"]);
  await runCli(root, ["suspend", "--reason", "插入别的事"]);

  const registry = await stateFileJson(root, "registry.json");
  assert.equal(registry.sequence, 4, "migrate + start + advance + suspend 共 4 个事务");

  const rootLedger = (await stateFile(root, "audit.ndjson")).split("\n").filter(Boolean).map(JSON.parse);
  const last = rootLedger[rootLedger.length - 1];
  assert.equal(last.sequence, registry.sequence);
  assert.equal(last.transactionId, registry.lastTransactionId);
  assert.ok(rootLedger.every((event) => event.version === 2));

  // per-item 派生视图 == 根账本按 workItemId 过滤
  const itemLedger = (await stateFile(root, `work-items/${id}/audit.ndjson`)).split("\n").filter(Boolean).map(JSON.parse);
  const filtered = rootLedger.filter((event) => event.workItemId === id);
  assert.deepEqual(itemLedger, filtered);
  assert.ok(itemLedger.length >= 3, "start/advance/suspend 事件必须落在 item namespace");
});
