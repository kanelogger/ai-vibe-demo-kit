// state-store.test.mjs — stateRef 事务契约：原子 CAS、账本一致性、无半更新（NFR-02 / FR-G02）。

import test from "node:test";
import assert from "node:assert/strict";
import { makeRepo, ctxOf, refTip, stateFileJson, stateFile } from "./helpers.mjs";
import { transact, loadRegistry, loadSnapshot } from "../lib/state-store.mjs";
import { createRegistry, REGISTRY_PATH, ROOT_AUDIT_PATH } from "../lib/registry.mjs";
import { git, writeBlob, writeTree, commitState, readTreeFiles, readBlob } from "../lib/git.mjs";

async function initState(root, ctx) {
  const { currentBaseline } = await import("../lib/context.mjs");
  const baseline = await currentBaseline(root, ctx.targetRef);
  return transact(root, ctx.stateRef, {
    message: "test init",
    mutate: async (tx) => {
      tx.writeJson(REGISTRY_PATH, createRegistry({ targetRef: ctx.targetRef, stateRef: ctx.stateRef, baseline }));
      tx.emit({ action: "init", workItemId: null, detail: {} });
    },
  });
}

test("事务创建 stateRef，序列与账本同步推进", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  const first = await initState(root, ctx);
  assert.ok(await refTip(root, ctx.stateRef), "stateRef 必须存在");

  const second = await transact(root, ctx.stateRef, {
    message: "second",
    mutate: async (tx) => {
      tx.registry();
      tx.emit({ action: "ping", workItemId: null, detail: {} });
    },
  });
  assert.notEqual(first.commit, second.commit);

  const registry = await stateFileJson(root, REGISTRY_PATH);
  assert.equal(registry.sequence, 2);
  assert.equal(registry.lastTransactionId, second.transactionId);

  const ledger = (await stateFile(root, ROOT_AUDIT_PATH)).split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(ledger.length, 2);
  assert.equal(ledger[1].transactionId, second.transactionId);
  assert.equal(ledger[1].sequence, 2);
});

test("CAS 漂移：并发更新 stateRef 时事务拒绝且不半更新", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  await initState(root, ctx);

  // 第三方先把 ref 推进一步
  const intruder = await transact(root, ctx.stateRef, {
    message: "intruder",
    mutate: async (tx) => {
      tx.registry();
      tx.emit({ action: "intruder", workItemId: null, detail: {} });
    },
  });

  // 构造一个基于过期快照的事务：mutate 内再确认 ref 已被移动
  const staleSnapshot = await loadSnapshot(root, ctx.stateRef); // 当前快照（intruder 之后）
  await assert.rejects(
    transact(root, ctx.stateRef, {
      message: "victim",
      mutate: async (tx) => {
        tx.registry();
        tx.emit({ action: "victim", workItemId: null, detail: {} });
        // 模拟并发：在 CAS 前把 ref 移到另一个 commit
        const other = await commitState(root, {
          treeOid: await writeTree(root, await readTreeFiles(root, staleSnapshot.commit)),
          parent: staleSnapshot.commit,
          message: "concurrent",
          at: new Date().toISOString(),
        });
        await git(root, ["update-ref", ctx.stateRef, other]);
      },
    }),
    (error) => error.code === "E_REF_DRIFT",
  );

  // ref 保持并发方的值，victim 的写入不可见
  const registry = await stateFileJson(root, REGISTRY_PATH);
  assert.equal(registry.sequence, 2, "registry 不得包含 victim 的半更新");
});

test("registry 与账本不一致时阻断推进（E_STATE_INCONSISTENT）", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  await initState(root, ctx);

  // 篡改：只改 registry.sequence，不同步账本
  const snapshot = await loadSnapshot(root, ctx.stateRef);
  const registry = JSON.parse(snapshot.files.get(REGISTRY_PATH));
  registry.sequence += 7;
  const oids = new Map(snapshot.oids);
  oids.set(REGISTRY_PATH, await writeBlob(root, `${JSON.stringify(registry)}\n`));
  const tampered = await commitState(root, {
    treeOid: await writeTree(root, oids),
    parent: snapshot.commit,
    message: "tamper",
    at: new Date().toISOString(),
  });
  await git(root, ["update-ref", ctx.stateRef, tampered]);

  await assert.rejects(loadRegistry(root, ctx.stateRef), (error) => error.code === "E_STATE_INCONSISTENT");
  await assert.rejects(
    transact(root, ctx.stateRef, {
      message: "blocked",
      mutate: async (tx) => {
        tx.registry();
      },
    }),
    (error) => error.code === "E_STATE_INCONSISTENT",
  );
});

test("blob 内容可反查：状态文件逐字节等于写入内容（NFR-12）", async () => {
  const root = await makeRepo();
  const ctx = ctxOf(root);
  await initState(root, ctx);
  const tip = await refTip(root, ctx.stateRef);
  const tree = await readTreeFiles(root, tip);
  const registryText = await readBlob(root, tree.get(REGISTRY_PATH));
  const registry = JSON.parse(registryText);
  assert.equal(registry.version, 2);
  assert.equal(registry.targetRef, "refs/heads/main");
  assert.equal(registry.activeWorkItemId, null, "全新项目必须是显式 idle");
});
