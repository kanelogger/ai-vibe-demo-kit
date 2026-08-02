// facts.mjs — 不可变 Fact Revision 存储（PRD 10.2 / FR-G04）。
// 一经确认即冻结：独立 revision + 内容摘要；reopen 创建后继 revision（Phase C），不覆盖旧文档。

import { createHash } from "node:crypto";

/** 稳定序列化：对象键递归排序，保证同一内容同一 digest。 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function digestOf(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function factPath(workItemId, kind, revision) {
  return `work-items/${workItemId}/facts/${kind}/r${revision}.json`;
}

export function makeFactRevision({ kind, revision, body, at, confirmation }) {
  return {
    version: 2,
    kind,
    revision,
    digest: digestOf(body),
    body,
    confirmedAt: at,
    confirmation,
  };
}
