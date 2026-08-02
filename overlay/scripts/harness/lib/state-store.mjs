// state-store.mjs — stateRef 事务核心（PRD 6.2 / NFR-02 / FR-G02）。
// 每个 mutation：读取快照 → 一致性检查 → 内存变更 → 单 commit → CAS。
// 任何失败都发生在 CAS 之前，stateRef 绝不半更新。

import { randomUUID } from "node:crypto";
import { E } from "./errors.mjs";
import { readTreeFiles, readBlob, writeBlob, writeTree, commitState, casRef, resolveRef } from "./git.mjs";
import { assertConsistent, stampEvents, serializeEvents, eventsForItem } from "./audit.mjs";
import { REGISTRY_PATH, ROOT_AUDIT_PATH, validateRegistry } from "./registry.mjs";
import { itemAuditPath } from "./work-item.mjs";

/** 只读加载 stateRef 快照。ref 不存在时返回空快照（commit=null）。 */
export async function loadSnapshot(root, stateRef) {
  const commit = await resolveRef(root, stateRef);
  if (commit === null) return { commit: null, files: new Map(), oids: new Map() };
  const oids = await readTreeFiles(root, commit);
  const files = new Map();
  for (const [path, oid] of oids) files.set(path, await readBlob(root, oid));
  return { commit, files, oids };
}

export class StateTransaction {
  constructor(snapshot, { transactionId, at }) {
    this.snapshot = snapshot;
    this.transactionId = transactionId;
    this.at = at;
    this.writes = new Map(); // path → string
    this.events = []; // 未盖章事件
  }

  has(path) {
    return this.writes.has(path) || this.snapshot.files.has(path);
  }

  readText(path) {
    if (this.writes.has(path)) return this.writes.get(path);
    return this.snapshot.files.get(path);
  }

  readJson(path) {
    const text = this.readText(path);
    return text === undefined ? undefined : JSON.parse(text);
  }

  writeText(path, text) {
    this.writes.set(path, text);
  }

  writeJson(path, value) {
    this.writes.set(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  /** 读取 registry 供原地修改；事务提交时统一校验并写回。 */
  registry() {
    const registry = this.readJson(REGISTRY_PATH);
    if (registry === undefined) throw E.NOT_MIGRATED("stateRef");
    const problems = validateRegistry(registry);
    if (problems.length > 0) throw E.STATE_INCONSISTENT(`registry.json 非法：${problems.join("；")}`);
    this._registryTouched = registry;
    return registry;
  }

  emit(event) {
    this.events.push(event);
  }
}

/**
 * 执行一个状态事务。
 * mutate(tx) 内完成所有领域变更；成功返回 { commit, transactionId, sequence, events }。
 */
export async function transact(root, stateRef, { message, now = () => new Date(), mutate }) {
  const snapshot = await loadSnapshot(root, stateRef);
  assertConsistent(snapshot.files);

  const at = now().toISOString();
  const tx = new StateTransaction(snapshot, { transactionId: `tx-${randomUUID()}`, at });
  await mutate(tx);

  // registry 序列与账本同事务推进。
  const registry = tx._registryTouched ?? tx.readJson(REGISTRY_PATH);
  if (registry !== undefined) {
    const problems = validateRegistry(registry);
    if (problems.length > 0) throw E.STATE_INCONSISTENT(`事务后 registry 非法：${problems.join("；")}`);
    registry.sequence += 1;
    registry.lastTransactionId = tx.transactionId;
    tx.writeJson(REGISTRY_PATH, registry);
  }

  // 账本：根 ndjson 追加 + per-item 派生视图同 commit 写入。
  const sequence = registry?.sequence ?? 0;
  const stamped = stampEvents(tx.events, { sequence, transactionId: tx.transactionId, at });
  if (stamped.length > 0) {
    const prior = tx.readText(ROOT_AUDIT_PATH) ?? "";
    tx.writeText(ROOT_AUDIT_PATH, prior + serializeEvents(stamped));
    const touchedItems = new Set(stamped.map((event) => event.workItemId).filter(Boolean));
    for (const workItemId of touchedItems) {
      const path = itemAuditPath(workItemId);
      const priorItem = tx.readText(path) ?? "";
      tx.writeText(path, priorItem + serializeEvents(eventsForItem(stamped, workItemId)));
    }
  }

  // 构建新 tree 并 CAS：未变更文件复用旧 oid。
  const nextOids = new Map(snapshot.oids);
  for (const [path, content] of tx.writes) nextOids.set(path, await writeBlob(root, content));
  const treeOid = await writeTree(root, nextOids);
  const commit = await commitState(root, {
    treeOid,
    parent: snapshot.commit,
    message: `${message}\n\ntransaction: ${tx.transactionId}\n`,
    at,
  });
  await casRef(root, stateRef, commit, snapshot.commit);

  return { commit, transactionId: tx.transactionId, sequence, events: stamped, result: tx.result ?? null };
}

/** 只读加载 registry；供 status/校验使用。 */
export async function loadRegistry(root, stateRef) {
  const snapshot = await loadSnapshot(root, stateRef);
  if (snapshot.commit === null) return { commit: null, registry: null, snapshot };
  assertConsistent(snapshot.files);
  const registryText = snapshot.files.get(REGISTRY_PATH);
  if (registryText === undefined) return { commit: snapshot.commit, registry: null, snapshot };
  const registry = JSON.parse(registryText);
  const problems = validateRegistry(registry);
  if (problems.length > 0) throw E.STATE_INCONSISTENT(`registry.json 非法：${problems.join("；")}`);
  return { commit: snapshot.commit, registry, snapshot };
}
