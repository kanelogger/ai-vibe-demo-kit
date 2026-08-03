// skill-routing.test.mjs — v2 Skill routing schema, precedence, and CLI contract.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSkillRouting,
  resolveSkillRoute,
  validateSkillRoutingValue,
} from "../lib/skill-routing.mjs";
import { makeRepo, runCli } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ROUTING = await loadSkillRouting(ROOT);

function routeContext(overrides = {}) {
  return {
    workItemType: "feature",
    stage: "initialized",
    riskLevel: "unclassified",
    hasUserInterface: false,
    hasAutomatedTests: true,
    sliceStatus: null,
    triggers: [],
    ...overrides,
  };
}

async function seedRouting(root, { hasTests = false } = {}) {
  await mkdir(join(root, ".agents"), { recursive: true });
  await writeFile(join(root, ".agents", "skills.json"), `${JSON.stringify(ROUTING, null, 2)}\n`);
  for (const entry of ROUTING.skills) {
    const directory = join(root, ROUTING.skillsRoot, entry.skill);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "SKILL.md"), `---\nname: ${entry.skill}\n---\n`);
  }
  const configPath = join(root, ".harness", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.project = { hasUserInterface: false };
  config.commands = { quick: { test: hasTests ? ["node --test"] : [] }, full: { test: [] } };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

test("六种 Work Item 从 initialized 解析到类型专属 Skill 链", () => {
  const cases = [
    ["feature", "feature.initialized", ["grill-me", "to-spec"]],
    ["bugfix", "bugfix.initialized", ["diagnosing-bugs"]],
    ["maintenance", "maintenance.initialized", ["codebase-design"]],
    ["optimization", "optimization.initialized", ["improve-codebase-architecture"]],
    ["migration", "migration.initialized", ["research", "codebase-design"]],
    ["rollback", "rollback.initialized", ["diagnosing-bugs", "research"]],
  ];
  for (const [workItemType, routeId, skills] of cases) {
    const result = resolveSkillRoute(ROUTING, routeContext({ workItemType }));
    assert.equal(result.route.id, routeId);
    assert.deepEqual(result.nodes.map((node) => node.skill), skills);
  }
});

test("风险、UI、Slice 与 trigger matcher 按声明优先级选择唯一具体路由", () => {
  const cases = [
    [
      { stage: "requirements-draft", riskLevel: "high" },
      "feature.requirements-draft.medium-high",
    ],
    [
      { stage: "requirements-draft", riskLevel: "low" },
      "feature.requirements-draft",
    ],
    [
      { stage: "requirements-confirmed", hasUserInterface: true },
      "feature.requirements-confirmed.ui",
    ],
    [
      { stage: "requirements-confirmed", hasUserInterface: false },
      "feature.requirements-confirmed.non-ui",
    ],
    [
      { stage: "solution-selected", riskLevel: "high" },
      "solution-selected.high",
    ],
    [
      { stage: "implementation-ready", sliceStatus: "runnable" },
      "implementation.runnable",
    ],
    [
      { stage: "implementation-ready", sliceStatus: "runnable", triggers: ["command-failed"] },
      "implementation.command-failed",
    ],
    [
      { stage: "implementation-ready", sliceStatus: "implementing", triggers: ["merge-conflict"] },
      "implementation.merge-conflict",
    ],
  ];
  for (const [overrides, expected] of cases) {
    assert.equal(resolveSkillRoute(ROUTING, routeContext(overrides)).route.id, expected);
  }
});

test("节点按 needs 拓扑排序并注入测试与 UI 策略", () => {
  const result = resolveSkillRoute(
    ROUTING,
    routeContext({
      stage: "requirements-draft",
      riskLevel: "medium",
      hasUserInterface: true,
      hasAutomatedTests: false,
    }),
  );
  assert.deepEqual(result.nodes.map((node) => node.id), ["stress-requirements", "record-decisions", "finalize-spec"]);
  assert.equal(result.policies.requirements.brief.sentences, 3);
  assert.equal(result.policies.testing.state, "missing");
  assert.match(result.policies.testing.directive, /初始化.*自动化测试/);
  assert.equal(result.policies.uiVerification.quick.preferred, "browser-skill");
});

test("同优先级双 trigger 不静默合并", () => {
  assert.throws(
    () =>
      resolveSkillRoute(
        ROUTING,
        routeContext({
          stage: "implementation-ready",
          sliceStatus: "implementing",
          triggers: ["command-failed", "merge-conflict"],
        }),
      ),
    (error) => error.code === "E_SKILL_ROUTE_CONFLICT" && /command-failed|merge-conflict/.test(error.message),
  );
});

test("节点依赖成环在读取控制面时失败", () => {
  const invalid = structuredClone(ROUTING);
  const route = invalid.routing.routes.find((entry) => entry.id === "feature.initialized");
  route.nodes[0].needs = ["draft-spec"];
  assert.throws(
    () => validateSkillRoutingValue(invalid),
    (error) => error.code === "E_SKILL_ROUTING_INVALID" && /环依赖/.test(error.message),
  );
});

test("CLI 在未迁移项目可显式查询，在迁移后默认读取 active Work Item", async () => {
  const root = await makeRepo();
  await seedRouting(root);

  let result = await runCli(root, [
    "skills",
    "route",
    "--type",
    "feature",
    "--stage",
    "requirements-draft",
    "--risk-level",
    "high",
    "--json",
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.route.id, "feature.requirements-draft.medium-high");
  assert.equal(result.json.policies.testing.state, "missing");

  result = await runCli(root, ["skills", "route", "--type", "feature", "--json"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /E_USAGE/);

  result = await runCli(root, ["migrate-state", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(root, ["start", "--type", "maintenance", "--quote", "整理 Harness 路由", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(root, ["skills", "route", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.context.workItemType, "maintenance");
  assert.equal(result.json.route.id, "maintenance.initialized");
});
