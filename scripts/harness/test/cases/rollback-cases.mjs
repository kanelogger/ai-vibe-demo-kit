// rollback-cases.mjs — Rollback 生命周期与级联 inverse 声明式 fixtures（PRD 7.9/11.7、FR-B01–B03、场景 17）。
// 级联顺序与集合期望全部为手工字面量；{A}/{B}/{C} 是种子阶段捕获的 workItemId 变量。

/** start → close(accepted) 建一项 accepted lineage；as 捕获其 id。 */
function acceptedItem(as, quote) {
  return [
    { cmd: ["start", "--type", "feature", "--quote", quote, "--json"], as },
    ["close", "--outcome", "accepted", "--result", "changed", "--quote", "实测通过，验收"],
  ];
}

export const rollbackCases = [
  {
    name: "回退最新 accepted 项：inverse 集合恰好等于该项自身（FR-B02）",
    seed: [["migrate-state"], ...acceptedItem("A", "功能 A"), ...acceptedItem("B", "功能 B")],
    run: ["rollback", "{B}", "--quote", "回退功能 B", "--json"],
    expect: {
      code: 0,
      json: { target: "{B}", cascade: ["{B}"], stage: "planned", suspendedWorkItemId: null },
      stateFiles: {
        "work-items/{active}/state.json": {
          type: "rollback",
          stage: "planned",
          relations: { rollbackOf: ["{B}"] },
        },
        "work-items/{active}/facts/rollbackPlan/r1.json": {
          kind: "rollbackPlan",
          revision: 1,
          body: { target: "{B}", cascade: ["{B}"], atomicSlice: { count: 1 } },
        },
      },
    },
  },
  {
    name: "历史 Rollback：目标 A 后有 B/C，生成 C→B→A 逆序级联（场景 17）",
    seed: [["migrate-state"], ...acceptedItem("A", "功能 A"), ...acceptedItem("B", "功能 B"), ...acceptedItem("C", "功能 C")],
    run: ["rollback", "{A}", "--quote", "回退功能 A", "--json"],
    expect: {
      code: 0,
      json: { target: "{A}", cascade: ["{C}", "{B}", "{A}"], stage: "planned" },
      stateFiles: {
        // 被回退历史项 namespace 保持不可变（FR-G08）
        "work-items/{A}/state.json": { status: "closed", outcome: "accepted", result: "changed" },
        "work-items/{B}/state.json": { status: "closed", outcome: "accepted", result: "changed" },
      },
    },
  },
  {
    name: "有下游后继时拒绝单独 revert 目标项，说明级联原因（FR-S09）",
    seed: [["migrate-state"], ...acceptedItem("A", "功能 A"), ...acceptedItem("B", "功能 B"), ...acceptedItem("C", "功能 C")],
    run: ["rollback", "{A}", "--only", "--quote", "只回退功能 A"],
    expect: { code: 1, error: "E_ROLLBACK_REQUIRES_CASCADE" },
    fix: ["rollback", "{A}", "--quote", "回退功能 A 及其后继", "--json"],
    expectAfterFix: { code: 0, json: { cascade: ["{C}", "{B}", "{A}"] } },
  },
  {
    name: "目标不在 accepted lineage：拒绝（FR-B01，不接受未验收或虚构目标）",
    seed: [["migrate-state"], ...acceptedItem("A", "功能 A")],
    run: ["rollback", "wi-19990101-ffffffff", "--quote", "回退不存在的项"],
    expect: { code: 1, error: "E_ROLLBACK_TARGET_NOT_ACCEPTED" },
  },
  {
    name: "有 active 项时发起 rollback：原子 suspend 当前项再 start（11.7）",
    seed: [
      ["migrate-state"],
      ...acceptedItem("A", "功能 A"),
      { cmd: ["start", "--type", "feature", "--quote", "进行中的功能 D", "--json"], as: "D" },
    ],
    run: ["rollback", "{A}", "--quote", "回退功能 A", "--json"],
    expect: {
      code: 0,
      json: { suspendedWorkItemId: "{D}", stage: "planned" },
      stateFiles: {
        "registry.json": { suspendedWorkItemIds: ["{D}"] },
        "work-items/{D}/state.json": { status: "suspended" },
        "work-items/{active}/state.json": { type: "rollback", stage: "planned" },
      },
    },
  },
  {
    name: "Rollback 计划产出单个原子 Rollback Slice，不要求实测中间状态（FR-B03）",
    seed: [["migrate-state"], ...acceptedItem("A", "功能 A"), ...acceptedItem("B", "功能 B")],
    run: ["rollback", "{A}", "--quote", "回退功能 A", "--json"],
    expect: {
      code: 0,
      stateFiles: {
        "work-items/{active}/facts/rollbackPlan/r1.json": {
          body: { atomicSlice: { count: 1, applies: ["{B}", "{A}"], order: "reverse-accepted-lineage" } },
        },
      },
    },
  },
];
