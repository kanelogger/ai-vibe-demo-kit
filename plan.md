---
title: Kit-Test 落地计划：从零到 Agent-friendly PC 后台生成器
slug: kit-test-landing-plan
summary: 把 ref.md 落成一个最小可用的 Agent-friendly PC 后台项目生成器，首版聚焦 CLI 初始化、阶段锁与 SDD 契约。
description: 本计划定义 Kit-Test 第一版目标：通过 `npx <kit> init <project-name>` 生成前后端模板、Agent 规则、阶段文档骨架、`workflow-state.json` 与校验脚本，并在第 6 步后引入“用户确认 + 阶段锁”机制，确保生成项目可验证、可推进、可回查。
---

## Summary

把 [`ref.md`](/Users/kanehua/project/kit-test/ref.md) 落成一个最小可用的 **Agent-friendly PC 后台项目生成器**。第一版目标：`npx <kit> init <project-name>` 能生成前后端模板、项目级 Agent 规则、阶段文档骨架、`workflow-state.json` 和机器校验脚本；第 6 步后所有推进必须受 **“用户确认 + 阶段锁”** 约束。

## Key Changes

* **补齐生成器主链**
  * 新增 `packages/cli`，实现 `init <project-name>`。
  * 从 `templates/pc-admin` 复制模板并替换 `{{projectName}}`。
  * 根目录 `package.json` 的 `cli`、`build`、`typecheck` 脚本必须能跑通。

* **模板内置控制文件**
  * 生成项目必须包含根 `AGENTS.md`。
  * `frontend/AGENTS.md`、`backend/AGENTS.md`。
  * `docs/requirements/draft.md`、`docs/requirements/confirmed.md`。
  * `docs/technical/options.md`、`docs/technical/selected.md`。
  * `docs/execution/ready.md`、`docs/execution/skill-trace.md`。

* **阶段状态接口**
  * 定义 `workflow-state.json`，字段固定为：`stage`、`lastConfirmedDoc`、`selectedBy`、`selectedAt`、`allowedNextStages`。
  * 阶段枚举固定为：`requirements-draft` → `user-confirmed` → `solution-options` → `solution-selected` → `implementation-ready`。

* **阶段门脚本**
  * 根目录和模板都提供同源 `check-stage` / `check-docs`。
  * 校验规则：
    * 缺前置确认文档禁止进入后置阶段。
    * `solution-selected` 起必须有非空 `selectedBy`。
    * `selectedBy: Agent default` 只允许在文档中记录用户明确授权语句。

* **Agent 工作流规则**
  * `AGENTS.md` 写死硬停顿协议：澄清问题发出后停止。
  * 技术方案必须给 3 个方案和推荐理由。
  * 没有用户选择不得写 `docs/technical/selected.md`。
  * 没有 `docs/execution/ready.md` 不得进入实现。

* **技能链落地**
  * 默认链只保留：`requirement-clarification`、`doc-iteration`、`spec-lock`、`solution-options`、`tech-plan-generator`、`api-design`、`shell-implementation`、`tdd`、`webapp-testing`、`code-review`、`documentation`。
  * `workflow-stage-gate` 做成本项目自建 skill，负责解释阶段校验失败原因并要求回到正确阶段。

* **SDD 契约**
  * 前端 SDD 必须声明调用接口、VO 字段、页面入口。
  * 后端 SDD 必须声明 API 路由、请求/响应 JSON、数据库字段。
  * 前端字段名与后端响应字段名必须逐项一致。

## Test Plan

* **CLI smoke**
  * 在临时目录运行 `pnpm build`。
  * 执行 `node packages/cli/dist/index.js init demo-admin`。
  * 确认生成项目包含模板、`docs`、`AGENTS`、`scripts`、`workflow-state.json`。

* **Stage gate**
  * 构造 4 组状态文件验证失败路径：
    1. 无状态文件。
    2. 非法 stage。
    3. 跳过确认文档。
    4. `solution-selected` 缺 `selectedBy`。
  * 再验证完整状态通过。

* **Docs gate**
  * 确认所有必需文档存在且非空。
  * 早期阶段允许后置文档占位，但不允许被当成已确认。

* **Template health**
  * 在生成项目内运行 `pnpm install`、`pnpm typecheck`。
  * 运行 `node scripts/check-base`、`node scripts/check-docs`、`node scripts/check-stage`。

* **Contract test**
  * 用一个样例业务需求生成前后端 SDD。
  * 检查前端接口调用与后端路由、字段名、分页/错误结构一致。

## Assumptions

* 第一版优先做“生成项目 + 阶段门 + Agent 规则 + SDD 契约”，Hook 只预留目录和说明，暂不绑定特定 Agent 运行时。
* 当前模板保留 Vue 前端 + Node 后端结构，不在本轮替换技术栈。
* `skills-list.md` 作为默认技能链来源；不会把 L2/L3 技能全部塞进主流程。
* 推荐落地顺序：
  1. 先补 CLI 和模板控制文件。
  2. 再强化校验脚本。
  3. 最后补自建 `workflow-stage-gate` skill 与样例验收包。
