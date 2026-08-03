// skill-routing.mjs — deterministic Skill routing policy for Harness stages.
// Runtime state remains in stateRef; this module only validates and resolves the
// repository-owned .agents/skills.json control plane.

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { E } from "./errors.mjs";
import { WORK_ITEM_TYPES, stagesOf } from "./lifecycle.mjs";
import { SLICE_STATUSES } from "./slice.mjs";

export const SKILL_ROUTING_PATH = ".agents/skills.json";
export const SKILL_ROUTING_VERSION = 2;
export const ROUTE_MATCH_FIELDS = [
  "workItemTypes",
  "stages",
  "riskLevels",
  "hasUserInterface",
  "sliceStatuses",
  "hasAutomatedTests",
  "triggers",
];

const RISK_LEVELS = ["unclassified", "low", "medium", "high"];
const LEVELS = ["L1", "L2", "L3"];
const RESOURCE_CLASSES = ["reasoning", "design", "implementation", "browser", "deterministic"];
const TOP_LEVEL_KEYS = ["version", "source", "skillsRoot", "skills", "routing", "policies"];
const SKILL_KEYS = ["alias", "skill", "level", "description", "inputs", "outputs"];
const ROUTING_KEYS = ["precedence", "conflict", "routes"];
const ROUTE_KEYS = ["id", "match", "nodes", "completion"];
const NODE_KEYS = ["id", "uses", "needs", "required", "inputs", "outputs", "evidence", "resourceClass"];
const COMPLETION_KEYS = ["artifacts", "evidence", "humanGate"];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ROUTE_ID = /^[a-z0-9][a-z0-9.-]*$/;
const VALIDATED_ROUTING = new WeakSet();

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function validateKeys(record, allowed, label, issues) {
  if (!isRecord(record)) return;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) issues.push(`${label} 含未知字段 ${key}`);
  }
}

function validateString(value, label, issues, { pattern = null } = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${label} 必须是非空字符串`);
    return;
  }
  if (pattern !== null && !pattern.test(value)) issues.push(`${label} 格式非法：${value}`);
}

function validateStringArray(value, label, issues, { required = true, allowed = null } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    issues.push(`${label} 必须是${required ? "非空" : ""}数组`);
    return;
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") {
      issues.push(`${label} 只能包含非空字符串`);
    } else if (allowed !== null && !allowed.includes(entry)) {
      issues.push(`${label} 含非法值 ${entry}`);
    }
  }
}

function safeRelativeDirectory(value) {
  if (typeof value !== "string" || value.trim() === "" || value.startsWith("/") || value.includes("\\")) return false;
  return !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

function allStages() {
  return [...new Set(WORK_ITEM_TYPES.flatMap((type) => stagesOf(type)))];
}

function validateMatch(match, label, issues) {
  if (!isRecord(match)) {
    issues.push(`${label} 必须是对象`);
    return;
  }
  validateKeys(match, ROUTE_MATCH_FIELDS, label, issues);
  if (!own(match, "stages")) issues.push(`${label}.stages 必填，路由不能脱离 Harness 阶段`);
  if (own(match, "workItemTypes")) {
    validateStringArray(match.workItemTypes, `${label}.workItemTypes`, issues, { allowed: WORK_ITEM_TYPES });
  }
  if (own(match, "stages")) validateStringArray(match.stages, `${label}.stages`, issues, { allowed: allStages() });
  if (own(match, "riskLevels")) validateStringArray(match.riskLevels, `${label}.riskLevels`, issues, { allowed: RISK_LEVELS });
  if (own(match, "sliceStatuses")) {
    validateStringArray(match.sliceStatuses, `${label}.sliceStatuses`, issues, { allowed: SLICE_STATUSES });
  }
  if (own(match, "triggers")) validateStringArray(match.triggers, `${label}.triggers`, issues);
  for (const field of ["hasUserInterface", "hasAutomatedTests"]) {
    if (!own(match, field)) continue;
    if (!Array.isArray(match[field]) || match[field].length === 0 || match[field].some((entry) => typeof entry !== "boolean")) {
      issues.push(`${label}.${field} 必须是非空布尔数组`);
    }
  }
  if (Array.isArray(match.workItemTypes) && Array.isArray(match.stages)) {
    for (const type of match.workItemTypes) {
      if (!WORK_ITEM_TYPES.includes(type)) continue;
      for (const stage of match.stages) {
        if (!stagesOf(type).includes(stage)) issues.push(`${label} 把 ${type} 绑定到不属于它的阶段 ${stage}`);
      }
    }
  }
}

function orderedNodes(route) {
  const nodes = route.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, node.needs?.length ?? 0]));
  const dependents = new Map(nodes.map((node) => [node.id, []]));
  for (const node of nodes) {
    for (const dependency of node.needs ?? []) dependents.get(dependency)?.push(node.id);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const result = [];
  while (queue.length > 0) {
    const id = queue.shift();
    result.push(byId.get(id));
    for (const dependent of dependents.get(id) ?? []) {
      const next = indegree.get(dependent) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  return result;
}

function contextValue(context, field) {
  switch (field) {
    case "workItemTypes":
      return context.workItemType;
    case "stages":
      return context.stage;
    case "riskLevels":
      return context.riskLevel;
    case "sliceStatuses":
      return context.sliceStatus;
    default:
      return context[field];
  }
}

function routeMatches(route, context) {
  for (const field of ROUTE_MATCH_FIELDS) {
    if (!own(route.match, field)) continue;
    if (field === "triggers") {
      if (!route.match.triggers.some((trigger) => context.triggers.includes(trigger))) return false;
      continue;
    }
    if (!route.match[field].includes(contextValue(context, field))) return false;
  }
  return true;
}

function precedenceVector(route, precedence) {
  return precedence.map((field) => (own(route.match, field) ? 1 : 0));
}

function compareVectors(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function bestRoutes(config, context) {
  const matching = config.routing.routes.filter((route) => routeMatches(route, context));
  if (matching.length === 0) return [];
  let bestVector = precedenceVector(matching[0], config.routing.precedence);
  let best = [matching[0]];
  for (const route of matching.slice(1)) {
    const vector = precedenceVector(route, config.routing.precedence);
    const comparison = compareVectors(vector, bestVector);
    if (comparison > 0) {
      bestVector = vector;
      best = [route];
    } else if (comparison === 0) {
      best.push(route);
    }
  }
  return best;
}

function coverageContexts(config) {
  const configuredTriggers = [...new Set(config.routing.routes.flatMap((route) => route.match.triggers ?? []))];
  const triggerSets = [[], ...configuredTriggers.map((trigger) => [trigger])];
  const contexts = [];
  for (const workItemType of WORK_ITEM_TYPES) {
    for (const stage of stagesOf(workItemType)) {
      const sliceStatuses = stage === "implementation-ready" ? [null, ...SLICE_STATUSES] : [null];
      for (const riskLevel of RISK_LEVELS) {
        for (const hasUserInterface of [false, true]) {
          for (const hasAutomatedTests of [false, true]) {
            for (const sliceStatus of sliceStatuses) {
              for (const triggers of triggerSets) {
                contexts.push({ workItemType, stage, riskLevel, hasUserInterface, hasAutomatedTests, sliceStatus, triggers });
              }
            }
          }
        }
      }
    }
  }
  return contexts;
}

function contextLabel(context) {
  const suffix = [
    context.riskLevel,
    `ui=${context.hasUserInterface}`,
    `tests=${context.hasAutomatedTests}`,
    context.sliceStatus === null ? null : `slice=${context.sliceStatus}`,
    context.triggers.length === 0 ? null : `trigger=${context.triggers.join(",")}`,
  ].filter(Boolean);
  return `${context.workItemType}/${context.stage} (${suffix.join(", ")})`;
}

export function validateSkillRoutingValue(value) {
  const issues = [];
  if (!isRecord(value)) throw E.SKILL_ROUTING_INVALID("根节点必须是对象");
  if (VALIDATED_ROUTING.has(value)) return value;
  validateKeys(value, TOP_LEVEL_KEYS, "skills.json", issues);
  if (value.version !== SKILL_ROUTING_VERSION) issues.push(`version 必须是 ${SKILL_ROUTING_VERSION}`);
  if (value.source !== undefined) validateString(value.source, "source", issues);
  if (!safeRelativeDirectory(value.skillsRoot)) issues.push("skillsRoot 必须是安全的仓库相对目录");

  const aliases = new Set();
  if (!Array.isArray(value.skills) || value.skills.length === 0) {
    issues.push("skills 必须是非空数组");
  } else {
    value.skills.forEach((skill, index) => {
      const label = `skills[${index}]`;
      if (!isRecord(skill)) {
        issues.push(`${label} 必须是对象`);
        return;
      }
      validateKeys(skill, SKILL_KEYS, label, issues);
      validateString(skill.alias, `${label}.alias`, issues, { pattern: SLUG });
      validateString(skill.skill, `${label}.skill`, issues, { pattern: SLUG });
      if (!LEVELS.includes(skill.level)) issues.push(`${label}.level 必须是 ${LEVELS.join("|")}`);
      validateString(skill.description, `${label}.description`, issues);
      validateStringArray(skill.inputs, `${label}.inputs`, issues, { required: false });
      validateStringArray(skill.outputs, `${label}.outputs`, issues, { required: false });
      if (typeof skill.alias === "string") {
        if (aliases.has(skill.alias)) issues.push(`Skill alias 重复：${skill.alias}`);
        aliases.add(skill.alias);
      }
    });
  }

  if (!isRecord(value.routing)) {
    issues.push("routing 必须是对象");
  } else {
    validateKeys(value.routing, ROUTING_KEYS, "routing", issues);
    if (
      !Array.isArray(value.routing.precedence) ||
      value.routing.precedence.length !== ROUTE_MATCH_FIELDS.length ||
      value.routing.precedence.some((field, index) => field !== ROUTE_MATCH_FIELDS[index])
    ) {
      issues.push(`routing.precedence 必须是 ${JSON.stringify(ROUTE_MATCH_FIELDS)}`);
    }
    if (value.routing.conflict !== "error") issues.push('routing.conflict 必须是 "error"');
    if (!Array.isArray(value.routing.routes) || value.routing.routes.length === 0) {
      issues.push("routing.routes 必须是非空数组");
    } else {
      const routeIds = new Set();
      value.routing.routes.forEach((route, routeIndex) => {
        const label = `routing.routes[${routeIndex}]`;
        if (!isRecord(route)) {
          issues.push(`${label} 必须是对象`);
          return;
        }
        validateKeys(route, ROUTE_KEYS, label, issues);
        validateString(route.id, `${label}.id`, issues, { pattern: ROUTE_ID });
        if (typeof route.id === "string") {
          if (routeIds.has(route.id)) issues.push(`Route id 重复：${route.id}`);
          routeIds.add(route.id);
        }
        validateMatch(route.match, `${label}.match`, issues);
        if (!Array.isArray(route.nodes)) {
          issues.push(`${label}.nodes 必须是数组`);
          return;
        }
        const nodeIds = new Set();
        route.nodes.forEach((node, nodeIndex) => {
          const nodeLabel = `${label}.nodes[${nodeIndex}]`;
          if (!isRecord(node)) {
            issues.push(`${nodeLabel} 必须是对象`);
            return;
          }
          validateKeys(node, NODE_KEYS, nodeLabel, issues);
          validateString(node.id, `${nodeLabel}.id`, issues, { pattern: SLUG });
          validateString(node.uses, `${nodeLabel}.uses`, issues, { pattern: SLUG });
          if (typeof node.id === "string") {
            if (nodeIds.has(node.id)) issues.push(`${label} 的 node id 重复：${node.id}`);
            nodeIds.add(node.id);
          }
          if (typeof node.uses === "string" && !aliases.has(node.uses)) issues.push(`${nodeLabel}.uses 引用未知 alias ${node.uses}`);
          validateStringArray(node.needs ?? [], `${nodeLabel}.needs`, issues, { required: false });
          if (node.required !== undefined && typeof node.required !== "boolean") issues.push(`${nodeLabel}.required 必须是布尔值`);
          for (const field of ["inputs", "outputs", "evidence"]) {
            if (node[field] !== undefined) validateStringArray(node[field], `${nodeLabel}.${field}`, issues, { required: false });
          }
          if (node.resourceClass !== undefined && !RESOURCE_CLASSES.includes(node.resourceClass)) {
            issues.push(`${nodeLabel}.resourceClass 必须是 ${RESOURCE_CLASSES.join("|")}`);
          }
        });
        for (const node of route.nodes) {
          if (!isRecord(node) || !Array.isArray(node.needs)) continue;
          for (const dependency of node.needs) {
            if (!nodeIds.has(dependency)) issues.push(`${label}.${node.id} 依赖未知 node ${dependency}`);
          }
        }
        if (route.nodes.length > 0 && orderedNodes(route).length !== route.nodes.length) issues.push(`${label}.nodes 构成环依赖`);
        if (route.completion !== undefined) {
          if (!isRecord(route.completion)) {
            issues.push(`${label}.completion 必须是对象`);
          } else {
            validateKeys(route.completion, COMPLETION_KEYS, `${label}.completion`, issues);
            for (const field of ["artifacts", "evidence"]) {
              validateStringArray(route.completion[field] ?? [], `${label}.completion.${field}`, issues, { required: false });
            }
            if (route.completion.humanGate !== undefined && route.completion.humanGate !== null) {
              validateString(route.completion.humanGate, `${label}.completion.humanGate`, issues);
            }
          }
        }
      });
    }
  }
  if (!isRecord(value.policies)) issues.push("policies 必须是对象");

  if (issues.length === 0) {
    for (const context of coverageContexts(value)) {
      const routes = bestRoutes(value, context);
      if (routes.length === 0) {
        issues.push(`路由未覆盖 ${contextLabel(context)}`);
        break;
      }
      if (routes.length > 1) {
        issues.push(`同优先级路由冲突 ${contextLabel(context)}：${routes.map((route) => route.id).join(", ")}`);
        break;
      }
    }
  }
  if (issues.length > 0) throw E.SKILL_ROUTING_INVALID(issues.join("；"));
  VALIDATED_ROUTING.add(value);
  return value;
}

export async function loadSkillRouting(root, relativePath = SKILL_ROUTING_PATH) {
  let raw;
  try {
    raw = await readFile(join(root, relativePath), "utf8");
  } catch {
    throw E.SKILL_ROUTING_INVALID(`${relativePath} 不存在或不可读`);
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw E.SKILL_ROUTING_INVALID(`${relativePath} JSON 非法：${error instanceof Error ? error.message : String(error)}`);
  }
  validateSkillRoutingValue(value);
  const missing = [];
  for (const entry of value.skills) {
    const skillDoc = join(root, value.skillsRoot, entry.skill, "SKILL.md");
    try {
      await access(skillDoc);
    } catch {
      missing.push(`${entry.alias} → ${value.skillsRoot}/${entry.skill}/SKILL.md`);
    }
  }
  if (missing.length > 0) throw E.SKILL_ROUTING_INVALID(`路由引用未安装 Skill：${missing.join("，")}`);
  return value;
}

function validateRouteContext(context) {
  if (!WORK_ITEM_TYPES.includes(context.workItemType)) throw E.INVALID_TYPE(context.workItemType);
  if (!stagesOf(context.workItemType).includes(context.stage)) {
    throw E.SKILL_ROUTE_NOT_FOUND(contextLabel(context), `阶段 ${context.stage} 不属于 ${context.workItemType}`);
  }
  if (!RISK_LEVELS.includes(context.riskLevel)) {
    throw E.SKILL_ROUTE_NOT_FOUND(contextLabel(context), `riskLevel 必须是 ${RISK_LEVELS.join("|")}`);
  }
  if (typeof context.hasUserInterface !== "boolean" || typeof context.hasAutomatedTests !== "boolean") {
    throw E.SKILL_ROUTE_NOT_FOUND(contextLabel(context), "hasUserInterface/hasAutomatedTests 必须是布尔值");
  }
  if (context.sliceStatus !== null && !SLICE_STATUSES.includes(context.sliceStatus)) {
    throw E.SKILL_ROUTE_NOT_FOUND(contextLabel(context), `sliceStatus 必须是 ${SLICE_STATUSES.join("|")}`);
  }
  if (!Array.isArray(context.triggers) || context.triggers.some((trigger) => typeof trigger !== "string" || trigger === "")) {
    throw E.SKILL_ROUTE_NOT_FOUND(contextLabel(context), "triggers 必须是非空字符串数组");
  }
}

function resolvedPolicies(policies, context) {
  const testing = policies.testing ?? {};
  return {
    requirements: policies.requirements ?? null,
    testing: {
      state: context.hasAutomatedTests ? "existing" : "missing",
      directive: context.hasAutomatedTests ? testing.existingInfrastructure ?? null : testing.missingInfrastructure ?? null,
    },
    uiVerification: context.hasUserInterface ? policies.uiVerification ?? null : null,
    repairRouting: policies.repairRouting ?? null,
  };
}

export function resolveSkillRoute(config, context) {
  validateSkillRoutingValue(config);
  const normalized = {
    workItemType: context.workItemType,
    stage: context.stage,
    riskLevel: context.riskLevel ?? "unclassified",
    hasUserInterface: context.hasUserInterface === true,
    hasAutomatedTests: context.hasAutomatedTests === true,
    sliceStatus: context.sliceStatus ?? null,
    triggers: [...(context.triggers ?? [])],
  };
  validateRouteContext(normalized);
  const routes = bestRoutes(config, normalized);
  if (routes.length === 0) throw E.SKILL_ROUTE_NOT_FOUND(contextLabel(normalized));
  if (routes.length > 1) throw E.SKILL_ROUTE_CONFLICT(contextLabel(normalized), routes.map((route) => route.id));
  const route = routes[0];
  const catalog = new Map(config.skills.map((entry) => [entry.alias, entry]));
  const nodes = orderedNodes(route).map((node) => {
    const skill = catalog.get(node.uses);
    return {
      ...node,
      required: node.required !== false,
      needs: [...(node.needs ?? [])],
      inputs: [...(node.inputs ?? skill.inputs)],
      outputs: [...(node.outputs ?? skill.outputs)],
      evidence: [...(node.evidence ?? [])],
      skill: skill.skill,
      skillPath: `${config.skillsRoot}/${skill.skill}/SKILL.md`,
    };
  });
  return {
    version: config.version,
    context: normalized,
    route: {
      id: route.id,
      specificity: config.routing.precedence.filter((field) => own(route.match, field)),
      completion: route.completion ?? { artifacts: [], evidence: [], humanGate: null },
    },
    nodes,
    policies: resolvedPolicies(config.policies, normalized),
  };
}
