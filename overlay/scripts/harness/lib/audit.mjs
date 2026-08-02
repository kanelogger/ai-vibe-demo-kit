// audit.mjs — Audit Ledger（CONTEXT / FR-G02）。
// 根 audit.ndjson 是唯一权威账本：每个状态事务追加共享 transactionId 与 sequence 的事件。
// work-items/<id>/audit.ndjson 是同一事务内按 workItemId 过滤的派生视图，随 namespace 冻结。
// registry 与账本不一致时阻断一切推进（E_STATE_INCONSISTENT）。

import { E } from "./errors.mjs";
import { REGISTRY_PATH, ROOT_AUDIT_PATH } from "./registry.mjs";

export function parseLedger(text) {
  const events = [];
  for (const line of (text ?? "").split("\n")) {
    if (line.trim() === "") continue;
    events.push(JSON.parse(line));
  }
  return events;
}

export function lastLedgerEvent(text) {
  const events = parseLedger(text);
  return events.length === 0 ? null : events[events.length - 1];
}

/**
 * 一致性检查：registry.sequence/lastTransactionId 必须与账本末尾一致。
 * files: Map<path, string>（已读出的状态快照）。
 */
export function assertConsistent(files) {
  const registryText = files.get(REGISTRY_PATH);
  const ledgerText = files.get(ROOT_AUDIT_PATH);
  if (registryText === undefined && ledgerText === undefined) return; // 全新 stateRef
  if (registryText === undefined || ledgerText === undefined) {
    throw E.STATE_INCONSISTENT("registry.json 与 audit.ndjson 只存在其一");
  }
  const registry = JSON.parse(registryText);
  const last = lastLedgerEvent(ledgerText);
  if (registry.sequence === 0 && registry.lastTransactionId === null && last === null) return;
  if (!last) throw E.STATE_INCONSISTENT("registry 有序列但账本为空");
  if (last.sequence !== registry.sequence || last.transactionId !== registry.lastTransactionId) {
    throw E.STATE_INCONSISTENT(
      `registry(sequence=${registry.sequence}, tx=${registry.lastTransactionId}) ≠ ledger(sequence=${last.sequence}, tx=${last.transactionId})`,
    );
  }
}

/** 生成事务事件：同一事务共享 sequence 与 transactionId。 */
export function stampEvents(events, { sequence, transactionId, at }) {
  return events.map((event) => ({ version: 2, sequence, transactionId, at, ...event }));
}

export function serializeEvents(events) {
  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

/** 过滤某 Work Item 的事件（含 workItemId 等于该 id 的事件）。 */
export function eventsForItem(events, workItemId) {
  return events.filter((event) => event.workItemId === workItemId);
}
