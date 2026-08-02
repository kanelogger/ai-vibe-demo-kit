// risk.mjs — 六轴风险画像与 low allowlist 分类器（PRD 8 / FR-U01–U03）。
// 纯函数、确定性：只消费 Developer 显式声明的事实，不做模型判断（NFR-01）。
// 规则给出最低等级（floor）；Developer 可上调，不可低于 floor。

import { E } from "./errors.mjs";

export const RISK_AXES = ["externalContract", "dataReversibility", "security", "blastRadius", "sharedContract", "runtimeSwitch"];
export const RISK_LEVELS = ["low", "medium", "high"];
// PRD 8.2：low fast path 必须同时满足的 allowlist。
export const LOW_ALLOWLIST = [
  "singleSlice",
  "localScope",
  "noDataMigration",
  "noSecurityChange",
  "noContractBreak",
  "reusesExistingPatterns",
  "singleCommitRevert",
];
// PRD 8.3：任一成立即 high。
export const HIGH_TRIGGERS = [
  "breaksPublicContract",
  "changesSecuritySemantics",
  "irreversibleData",
  "touchesControlPlane",
  "migrationCutover",
  "crossesCoreModules",
];

function parseKeyed(input, knownKeys, kind) {
  const values = {};
  if (input === undefined || input === null) return null;
  for (const pair of String(input).split(",")) {
    const eq = pair.indexOf("=");
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const raw = eq === -1 ? "" : pair.slice(eq + 1);
    if (!knownKeys.includes(key)) {
      throw E.INVALID_RISK_INPUT(`未知${kind}键 ${key}`, `${kind}键必须是：${knownKeys.join(", ")}`);
    }
    values[key] = raw;
  }
  return values;
}

function parseAxes(input) {
  const raw = parseKeyed(input, RISK_AXES, "风险轴");
  if (raw === null) return null;
  const missing = RISK_AXES.filter((axis) => !(axis in raw));
  if (missing.length > 0) {
    throw E.INVALID_RISK_INPUT(`风险轴声明不全，缺少：${missing.join("、")}`, `必须显式声明全部六轴：${RISK_AXES.join(", ")}`);
  }
  const axes = {};
  for (const axis of RISK_AXES) {
    const value = raw[axis];
    if (!RISK_LEVELS.includes(value)) {
      throw E.INVALID_RISK_INPUT(`风险轴 ${axis} 的值 ${value} 非法`, `取值必须是 ${RISK_LEVELS.join("|")}`);
    }
    axes[axis] = value;
  }
  return axes;
}

function parseBooleans(input, knownKeys, kind, defaultValue) {
  const raw = parseKeyed(input, knownKeys, kind);
  const values = {};
  for (const key of knownKeys) {
    const value = raw?.[key];
    if (value === undefined) {
      values[key] = defaultValue;
    } else if (value === "true" || value === "false") {
      values[key] = value === "true";
    } else {
      throw E.INVALID_RISK_INPUT(`${kind} ${key} 的值 ${value} 非法`, "取值必须是 true|false");
    }
  }
  return values;
}

function maxLevel(levels) {
  return levels.reduce((top, level) => (RISK_LEVELS.indexOf(level) > RISK_LEVELS.indexOf(top) ? level : top), "low");
}

/**
 * 分类：任一 high trigger → high；否则取六轴最高级；
 * 有 allowlist disqualifier 或未显式声明六轴时最低 medium。override 只能上调。
 * 全部输入缺省时返回 null（未分类，兼容 Phase A 行为）。
 */
export function classifyRisk({ axes = null, allowlist = null, triggers = null, override = null } = {}) {
  if (axes === null && allowlist === null && triggers === null && override == null) return null;
  const parsedAxes = parseAxes(axes);
  // 严格声明（PRD 8）：未显式声明的轴不默认 low；未声明满足的 allowlist 键一律视为 disqualifier。
  const parsedAllowlist = parseBooleans(allowlist, LOW_ALLOWLIST, "low allowlist", false);
  const parsedTriggers = parseBooleans(triggers, HIGH_TRIGGERS, "high trigger", false);

  const disqualified = LOW_ALLOWLIST.filter((key) => !parsedAllowlist[key]);
  const fired = HIGH_TRIGGERS.filter((key) => parsedTriggers[key]);

  let floor = parsedAxes === null ? "medium" : maxLevel(Object.values(parsedAxes));
  if (disqualified.length > 0) floor = maxLevel([floor, "medium"]);
  if (fired.length > 0) floor = "high";

  if (override != null && !RISK_LEVELS.includes(override)) {
    throw E.INVALID_RISK_INPUT(`--risk-level ${override} 非法`, `取值必须是 ${RISK_LEVELS.join("|")}`);
  }
  if (override != null && RISK_LEVELS.indexOf(override) < RISK_LEVELS.indexOf(floor)) {
    throw E.RISK_BELOW_FLOOR(override, floor);
  }
  const level = override ?? floor;
  return {
    level,
    floor,
    overridden: override != null && override !== floor,
    axes: parsedAxes,
    allowlist: parsedAllowlist,
    disqualified,
    triggers: parsedTriggers,
    fired,
  };
}
