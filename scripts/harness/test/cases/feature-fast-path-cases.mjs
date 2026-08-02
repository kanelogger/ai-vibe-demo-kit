// feature-fast-path-cases.mjs — low Feature 快路径声明式 fixtures（FR-U04/U05、NFR-13、验收场景 1）。
// Brief 内容、期望阶段序列与停顿预算全部为手工字面量。

import { LOW_RISK, confirmBrief } from "./low-risk.mjs";

const FEATURE_BRIEF = {
  requirements: { goal: "status 输出下一条命令", beneficiary: "developer", scope: "CLI", nonGoals: "不改状态模型" },
  design: { behavior: "status 末尾打印 nextCommand", states: "idle/active", contractScenarios: "idle 时建议 start" },
  solution: { summary: "在 status 数据装配处派生 nextCommand", rationale: "唯一装配点，无第二个真相" },
  spec: { inline: "nextCommand 为允许动作列表的第一个" },
  slice: {
    primaryUncertainty: "展示层派生是否足够",
    writeScope: { exact: ["overlay/scripts/harness/cli.mjs"], subtrees: [] },
    acceptanceCriteria: ["status 输出包含 nextCommand"],
  },
  verification: { quick: ["node --test overlay/scripts/harness/test"], full: ["npm test"] },
  rollback: { plan: "单聚焦 commit revert" },
};

const FEATURE_STAGES = [
  ["initialized", "requirements-draft"],
  ["requirements-draft", "requirements-confirmed"],
  ["requirements-confirmed", "design-confirmed"],
  ["design-confirmed", "solution-options"],
  ["solution-options", "solution-selected"],
  ["solution-selected", "implementation-ready"],
];

function startLowFeature() {
  return ["start", "--type", "feature", "--quote", "给 status 加下一条命令提示", ...LOW_RISK];
}

const confirm = (brief) => confirmBrief(brief, "确认这份 Brief");

export const featureFastPathCases = [
  {
    name: "low Feature：一份 Brief 一次确认后按序进入 implementation-ready（场景 1）",
    seed: [["migrate-state"], startLowFeature()],
    run: confirm(FEATURE_BRIEF),
    expect: {
      code: 0,
      json: {
        stage: "implementation-ready",
        facts: { requirements: { revision: 1 }, design: { revision: 1 }, solution: { revision: 1 }, brief: { revision: 1 } },
        humanStops: { budget: 3, count: 1 },
      },
      stateFiles: {
        "work-items/{active}/state.json": {
          stage: "implementation-ready",
          typeProvisional: false,
          humanStops: { budget: 3, count: 1 },
          history: FEATURE_STAGES.map(([fromStage, toStage]) => ({ action: "advance", fromStage, toStage })),
        },
        "work-items/{active}/facts/requirements/r1.json": {
          kind: "requirements",
          revision: 1,
          body: FEATURE_BRIEF.requirements,
        },
        "work-items/{active}/facts/design/r1.json": { kind: "design", revision: 1, body: FEATURE_BRIEF.design },
        "work-items/{active}/facts/solution/r1.json": { kind: "solution", revision: 1, body: FEATURE_BRIEF.solution },
        "work-items/{active}/facts/brief/r1.json": { kind: "brief", revision: 1, body: FEATURE_BRIEF },
      },
    },
  },
  {
    name: "Brief 缺段：整体拒绝且不留半推进状态（原子写入）",
    seed: [["migrate-state"], startLowFeature()],
    run: confirm({ requirements: FEATURE_BRIEF.requirements, design: FEATURE_BRIEF.design }),
    expect: {
      code: 1,
      error: "E_BRIEF_INCOMPLETE",
      stateFiles: {
        "work-items/{active}/state.json": { stage: "initialized", history: [] },
      },
      noStateFiles: [
        "work-items/{active}/facts/requirements/r1.json",
        "work-items/{active}/facts/design/r1.json",
        "work-items/{active}/facts/brief/r1.json",
      ],
    },
    fix: confirm(FEATURE_BRIEF),
    expectAfterFix: { code: 0, json: { stage: "implementation-ready" } },
  },
  {
    name: "空壳 Brief（所有段为空对象）：拒绝冻结空事实",
    seed: [["migrate-state"], startLowFeature()],
    run: confirm({
      requirements: {},
      design: {},
      solution: {},
      spec: {},
      slice: {},
      verification: {},
      rollback: {},
    }),
    expect: {
      code: 1,
      error: "E_BRIEF_INCOMPLETE",
      stateFiles: { "work-items/{active}/state.json": { stage: "initialized", history: [] } },
    },
    fix: confirm(FEATURE_BRIEF),
    expectAfterFix: { code: 0, json: { stage: "implementation-ready" } },
  },
  {
    name: "非 low（medium）Feature 无法使用 Brief 批量确认",
    seed: [["migrate-state"], [...startLowFeature(), "--risk-level", "medium"]],
    run: confirm(FEATURE_BRIEF),
    expect: { code: 1, error: "E_RISK_TOO_HIGH_FOR_BRIEF" },
  },
  {
    name: "重复确认已冻结事实：拒绝（不可变 revision）",
    seed: [["migrate-state"], startLowFeature(), confirm(FEATURE_BRIEF)],
    run: confirm(FEATURE_BRIEF),
    expect: { code: 1, error: "E_FACT_FROZEN" },
  },
  {
    name: "非快路径类型（rollback）不可 Brief 确认",
    seed: [["migrate-state"], ["start", "--type", "rollback", "--quote", "回退某工作项", ...LOW_RISK]],
    run: confirm(FEATURE_BRIEF),
    expect: { code: 1, error: "E_BRIEF_NOT_ALLOWED" },
  },
  {
    name: "人工停顿计数：Phase B 可记录的两次停顿（Brief 确认+最终验收）≤ 预算 3，确定性命令不计数（NFR-13；实测停顿由 Phase C Review Session 记录）",
    seed: [
      ["migrate-state"],
      startLowFeature(),
      confirm(FEATURE_BRIEF),
      ["status", "--json"],
      ["advance", "--to", "acceptance-ready"],
    ],
    run: ["close", "--outcome", "accepted", "--result", "changed", "--quote", "实测通过，验收", "--json"],
    expect: {
      code: 0,
      stateFiles: {
        "work-items/{active}/state.json": { humanStops: { budget: 3, count: 2 } },
      },
    },
  },
];
