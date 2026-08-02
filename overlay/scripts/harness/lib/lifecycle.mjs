// lifecycle.mjs — 六类型主生命周期转移表（ADR-0007 / PRD 7.4–7.10）。
// 纯数据驱动（NFR-10）：表是唯一真相，测试与运行时共用。
// reopen 回退表属于 Phase B 事实层语义，不在本表内。

export const WORK_ITEM_TYPES = ["feature", "bugfix", "maintenance", "optimization", "migration", "rollback"];

export const OUTCOMES = ["accepted", "abandoned", "superseded"];
export const RESULTS = ["changed", "no-change"];

// 各类型唯一主状态机的顺序路径；相邻阶段构成合法前向转移。
export const MAIN_PATH = {
  feature: [
    "initialized",
    "requirements-draft",
    "requirements-confirmed",
    "design-confirmed",
    "solution-options",
    "solution-selected",
    "implementation-ready",
    "acceptance-ready",
  ],
  bugfix: [
    "initialized",
    "defect-confirmed",
    "diagnosis-confirmed",
    "solution-selected",
    "implementation-ready",
    "acceptance-ready",
  ],
  maintenance: ["initialized", "scope-confirmed", "solution-selected", "implementation-ready", "acceptance-ready"],
  optimization: [
    "initialized",
    "objective-confirmed",
    "baseline-established",
    "review-complete",
    "solution-selected",
    "implementation-ready",
    "acceptance-ready",
  ],
  migration: [
    "initialized",
    "planned",
    "expanded",
    "migrating",
    "cutover-ready",
    "contracting",
    "verified",
    "acceptance-ready",
  ],
  rollback: ["initialized", "planned", "executing", "executed", "verified", "acceptance-ready"],
};

// evidence-ready 入口（PRD 7.10）：各类型的事实决策点。
// 证明 Accepted Baseline 已满足目标时进入，不创建空 Slice。
export const EVIDENCE_READY_ENTRY = {
  feature: ["requirements-confirmed", "design-confirmed", "solution-selected"],
  bugfix: ["defect-confirmed", "diagnosis-confirmed", "solution-selected"],
  maintenance: ["scope-confirmed", "solution-selected"],
  optimization: ["review-complete"],
  migration: ["planned", "expanded"],
  rollback: ["planned"],
};

function buildTransitions() {
  const table = {};
  for (const type of WORK_ITEM_TYPES) {
    const edges = new Set();
    const path = MAIN_PATH[type];
    for (let i = 0; i < path.length - 1; i += 1) edges.add(`${path[i]}>${path[i + 1]}`);
    for (const from of EVIDENCE_READY_ENTRY[type]) edges.add(`${from}>evidence-ready`);
    edges.add("evidence-ready>acceptance-ready");
    table[type] = edges;
  }
  return table;
}

const TRANSITIONS = buildTransitions();

/** 所有合法阶段（含 evidence-ready），供校验与 status 展示。 */
export function stagesOf(type) {
  return [...MAIN_PATH[type], "evidence-ready"];
}

export function isLegalTransition(type, from, to) {
  return TRANSITIONS[type]?.has(`${from}>${to}`) === true;
}

/** advance 的合法目标；acceptance-ready 之后只能 close。 */
export function nextStages(type, from) {
  const result = [];
  for (const edge of TRANSITIONS[type] ?? []) {
    const [a, b] = edge.split(">");
    if (a === from) result.push(b);
  }
  return result;
}
