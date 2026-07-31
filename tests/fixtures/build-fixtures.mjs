#!/usr/bin/env node
// build-fixtures.mjs — 从 overlay/ 生成 tests/fixtures/ 下的全部静态夹具。
// 用法: node tests/fixtures/build-fixtures.mjs
// 夹具是生成物但入库保存，便于审查；变更 overlay 后重新运行本脚本。

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const overlayRoot = join(repoRoot, "overlay");
const fixturesRoot = join(repoRoot, "tests", "fixtures");

const CONFIG = {
  version: 1,
  project: {
    name: "fixture-project",
    summary: "A small fixture project used to verify the harness checker.",
    hasUserInterface: false,
  },
  commands: {
    quick: {
      static: ["node --check src/index.js"],
      test: ["node --test tests/"],
    },
    full: {
      static: [],
      test: [],
    },
    contracts: ["node tests/contract/check-contracts.mjs"],
  },
  criticalUserPaths: [],
  recovery: {
    testDataCleanup: ["node scripts/cleanup-test-data.mjs"],
    rollback: ["git revert <commit>"],
  },
};

const STAGES = [
  "initialized",
  "requirements-draft",
  "requirements-confirmed",
  "solution-options",
  "solution-selected",
  "implementation-ready",
];

const NEXT_STAGE = {
  initialized: ["requirements-draft"],
  "requirements-draft": ["requirements-confirmed"],
  "requirements-confirmed": ["solution-options"],
  "solution-options": ["solution-selected"],
  "solution-selected": ["implementation-ready"],
  "implementation-ready": [],
};

function stateFor(stage) {
  const order = STAGES.slice(1, STAGES.indexOf(stage) + 1);
  const docByTarget = {
    "requirements-draft": "workflow/requirements.md",
    "requirements-confirmed": "workflow/requirements.md",
    "solution-options": "workflow/solution-options.md",
    "solution-selected": "workflow/solution-selected.md",
    "implementation-ready": "workflow/implementation-ready.md",
  };
  let previous = "initialized";
  const history = order.map((target, index) => {
    const entry = {
      from: previous,
      to: target,
      advancedBy: "user",
      advancedAt: `2026-07-31T0${index}:00:00Z`,
      quote: `用户原话：放行 ${target}`,
      doc: docByTarget[target],
    };
    previous = target;
    return entry;
  });
  const lastConfirmedDoc =
    STAGES.indexOf(stage) >= STAGES.indexOf("implementation-ready")
      ? "workflow/implementation-ready.md"
      : STAGES.indexOf(stage) >= STAGES.indexOf("requirements-confirmed")
        ? "workflow/requirements.md"
        : null;
  return {
    stage,
    allowedNextStages: NEXT_STAGE[stage],
    currentStageDoc: docByTarget[stage] ?? null,
    lastConfirmedDoc,
    confirmation: null,
    selection: null,
    history,
  };
}

const REQUIREMENTS_DRAFT = `---
status: draft
---
# Requirements

## User Request

> 用户原话

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| User request | 用户提供的一句话需求 | Problem boundary | required |

## Goals

- 示例目标

## Non-Goals

- 示例非目标

## Requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-001 | 示例需求 | 用户原话 |

## Acceptance Criteria

- [ ] 示例验收标准
`;

const REQUIREMENTS_CONFIRMED = REQUIREMENTS_DRAFT.replace("status: draft", `status: confirmed
confirmedBy: user
confirmedAt: 2026-07-31T01:00:00Z
confirmationQuote: 用户原话：需求就按这个做`).replace("> 用户原话", "> 把夹具项目的需求管理起来");

const SOLUTION_OPTIONS = `---
status: proposed
optionIds: [minimal, balanced, robust]
---
# Solution Options

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| User request | workflow/requirements.md | Problem boundary | required |

## Option: minimal

- Goal: 最小方案

## Option: balanced

- Goal: 平衡方案

## Option: robust

- Goal: 稳健方案
`;

const SOLUTION_SELECTED = `---
status: selected
selectionType: option
selectedOptionId: balanced
selectedBy: user
selectedAt: 2026-07-31T03:00:00Z
selectionQuote: 用户原话：选 balanced
---
# Selected Solution

## Decision

采用 balanced 方案。

## Why

风险与成本平衡。

## Superseded Decisions

无

## Risks

- 示例风险
`;

const IMPLEMENTATION_READY = `---
status: ready
confirmedBy: user
confirmedAt: 2026-07-31T04:00:00Z
confirmationQuote: 用户原话：可以开始实现
---
# Implementation Ready

## Runnable Slice

- Outcome: 一个可独立运行的切片
- Primary uncertainty: 示例不确定性
- Non-goals: 示例非目标

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| Selected solution | workflow/solution-selected.md | Implementation boundary | required |

## Implementation Boundary

只改示例模块。

## Verification Plan

- Static checks: commands.quick.static
- Unit / integration / contract checks: commands.quick.test
- Critical user path: 无（非 UI 项目）
- Cleanup: recovery.testDataCleanup
- Rollback: recovery.rollback
`;

const BACKLOG = `# Backlog

| ID | Outcome | Source | Status |
| --- | --- | --- | --- |
| TASK-001 | 示例切片 | \`workflow/requirements.md\` | todo |
`;

const SPRINT = `# Sprint 01

## Goal

- Deliver one independently runnable slice: 示例切片

## Tasks

- [ ] Implement the smallest runnable behavior.

## Verification Report

- Commands: node --check src/index.js; node --test tests/
- Results: pass
- Executed at: 2026-07-31T05:00:00Z
- Manual / user-path evidence: 无 UI 路径
- Uncovered risks: 示例风险
- Cleanup performed: node scripts/cleanup-test-data.mjs
- Rollback steps: git revert <commit>
`;

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fillArchitecture(root) {
  const path = join(root, "SPECS", "ARCHITECTURE.md");
  let content = await readFile(path, "utf8");
  content = content
    .replace("- Product / service:", "- Product / service: Fixture project for harness checker tests")
    .replace("- Primary users:", "- Primary users: Harness maintainers")
    .replace("- Primary outcome:", "- Primary outcome: Deterministic harness check results")
    .replace("| 运行时 |  |  |", "| 运行时 | Node.js 24 | package.json engines |")
    .replace("| 包管理 / 构建工具 |  |  |", "| 包管理 / 构建工具 | npm | package.json |")
    .replace("| 应用框架 |  |  |", "| 应用框架 | 无（纯 Node CLI） | src/index.js |")
    .replace("| 数据 / 外部系统 |  |  |", "| 数据 / 外部系统 | 无 | 无外部依赖 |");
  await writeFile(path, content, "utf8");
}

const API_FILLED = `# API 契约（唯一来源）

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| 既有代码 | src/index.js | Endpoint 清单 | required |

## 基本信息

- Base URL: /api/v1
- 认证方式: Bearer Token
- 错误模型: { error: { code, message } }

## Endpoints

| Method | Path | 请求字段 | 响应字段 | 消费者 |
| --- | --- | --- | --- | --- |
| GET | /items | query: page:number | items: Item[] | src/api/items.ts |

## 变更记录

| 日期 | 变更 | 来源 |
| --- | --- | --- |
| 2026-07-31 | 初始契约 | 既有代码 |
`;

const DATABASE_FILLED = `# 数据库契约（唯一来源）

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| 既有代码 | src/index.js | 表结构 | required |

## 引擎与连接

- 引擎 / 版本: SQLite 3
- Schema 定义位置: db/schema.sql
- 迁移约定: db/migrations/ 顺序执行，禁止回改已发布迁移

## 表结构

| 表 | 字段 | 约束 | 用途 |
| --- | --- | --- | --- |
| items | id INTEGER, name TEXT | PK, NOT NULL | 示例条目 |

## 测试数据

- 种子数据位置: db/seed.sql
- 测试数据清理: 见 \`.harness/config.json\` 的 \`recovery.testDataCleanup\`

## 变更记录

| 日期 | 变更 | 来源 |
| --- | --- | --- |
| 2026-07-31 | 初始契约 | 既有代码 |
`;

async function fillContracts(root) {
  await writeFile(join(root, "SPECS", "API.md"), API_FILLED, "utf8");
  await writeFile(join(root, "SPECS", "DATABASE.md"), DATABASE_FILLED, "utf8");
}

async function makeBase(root) {
  await cp(overlayRoot, root, { recursive: true });
  await writeJson(join(root, ".harness", "config.json"), CONFIG);
  await fillArchitecture(root);
  await fillContracts(root);
}

async function makeStageFixture(stage) {
  const root = join(fixturesRoot, "stages", stage);
  await rm(root, { recursive: true, force: true });
  await makeBase(root);
  await writeJson(join(root, "workflow-state.json"), stateFor(stage));
  const at = (target) => STAGES.indexOf(stage) >= STAGES.indexOf(target);
  if (at("requirements-draft")) {
    await writeFile(join(root, "workflow", "requirements.md"), at("requirements-confirmed") ? REQUIREMENTS_CONFIRMED : REQUIREMENTS_DRAFT, "utf8");
  }
  if (at("requirements-confirmed")) {
    await writeFile(join(root, "tasks", "backlog.md"), BACKLOG, "utf8");
  }
  if (at("solution-options")) {
    await writeFile(join(root, "workflow", "solution-options.md"), SOLUTION_OPTIONS, "utf8");
  }
  if (at("solution-selected")) {
    await writeFile(join(root, "workflow", "solution-selected.md"), SOLUTION_SELECTED, "utf8");
    const decisionsPath = join(root, "memory", "decisions.md");
    const decisions = await readFile(decisionsPath, "utf8");
    await writeFile(
      decisionsPath,
      `${decisions}\n### 2026-07-31 选择 balanced 方案\n- Status: active\n- Decision: 采用 balanced（selectedOptionId: balanced）\n- Reason: 风险与成本平衡\n- Source: 用户原话“选 balanced”，见 workflow/solution-selected.md\n`,
      "utf8",
    );
  }
  if (at("implementation-ready")) {
    await writeFile(join(root, "workflow", "implementation-ready.md"), IMPLEMENTATION_READY, "utf8");
    await writeFile(join(root, "tasks", "sprint-01.md"), SPRINT, "utf8");
  }
}

async function main() {
  // valid-context：完成首次适配、处于 initialized 的合法项目。
  const valid = join(fixturesRoot, "valid-context");
  await rm(valid, { recursive: true, force: true });
  await makeBase(valid);
  await writeJson(join(valid, "workflow-state.json"), stateFor("initialized"));

  // invalid-context：缺少 AGENTS.md、SPECS/ARCHITECTURE.md 和 .harness/config.json。
  const invalid = join(fixturesRoot, "invalid-context");
  await rm(invalid, { recursive: true, force: true });
  await makeBase(invalid);
  await writeJson(join(invalid, "workflow-state.json"), stateFor("initialized"));
  await rm(join(invalid, "AGENTS.md"));
  await rm(join(invalid, "SPECS", "ARCHITECTURE.md"));
  await rm(join(invalid, ".harness", "config.json"));

  // broken-json：config 与 state 均无法解析。
  const broken = join(fixturesRoot, "broken-json");
  await rm(broken, { recursive: true, force: true });
  await makeBase(broken);
  await writeFile(join(broken, ".harness", "config.json"), "{ not json", "utf8");
  await writeFile(join(broken, "workflow-state.json"), "{ also not json", "utf8");

  // stages：六个合法阶段各一份。
  for (const stage of STAGES) {
    await makeStageFixture(stage);
  }

  // evidence 反例夹具。
  // evidence/no-source-register：implementation-ready 阶段但文档缺 Source Register。
  const noRegister = join(fixturesRoot, "evidence", "no-source-register");
  await rm(noRegister, { recursive: true, force: true });
  await cp(join(fixturesRoot, "stages", "implementation-ready"), noRegister, { recursive: true });
  for (const rel of ["workflow/requirements.md", "workflow/solution-options.md", "workflow/implementation-ready.md"]) {
    const path = join(noRegister, rel);
    const content = await readFile(path, "utf8");
    await writeFile(path, content.replace(/^## Source Register\n\n(\|[^\n]*\n)+\n?/m, ""), "utf8");
  }

  // evidence/ui-no-user-paths：声明 UI 但未登记关键用户路径。
  const uiNoPaths = join(fixturesRoot, "evidence", "ui-no-user-paths");
  await rm(uiNoPaths, { recursive: true, force: true });
  await cp(valid, uiNoPaths, { recursive: true });
  const uiConfig = structuredClone(CONFIG);
  uiConfig.project.hasUserInterface = true;
  await writeJson(join(uiNoPaths, ".harness", "config.json"), uiConfig);

  // evidence/no-recovery：未登记清理和回退。
  const noRecovery = join(fixturesRoot, "evidence", "no-recovery");
  await rm(noRecovery, { recursive: true, force: true });
  await cp(valid, noRecovery, { recursive: true });
  const recoveryConfig = structuredClone(CONFIG);
  recoveryConfig.recovery = { testDataCleanup: [], rollback: [] };
  await writeJson(join(noRecovery, ".harness", "config.json"), recoveryConfig);

  // evidence/no-contracts-check：存在唯一契约来源但未登记契约校验命令。
  const noContracts = join(fixturesRoot, "evidence", "no-contracts-check");
  await rm(noContracts, { recursive: true, force: true });
  await cp(valid, noContracts, { recursive: true });
  const contractsConfig = structuredClone(CONFIG);
  contractsConfig.commands.contracts = [];
  await writeJson(join(noContracts, ".harness", "config.json"), contractsConfig);

  // evidence/sprint-no-report：sprint 缺 Verification Report。
  const sprintNoReport = join(fixturesRoot, "evidence", "sprint-no-report");
  await rm(sprintNoReport, { recursive: true, force: true });
  await cp(join(fixturesRoot, "stages", "implementation-ready"), sprintNoReport, { recursive: true });
  const sprintPath = join(sprintNoReport, "tasks", "sprint-01.md");
  const sprint = await readFile(sprintPath, "utf8");
  await writeFile(sprintPath, sprint.replace(/## Verification Report[\s\S]*$/, ""), "utf8");

  // evidence/confirmed-placeholder-quote：需求已确认但正文仍是占位符。
  const placeholderQuote = join(fixturesRoot, "evidence", "confirmed-placeholder-quote");
  await rm(placeholderQuote, { recursive: true, force: true });
  await cp(join(fixturesRoot, "stages", "requirements-confirmed"), placeholderQuote, { recursive: true });
  const reqPath = join(placeholderQuote, "workflow", "requirements.md");
  const req = await readFile(reqPath, "utf8");
  await writeFile(reqPath, req.replace("> 把夹具项目的需求管理起来", "> 用户原话"), "utf8");

  await mkdir(join(fixturesRoot), { recursive: true });
  process.stdout.write("fixtures built\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
