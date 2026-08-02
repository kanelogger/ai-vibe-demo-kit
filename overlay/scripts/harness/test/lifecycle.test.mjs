// lifecycle.test.mjs — 表驱动生命周期契约（NFR-10 / FR-G03）。
// 每个类型：允许、拒绝、accepted 不是阶段。

import test from "node:test";
import assert from "node:assert/strict";
import {
  WORK_ITEM_TYPES,
  MAIN_PATH,
  EVIDENCE_READY_ENTRY,
  isLegalTransition,
  nextStages,
  stagesOf,
} from "../lib/lifecycle.mjs";

test("六类型主路径相邻转移合法，跳阶段非法", () => {
  for (const type of WORK_ITEM_TYPES) {
    const path = MAIN_PATH[type];
    for (let i = 0; i < path.length - 1; i += 1) {
      assert.equal(isLegalTransition(type, path[i], path[i + 1]), true, `${type}: ${path[i]} → ${path[i + 1]}`);
    }
    // 跳两步必非法
    if (path.length > 2) {
      assert.equal(isLegalTransition(type, path[0], path[2]), false, `${type}: ${path[0]} → ${path[2]} 必须拒绝`);
    }
    // 回退不由 advance 表提供（reopen 属 Phase B）
    assert.equal(isLegalTransition(type, path[1], path[0]), false, `${type}: ${path[1]} → ${path[0]} 必须拒绝`);
  }
});

test("accepted 不是任何类型的阶段；acceptance-ready 是 advance 终点", () => {
  for (const type of WORK_ITEM_TYPES) {
    assert.equal(stagesOf(type).includes("accepted"), false, `${type} 不得把 accepted 当阶段`);
    assert.deepEqual(nextStages(type, "acceptance-ready"), [], `${type} acceptance-ready 后只能 close`);
    assert.equal(isLegalTransition(type, "acceptance-ready", "accepted"), false);
  }
});

test("evidence-ready 入口与出口符合 PRD 7.10", () => {
  for (const type of WORK_ITEM_TYPES) {
    assert.ok(EVIDENCE_READY_ENTRY[type].length > 0, `${type} 必须有 evidence-ready 决策点`);
    for (const from of EVIDENCE_READY_ENTRY[type]) {
      assert.equal(isLegalTransition(type, from, "evidence-ready"), true, `${type}: ${from} → evidence-ready`);
    }
    assert.equal(isLegalTransition(type, "evidence-ready", "acceptance-ready"), true);
    // evidence-ready 不能跳回实现路径
    assert.equal(isLegalTransition(type, "evidence-ready", "implementation-ready"), false);
  }
  // optimization 的 review-complete 三分支：no-change/structural → evidence-ready，local → solution-selected
  assert.equal(isLegalTransition("optimization", "review-complete", "evidence-ready"), true);
  assert.equal(isLegalTransition("optimization", "review-complete", "solution-selected"), true);
});

test("跨类型阶段不可混用", () => {
  // defect-confirmed 是 bugfix 专属
  assert.equal(isLegalTransition("feature", "initialized", "defect-confirmed"), false);
  assert.equal(isLegalTransition("bugfix", "initialized", "defect-confirmed"), true);
  assert.equal(stagesOf("feature").includes("defect-confirmed"), false);
});
