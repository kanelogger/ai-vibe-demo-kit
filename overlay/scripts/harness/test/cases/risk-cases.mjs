// risk-cases.mjs — 六轴风险画像、low allowlist 与 high triggers 的声明式 fixtures（FR-U01/U02/U03）。
// 期望等级全部为手工字面量；disqualifier/trigger 清单是 PRD 8.2/8.3 的逐项展开。

const ALL_LOW_AXES =
  "externalContract=low,dataReversibility=low,security=low,blastRadius=low,sharedContract=low,runtimeSwitch=low";
const FULL_ALLOWLIST =
  "singleSlice=true,localScope=true,noDataMigration=true,noSecurityChange=true,noContractBreak=true,reusesExistingPatterns=true,singleCommitRevert=true";
const NO_TRIGGERS =
  "breaksPublicContract=false,changesSecuritySemantics=false,irreversibleData=false,touchesControlPlane=false,migrationCutover=false,crossesCoreModules=false";

// PRD 8.2：low allowlist 七条，任一不满足即至少 medium。
const ALLOWLIST_KEYS = [
  "singleSlice",
  "localScope",
  "noDataMigration",
  "noSecurityChange",
  "noContractBreak",
  "reusesExistingPatterns",
  "singleCommitRevert",
];
// PRD 8.3：high triggers 六条，任一成立即 high。
const TRIGGER_KEYS = [
  "breaksPublicContract",
  "changesSecuritySemantics",
  "irreversibleData",
  "touchesControlPlane",
  "migrationCutover",
  "crossesCoreModules",
];

function startWithRisk(extra) {
  return ["start", "--type", "feature", "--quote", "做一个低风险改动", "--axes", ALL_LOW_AXES, "--allowlist", FULL_ALLOWLIST, "--triggers", NO_TRIGGERS, ...extra, "--json"];
}

const disqualifierCases = ALLOWLIST_KEYS.map((key) => ({
  name: `low allowlist: ${key}=false → 至少 medium`,
  seed: [["migrate-state"]],
  run: startWithRisk(["--allowlist", FULL_ALLOWLIST.replace(`${key}=true`, `${key}=false`)]),
  expect: { code: 0, json: { risk: { level: "medium", floor: "medium", disqualified: [key] } } },
}));

const triggerCases = TRIGGER_KEYS.map((key) => ({
  name: `high trigger: ${key}=true → 强制 high`,
  seed: [["migrate-state"]],
  run: startWithRisk(["--triggers", NO_TRIGGERS.replace(`${key}=false`, `${key}=true`)]),
  expect: { code: 0, json: { risk: { level: "high", floor: "high", fired: [key] } } },
}));

export const riskCases = [
  {
    name: "六轴全 low + allowlist 全满足 → low（floor=low）",
    seed: [["migrate-state"]],
    run: startWithRisk([]),
    expect: { code: 0, json: { risk: { level: "low", floor: "low", disqualified: [], fired: [] } } },
  },
  {
    name: "相同输入再次分类得到相同最低等级（确定性，FR-U01）",
    seed: [["migrate-state"]],
    run: startWithRisk([]),
    expect: { code: 0, json: { risk: { level: "low", floor: "low", disqualified: [], fired: [] } } },
  },
  {
    name: "单轴 medium → 整体 medium（取最高轴）",
    seed: [["migrate-state"]],
    run: startWithRisk(["--axes", ALL_LOW_AXES.replace("blastRadius=low", "blastRadius=medium")]),
    expect: { code: 0, json: { risk: { level: "medium", floor: "medium" } } },
  },
  {
    name: "单轴 high → 整体 high，即使 allowlist 全满足",
    seed: [["migrate-state"]],
    run: startWithRisk(["--axes", ALL_LOW_AXES.replace("security=low", "security=high")]),
    expect: { code: 0, json: { risk: { level: "high", floor: "high" } } },
  },
  ...disqualifierCases,
  ...triggerCases,
  {
    name: "未显式声明 allowlist 不默认满足：全部七键记为 disqualifier → 至少 medium（严格 allowlist）",
    seed: [["migrate-state"]],
    run: [
      "start", "--type", "feature", "--quote", "做一个改动", "--axes", ALL_LOW_AXES, "--triggers", NO_TRIGGERS, "--json",
    ],
    expect: { code: 0, json: { risk: { level: "medium", floor: "medium", disqualified: ALLOWLIST_KEYS } } },
  },
  {
    name: "Developer 上调风险：floor low → level medium（允许）",
    seed: [["migrate-state"]],
    run: startWithRisk(["--risk-level", "medium"]),
    expect: { code: 0, json: { risk: { level: "medium", floor: "low", overridden: true } } },
  },
  {
    name: "Developer 下调至规则下限以下：拒绝，修正后通过",
    seed: [["migrate-state"]],
    run: startWithRisk(["--triggers", NO_TRIGGERS.replace("touchesControlPlane=false", "touchesControlPlane=true"), "--risk-level", "low"]),
    expect: { code: 1, error: "E_RISK_BELOW_FLOOR" },
    fix: startWithRisk(["--triggers", NO_TRIGGERS.replace("touchesControlPlane=false", "touchesControlPlane=true"), "--risk-level", "high"]),
    expectAfterFix: { code: 0, json: { risk: { level: "high", floor: "high" } } },
  },
  {
    name: "风险结论写入工作项事实，status 可读取（单一事实源）",
    seed: [["migrate-state"], startWithRisk(["--risk-level", "medium"]).slice(0, -1)],
    run: ["status", "--json"],
    expect: { code: 0, json: { active: { risk: { level: "medium", floor: "low" } } } },
  },
  {
    name: "风险轴声明不全（只声明五轴）：用法错误，不默认补齐 low",
    seed: [["migrate-state"]],
    run: startWithRisk(["--axes", "externalContract=low,dataReversibility=low,security=low,blastRadius=low,sharedContract=low"]),
    expect: { code: 2, error: "E_INVALID_RISK_INPUT" },
  },
  {
    name: "未知风险轴名 → 用法错误",
    seed: [["migrate-state"]],
    run: startWithRisk(["--axes", `${ALL_LOW_AXES},unknownAxis=low`]),
    expect: { code: 2, error: "E_INVALID_RISK_INPUT" },
  },
  {
    name: "非法风险等级值 → 用法错误",
    seed: [["migrate-state"]],
    run: startWithRisk(["--axes", ALL_LOW_AXES.replace("security=low", "security=critical")]),
    expect: { code: 2, error: "E_INVALID_RISK_INPUT" },
  },
];
