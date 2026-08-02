// transition-cases.mjs — Phase B 四类型的声明式转换表 fixtures（NFR-10 / FR-G03）。
// 期望阶段全部为 PRD 7.4–7.9 的手工字面量，不从 lib/lifecycle.mjs 导入（独立真相源）。
// 每条边一个"允许"用例；每类型至少一个"拒绝 + 修复后通过"用例。

const FEATURE_PATH = [
  "initialized",
  "requirements-draft",
  "requirements-confirmed",
  "design-confirmed",
  "solution-options",
  "solution-selected",
  "implementation-ready",
  "acceptance-ready",
];
const BUGFIX_PATH = [
  "initialized",
  "defect-confirmed",
  "diagnosis-confirmed",
  "solution-selected",
  "implementation-ready",
  "acceptance-ready",
];
const MAINTENANCE_PATH = ["initialized", "scope-confirmed", "solution-selected", "implementation-ready", "acceptance-ready"];
const ROLLBACK_PATH = ["initialized", "planned", "executing", "executed", "verified", "acceptance-ready"];

function startSeed(type) {
  const command = [["migrate-state"], ["start", "--type", type, "--quote", `开始 ${type} 工作`]];
  if (type === "bugfix") command[1].push("--contract-ref", "SPECS/cli/status.md#next-command");
  return command;
}

/** 沿主路径逐边生成"允许"用例：seed 重放到 from，run 推进到 to。 */
function allowCases(type, path) {
  const cases = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const [from, to] = [path[i], path[i + 1]];
    const seed = startSeed(type);
    for (let j = 1; j <= i; j += 1) seed.push(["advance", "--to", path[j]]);
    cases.push({
      name: `${type}: ${from} → ${to} 允许`,
      seed,
      run: ["advance", "--to", to, "--json"],
      expect: { code: 0, json: { from, to } },
    });
  }
  return cases;
}

export const transitionCases = [
  ...allowCases("feature", FEATURE_PATH),
  ...allowCases("bugfix", BUGFIX_PATH),
  ...allowCases("maintenance", MAINTENANCE_PATH),
  ...allowCases("rollback", ROLLBACK_PATH),
  {
    name: "feature: initialized ↛ design-confirmed 拒绝，修复后通过",
    seed: startSeed("feature"),
    run: ["advance", "--to", "design-confirmed"],
    expect: { code: 1, error: "E_ILLEGAL_TRANSITION" },
    fix: ["advance", "--to", "requirements-draft", "--json"],
    expectAfterFix: { code: 0, json: { to: "requirements-draft" } },
  },
  {
    name: "bugfix: defect-confirmed ↛ solution-selected 拒绝，修复后通过",
    seed: [...startSeed("bugfix"), ["advance", "--to", "defect-confirmed"]],
    run: ["advance", "--to", "solution-selected"],
    expect: { code: 1, error: "E_ILLEGAL_TRANSITION" },
    fix: ["advance", "--to", "diagnosis-confirmed", "--json"],
    expectAfterFix: { code: 0, json: { to: "diagnosis-confirmed" } },
  },
  {
    name: "maintenance: initialized ↛ implementation-ready 拒绝，修复后通过",
    seed: startSeed("maintenance"),
    run: ["advance", "--to", "implementation-ready"],
    expect: { code: 1, error: "E_ILLEGAL_TRANSITION" },
    fix: ["advance", "--to", "scope-confirmed", "--json"],
    expectAfterFix: { code: 0, json: { to: "scope-confirmed" } },
  },
  {
    name: "rollback: planned ↛ verified 拒绝，修复后通过",
    seed: [...startSeed("rollback"), ["advance", "--to", "planned"]],
    run: ["advance", "--to", "verified"],
    expect: { code: 1, error: "E_ILLEGAL_TRANSITION" },
    fix: ["advance", "--to", "executing", "--json"],
    expectAfterFix: { code: 0, json: { to: "executing" } },
  },
  {
    name: "feature: accepted 是关闭结果不是阶段，advance 拒绝",
    seed: startSeed("feature"),
    run: ["advance", "--to", "accepted"],
    expect: { code: 1, error: "E_ILLEGAL_TRANSITION" },
  },
];
