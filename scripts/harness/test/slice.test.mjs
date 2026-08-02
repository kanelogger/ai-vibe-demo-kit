// slice.test.mjs — Slice 模型纯函数单测（PRD 9.1–9.3）。
// 覆盖 CLI fixtures 到不了的层：多节点环、重叠矩阵、路径规范化边界、证据标记失效语义。

import test from "node:test";
import assert from "node:assert/strict";
import {
  SLICE_MAIN_PATH,
  isLegalSliceTransition,
  nextSliceStates,
  normalizeScopePath,
  validateWriteScope,
  scopesOverlap,
  wouldCycle,
  computeFrontier,
  depsPending,
  createSlice,
  applySliceAdvance,
  applyScopeRevision,
} from "../lib/slice.mjs";

const CTX = { at: "2026-08-02T00:00:00.000Z", transactionId: "tx-test", sequence: 1 };

/** 断言抛出的 HarnessError 带指定稳定错误码。 */
const throwsCode = (fn, code) =>
  assert.throws(fn, (error) => {
    assert.equal(error.code, code, `${error.message} 应为 ${code}`);
    return true;
  });

// ---- 转移表（PRD 9.1 / FR-S01）----

test("六态相邻转移全部合法，跳态全部非法", () => {
  for (let i = 0; i < SLICE_MAIN_PATH.length - 1; i += 1) {
    assert.ok(isLegalSliceTransition(SLICE_MAIN_PATH[i], SLICE_MAIN_PATH[i + 1]));
  }
  assert.equal(isLegalSliceTransition("ready", "runnable"), false);
  assert.equal(isLegalSliceTransition("implementing", "human-reviewed"), false);
  assert.equal(isLegalSliceTransition("runnable", "verified"), false);
  assert.equal(isLegalSliceTransition("human-reviewed", "done"), false);
  assert.equal(isLegalSliceTransition("invalidated", "ready"), false);
});

test("任意下游状态（含 done）可进 invalidated；invalidated 是终态", () => {
  for (const from of SLICE_MAIN_PATH) {
    assert.ok(isLegalSliceTransition(from, "invalidated"), `${from} → invalidated`);
  }
  assert.deepEqual(nextSliceStates("done"), ["invalidated"]);
  assert.deepEqual(nextSliceStates("invalidated"), []);
});

// ---- 路径规范化（NFR-06）----

test("normalizeScopePath 拒绝 glob/绝对路径/反斜杠/点段", () => {
  for (const bad of ["src/**", "src/*.js", "a?.js", "src/{a,b}.js", "/abs.js", "C:\\\\win.js", "a\\\\b.js", "../up.js", "./dot.js", "a//b.js", ""]) {
    throwsCode(() => normalizeScopePath(bad), "E_INVALID_WRITE_SCOPE");
  }
  assert.equal(normalizeScopePath("src/lib/a.js"), "src/lib/a.js");
  assert.equal(normalizeScopePath("a.js"), "a.js");
});

// ---- Write Scope 校验（PRD 9.3）----

test("rename 必须同时拥有 source 与 destination", () => {
  throwsCode(
    () => validateWriteScope({ exact: [], subtrees: ["src"], renames: [{ from: "src/a.js" }] }),
    "E_INVALID_WRITE_SCOPE",
  );
  throwsCode(
    () => validateWriteScope({ exact: [], subtrees: ["src"], renames: [{ to: "src/b.js" }] }),
    "E_INVALID_WRITE_SCOPE",
  );
});

test("writeScope 集合必须是数组，否则稳定错误而非 TypeError", () => {
  for (const bad of [{ exact: {} }, { subtrees: {} }, { renames: {} }]) {
    throwsCode(() => validateWriteScope(bad), "E_INVALID_WRITE_SCOPE");
  }
});

test("rename source 必须拥有（exact 或 subtree），destination 必须落在 owned subtree", () => {
  throwsCode(
    () => validateWriteScope({ exact: [], subtrees: ["src"], renames: [{ from: "outside/a.js", to: "src/b.js" }] }),
    "E_INVALID_WRITE_SCOPE",
  );
  const viaSubtree = validateWriteScope({ exact: [], subtrees: ["src"], renames: [{ from: "src/a.js", to: "src/b.js" }] });
  assert.deepEqual(viaSubtree.renames, [{ from: "src/a.js", to: "src/b.js" }]);
  const viaExact = validateWriteScope({ exact: ["a.js"], subtrees: ["src"], renames: [{ from: "a.js", to: "src/b.js" }] });
  assert.deepEqual(viaExact.renames, [{ from: "a.js", to: "src/b.js" }]);
});

test("rename destination 必须落在 owned subtree", () => {
  assert.throws(
    () => validateWriteScope({ exact: ["docs"], subtrees: ["src"], renames: [{ from: "src/a.js", to: "docs/b.js" }] }),
    /owned subtree/,
  );
  const scope = validateWriteScope({ exact: [], subtrees: ["src"], renames: [{ from: "src/a.js", to: "src/b.js" }] });
  assert.deepEqual(scope.renames, [{ from: "src/a.js", to: "src/b.js" }]);
});

// ---- scope 重叠矩阵（PRD 9.3）----

const scopeOf = (over = {}) => ({ exact: [], subtrees: [], renames: [], ...over });

test("scopesOverlap：exact/exact、exact/subtree、subtree/subtree、大小写、前缀陷阱", () => {
  assert.ok(scopesOverlap(scopeOf({ exact: ["a.js"] }), scopeOf({ exact: ["a.js"] })));
  assert.ok(scopesOverlap(scopeOf({ exact: ["src/a.js"] }), scopeOf({ subtrees: ["src"] })));
  assert.ok(scopesOverlap(scopeOf({ subtrees: ["src"] }), scopeOf({ subtrees: ["src/lib"] })));
  assert.ok(scopesOverlap(scopeOf({ subtrees: ["src/lib"] }), scopeOf({ subtrees: ["src"] })));
  assert.ok(scopesOverlap(scopeOf({ exact: ["Src/A.js"] }), scopeOf({ subtrees: ["src"] })), "大小写不敏感");
  assert.equal(scopesOverlap(scopeOf({ subtrees: ["src/a"] }), scopeOf({ subtrees: ["src/ab"] })), null, "src/ab 不在 src/a/ 内");
  assert.equal(scopesOverlap(scopeOf({ exact: ["a.js"] }), scopeOf({ exact: ["b.js"] })), null);
  assert.ok(
    scopesOverlap(scopeOf({ renames: [{ from: "x/a.js", to: "x/b.js" }] }), scopeOf({ exact: ["x/b.js"] })),
    "rename destination 参与冲突",
  );
  assert.ok(
    scopesOverlap(scopeOf({ renames: [{ from: "x/a.js", to: "x/b.js" }] }), scopeOf({ exact: ["x/a.js"] })),
    "rename source 参与冲突",
  );
});

// ---- DAG 与 frontier（FR-S07）----

const sliceStub = (sliceId, dependsOn = [], status = "ready") => ({ sliceId, dependsOn, status });

test("wouldCycle：自环、三节点环、DAG", () => {
  const slices = new Map([
    ["a", sliceStub("a", ["b"])],
    ["b", sliceStub("b", ["c"])],
  ]);
  assert.deepEqual(wouldCycle(slices, "c", ["c"]), ["c", "c"]);
  assert.ok(wouldCycle(slices, "c", ["a"]) !== null, "c→a→b→c 成环");
  assert.equal(wouldCycle(slices, "d", ["a"]), null);
});

test("computeFrontier：前驱 done 才进入；done/invalidated 退出", () => {
  const slices = new Map([
    ["a", sliceStub("a")],
    ["b", sliceStub("b", ["a"])],
    ["c", sliceStub("c", [], "invalidated")],
  ]);
  assert.deepEqual(computeFrontier(slices), ["a"]);
  slices.get("a").status = "done";
  assert.deepEqual(computeFrontier(slices), ["b"]);
  assert.deepEqual(depsPending(slices.get("b"), slices), []);
});

// ---- 创建与领域动作 ----

const specOf = (over = {}) => ({
  sliceId: "s1",
  primaryUncertainty: "u",
  acceptanceCriteria: ["a"],
  writeScope: { exact: ["src/a.js"], subtrees: [], renames: [] },
  verification: { quick: ["true"] },
  ...over,
});

test("createSlice 最小字段齐全（§9.2）", () => {
  const slice = createSlice({ workItemId: "wi-1", spec: specOf(), slices: new Map(), ...CTX });
  for (const field of [
    "version", "workItemId", "sliceId", "revision", "status",
    "primaryUncertainty", "nonGoals", "dependsOn",
    "writeScope", "contractRefs", "dependencyDigests",
    "acceptanceCriteria", "reviewPath",
    "quickReport", "reviewAttempts", "currentHumanReview", "feedback",
    "commit", "integratedAt", "rollback", "history", "updatedAt",
  ]) {
    assert.ok(field in slice, `缺字段 ${field}`);
  }
  assert.equal(slice.status, "ready");
  assert.equal(slice.revision, 1);
});

test("createSlice 缺必填段 → E_SLICE_INCOMPLETE；未固定契约 → E_UNPINNED_CONTRACT", () => {
  throwsCode(() => createSlice({ workItemId: "wi-1", spec: { sliceId: "x" }, slices: new Map(), ...CTX }), "E_SLICE_INCOMPLETE");
  throwsCode(
    () => createSlice({ workItemId: "wi-1", spec: specOf({ contractRefs: [{ ref: "SPECS/a.md" }] }), slices: new Map(), ...CTX }),
    "E_UNPINNED_CONTRACT",
  );
});

test("applySliceAdvance 进入 implementing 要求前驱 done（FR-S07）", () => {
  const a = createSlice({ workItemId: "wi-1", spec: specOf({ sliceId: "a" }), slices: new Map(), ...CTX });
  const slices = new Map([["a", a]]);
  const b = createSlice({
    workItemId: "wi-1",
    spec: specOf({ sliceId: "b", dependsOn: ["a"], writeScope: { exact: ["src/b.js"], subtrees: [], renames: [] } }),
    slices,
    ...CTX,
  });
  slices.set("b", b);
  throwsCode(() => applySliceAdvance(b, "implementing", { slices, ...CTX }), "E_SLICE_BLOCKED");
  a.status = "done";
  applySliceAdvance(b, "implementing", { slices, ...CTX });
  assert.equal(b.status, "implementing");
});

test("applyScopeRevision：既有 Quick/Human Review 标记失效并记入 history（FR-S06）", () => {
  const slice = createSlice({ workItemId: "wi-1", spec: specOf(), slices: new Map(), ...CTX });
  // 模拟后续 slice 填充的证据标记：revision 失效必须清空它们。
  slice.status = "human-reviewed";
  slice.quickReport = { digest: "quick-digest" };
  slice.currentHumanReview = { disposition: "approved", digest: "review-digest" };
  slice.reviewAttempts.push({ disposition: "changes-requested" });
  applyScopeRevision(slice, { exact: ["src/a.js"], subtrees: ["src"], renames: [] }, { slices: new Map(), ...CTX });
  assert.equal(slice.revision, 2);
  assert.equal(slice.status, "ready");
  assert.equal(slice.quickReport, null);
  assert.equal(slice.currentHumanReview, null);
  const entry = slice.history[slice.history.length - 1];
  assert.equal(entry.action, "scope-revised");
  assert.equal(entry.fromStatus, "human-reviewed");
  assert.deepEqual(entry.invalidatedEvidence, ["quick", "humanReview", "reviewAttempts"]);
});

test("applyScopeRevision：done Slice 拒绝修订", () => {
  const slice = createSlice({ workItemId: "wi-1", spec: specOf(), slices: new Map(), ...CTX });
  slice.status = "done";
  throwsCode(
    () => applyScopeRevision(slice, { exact: ["src/b.js"], subtrees: [], renames: [] }, { slices: new Map(), ...CTX }),
    "E_ILLEGAL_SLICE_TRANSITION",
  );
});
