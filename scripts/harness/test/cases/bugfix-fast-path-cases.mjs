// bugfix-fast-path-cases.mjs — low Bugfix 快路径声明式 fixtures（PRD 7.5、验收场景 2）。
// defect 必须同时引用既有契约与可复现偏差；diagnosis 必须有证据化因果解释；
// 无既有承诺的问题不得按 Bugfix 建立。

import { LOW_RISK, confirmBrief } from "./low-risk.mjs";

const CONTRACT_REF = "SPECS/cli/status.md#next-command";
const FIX_BRIEF = {
  defect: { contractRef: CONTRACT_REF, reproduction: "idle 项目运行 status，输出缺少 nextCommand 行" },
  diagnosis: {
    causality: "status 数据装配只在 active 时派生 nextCommand，idle 分支遗漏",
    evidence: ["cli.mjs 的 idle 分支快照", "复现日志"],
  },
  solution: { summary: "idle 分支统一走同一派生函数", rationale: "消除双路径" },
  slice: {
    primaryUncertainty: "idle 分支派生一致性",
    writeScope: { exact: ["overlay/scripts/harness/cli.mjs"], subtrees: [] },
    acceptanceCriteria: ["idle status 输出 nextCommand"],
  },
  verification: { quick: ["node --test overlay/scripts/harness/test"], full: ["npm test"] },
  rollback: { plan: "单聚焦 commit revert" },
};

const BUGFIX_STAGES = [
  ["initialized", "defect-confirmed"],
  ["defect-confirmed", "diagnosis-confirmed"],
  ["diagnosis-confirmed", "solution-selected"],
  ["solution-selected", "implementation-ready"],
];

function startLowBugfix() {
  return ["start", "--type", "bugfix", "--quote", "修复 idle status 缺少 nextCommand", "--contract-ref", CONTRACT_REF, ...LOW_RISK];
}

const confirm = (brief) => confirmBrief(brief, "确认这份 Fix Brief");

export const bugfixFastPathCases = [
  {
    name: "无既有承诺的问题拒绝按 Bugfix 建立，建议 Feature（场景 2）",
    seed: [["migrate-state"]],
    run: ["start", "--type", "bugfix", "--quote", "希望 status 支持彩色输出", ...LOW_RISK],
    expect: { code: 1, error: "E_DEFECT_NO_CONTRACT" },
    fix: ["start", "--type", "feature", "--quote", "希望 status 支持彩色输出", ...LOW_RISK, "--json"],
    expectAfterFix: { code: 0, json: { type: "feature", stage: "initialized" } },
  },
  {
    name: "low Bugfix：Fix Brief 批量确认 defect+diagnosis+方案后进入 implementation-ready",
    seed: [["migrate-state"], startLowBugfix()],
    run: confirm(FIX_BRIEF),
    expect: {
      code: 0,
      json: {
        stage: "implementation-ready",
        facts: {
          defect: { revision: 1 },
          diagnosis: { revision: 1 },
          solution: { revision: 1 },
          brief: { revision: 1 },
        },
        humanStops: { budget: 3, count: 1 },
      },
      stateFiles: {
        "work-items/{active}/state.json": {
          stage: "implementation-ready",
          history: BUGFIX_STAGES.map(([fromStage, toStage]) => ({ action: "advance", fromStage, toStage })),
        },
        "work-items/{active}/facts/defect/r1.json": { kind: "defect", revision: 1, body: FIX_BRIEF.defect },
        "work-items/{active}/facts/diagnosis/r1.json": { kind: "diagnosis", revision: 1, body: FIX_BRIEF.diagnosis },
      },
    },
  },
  {
    name: "defect 缺可复现偏差：defect-confirmed 被拒绝并说明缺失项",
    seed: [["migrate-state"], startLowBugfix()],
    run: confirm({ ...FIX_BRIEF, defect: { contractRef: CONTRACT_REF } }),
    expect: { code: 1, error: "E_DEFECT_INCOMPLETE" },
  },
  {
    name: "diagnosis 只描述症状无证据：diagnosis-confirmed 被拒绝",
    seed: [["migrate-state"], startLowBugfix()],
    run: confirm({ ...FIX_BRIEF, diagnosis: { causality: "可能是装配问题", evidence: [] } }),
    expect: { code: 1, error: "E_DIAGNOSIS_INCOMPLETE" },
  },
  {
    name: "defect.contractRef 与 start 声明的既有承诺不一致：拒绝",
    seed: [["migrate-state"], startLowBugfix()],
    run: confirm({ ...FIX_BRIEF, defect: { ...FIX_BRIEF.defect, contractRef: "SPECS/other.md#x" } }),
    expect: { code: 1, error: "E_DEFECT_CONTRACT_MISMATCH" },
  },
  {
    name: "重复确认 Fix Brief：拒绝（不可变 revision）",
    seed: [["migrate-state"], startLowBugfix(), confirm(FIX_BRIEF)],
    run: confirm(FIX_BRIEF),
    expect: { code: 1, error: "E_FACT_FROZEN" },
  },
];
