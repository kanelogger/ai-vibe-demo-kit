// maintenance-fast-path-cases.mjs — low Maintenance 快路径声明式 fixtures（PRD 7.6、验收场景 3）。
// scope 必须声明目标、保持不变量、风险画像与回退边界；快路径不生成重复 spec/Slice Markdown。

import { LOW_RISK, confirmBrief } from "./low-risk.mjs";

const MAINTENANCE_BRIEF = {
  scope: {
    goal: "升级 node:test 用法到稳定 API",
    invariants: ["测试数量不变", "CLI 退出码契约不变"],
    riskProfile: "low：局部测试目录，无外部契约变化",
    rollbackBoundary: "单聚焦 commit revert",
  },
  solution: { summary: "逐文件替换废弃 API", rationale: "局部原子重构" },
  slice: {
    primaryUncertainty: "废弃 API 兼容面",
    writeScope: { exact: [], subtrees: ["overlay/scripts/harness/test/"] },
    acceptanceCriteria: ["全部测试通过"],
  },
  verification: { quick: ["node --test overlay/scripts/harness/test"], full: ["npm test"] },
  rollback: { plan: "单聚焦 commit revert" },
};

const MAINTENANCE_STAGES = [
  ["initialized", "scope-confirmed"],
  ["scope-confirmed", "solution-selected"],
  ["solution-selected", "implementation-ready"],
];

function startLowMaintenance(extra = []) {
  return ["start", "--type", "maintenance", "--quote", "升级测试 API 用法", ...LOW_RISK, ...extra];
}

const confirm = (brief) => confirmBrief(brief, "确认这份 Maintenance Brief");

export const maintenanceFastPathCases = [
  {
    name: "low Maintenance：Brief 批量确认 scope+方案后进入 implementation-ready（场景 3）",
    seed: [["migrate-state"], startLowMaintenance()],
    run: confirm(MAINTENANCE_BRIEF),
    expect: {
      code: 0,
      json: {
        stage: "implementation-ready",
        facts: { scope: { revision: 1 }, solution: { revision: 1 }, brief: { revision: 1 } },
        humanStops: { budget: 3, count: 1 },
      },
      stateFiles: {
        "work-items/{active}/state.json": {
          stage: "implementation-ready",
          history: MAINTENANCE_STAGES.map(([fromStage, toStage]) => ({ action: "advance", fromStage, toStage })),
        },
        "work-items/{active}/facts/scope/r1.json": { kind: "scope", revision: 1, body: MAINTENANCE_BRIEF.scope },
      },
    },
  },
  {
    name: "快路径只产生 Brief 与状态记录，不生成重复 spec/Slice Markdown",
    seed: [["migrate-state"], startLowMaintenance(), confirm(MAINTENANCE_BRIEF)],
    run: ["status", "--json"],
    expect: {
      code: 0,
      stateTreeExactly: {
        prefix: "work-items/{active}/",
        files: [
          "work-items/{active}/state.json",
          "work-items/{active}/audit.ndjson",
          "work-items/{active}/facts/brief/r1.json",
          "work-items/{active}/facts/scope/r1.json",
          "work-items/{active}/facts/solution/r1.json",
        ],
      },
    },
  },
  {
    name: "scope 缺保持不变量与回退边界：scope-confirmed 被拒绝并列出缺失项",
    seed: [["migrate-state"], startLowMaintenance()],
    run: confirm({ ...MAINTENANCE_BRIEF, scope: { goal: "升级依赖" } }),
    expect: { code: 1, error: "E_SCOPE_INCOMPLETE" },
  },
  {
    name: "声明改变外部契约的 Maintenance 不留在 low 快路径",
    seed: [
      ["migrate-state"],
      startLowMaintenance([
        "--allowlist",
        "singleSlice=true,localScope=true,noDataMigration=true,noSecurityChange=true,noContractBreak=false,reusesExistingPatterns=true,singleCommitRevert=true",
      ]),
    ],
    run: confirm(MAINTENANCE_BRIEF),
    expect: { code: 1, error: "E_RISK_TOO_HIGH_FOR_BRIEF" },
  },
  {
    name: "重复确认 Maintenance Brief：拒绝（不可变 revision）",
    seed: [["migrate-state"], startLowMaintenance(), confirm(MAINTENANCE_BRIEF)],
    run: confirm(MAINTENANCE_BRIEF),
    expect: { code: 1, error: "E_FACT_FROZEN" },
  },
];
