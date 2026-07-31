# Agent 指南

本仓库已接入 AI Native Harness Overlay。Overlay 只管理 Agent 研发装甲层，不规定应用技术栈、源码目录或部署方式；项目事实以 `SPECS/ARCHITECTURE.md` 和 `.harness/config.json` 为准。

## 冷启动顺序

1. 读 `workflow-state.json`，确认当前阶段和允许动作。
2. 读 `HARNESS.md`，理解 Harness 边界和目录职责。
3. 读 `SPECS/ARCHITECTURE.md`，获取真实技术栈、模块位置和风险事实。
4. 读 `.harness/config.json`，获取机器可执行的验证命令和关键用户路径。
5. 按任务读取 `workflow/`、`SPECS/FEATURES/`、`tasks/`、`memory/` 与相关 `rules/`。
6. 需要 Harness 流程帮助时读取 `.agents/skills.json` 中的最小 Skill 路由。

`AGENTS.md` 是索引。技术栈、测试、安全和 Git 细则分别维护在 `SPECS/ARCHITECTURE.md` 与 `rules/` 中，不在这里重复。

## 检查命令

- `node scripts/harness-check.mjs context`：校验冷启动六问所需入口和关键占位符。
- `node scripts/harness-check.mjs gates`：校验阶段状态、文档前置和用户原话证据。
- `node scripts/harness-check.mjs evidence`：校验 Source Register、契约校验入口、验证入口、验证报告、清理和回退。
- `node scripts/harness-check.mjs commit`：实现任务收尾校验——工作区不得遗留未提交改动。
- `node scripts/harness-check.mjs all`：依次运行 context、gates、evidence。
- `node scripts/harness-stage.mjs status`：查看当前阶段、允许的下一阶段和最近一次放行记录。
- `node scripts/harness-stage.mjs advance --to <stage> --by user --quote "<用户原话>"`：阶段推进的唯一入口。

检查器只读，不创建文档、不修改状态、不推进阶段。`harness-stage.mjs` 是 `workflow-state.json` 的唯一写入入口。检查通过不等于应用验收通过。

## 阶段门禁

```text
initialized
-> requirements-draft
-> requirements-confirmed
-> solution-options
-> solution-selected
-> implementation-ready
```

- `workflow-state.json` 是唯一机器状态源；阶段只通过 `harness-stage.mjs advance` 在用户原话证据后放行，Agent 不得手改状态文件或伪造用户原话。
- 需求未确认前不得创建方案。
- 用户未选定方案前不得创建实现规格或开始编码。
- 未进入 `implementation-ready` 前不得实现功能。
- Agent 不得代替用户确认需求或选择方案；每次放行必须记录用户原话、时间和对应文档，形成可审计的 history 证据链。

## 上下文闭环

- `workflow/` 保存本轮需求、方案和确认过程，完成后可以归档。
- `SPECS/` 保存长期有效的架构、行为契约和 feature spec，必须随代码演进；`SPECS/API.md` 和 `SPECS/DATABASE.md` 是前后端共享的唯一契约来源，字段一致性由 `commands.contracts` 机器校验。
- `tasks/` 保存当前可执行单元。
- `memory/decisions.md` 保存简单决策，新决策覆盖旧决策时写明谱系；重要决策进入 `memory/adr/`。
- `rules/` 保存按主题加载的工程约束。
- `.agents/` 保存 Harness 专属 Skills 和 Hook 适配。

需求、方案、feature spec 和实现计划必须维护 Source Register。记录用户原话、文档、现有代码、设计、测试和日志来源；没有来源时显式写明“无来源”及原因。

## 执行闭环

- 一次只交付一个可独立运行的小切片，并限制主要不确定性。
- 设计问题回设计事实源，规格问题回 `SPECS/`，实现问题回代码。
- 验证方式按风险选择：核心逻辑用单测，真实依赖用集成测试，共享接口用契约测试，关键用户路径用 E2E 或实际操作。
- 验证命令以 `.harness/config.json` 登记为准；静态检查和测试输出必须让 Agent 可读取；失败后在当前会话修复并重跑。
- 验证后按 `tasks/` 中的验证报告模板记录命令、结果、时间和未覆盖风险，并清理账户、文件、数据库记录等测试数据。
- 实现任务以一次 Git 提交收尾：只提交当前任务相关文件，运行 `node scripts/harness-check.mjs commit` 确认无遗留改动，并向用户报告提交哈希。

## 完成标准

- 实现符合确认后的规格和方案。
- `.harness/config.json` 中与改动相关的验证命令实际运行并通过。
- 关键用户路径实际运行过；无法运行时明确记录缺口和风险。
- 可复用经验写回 `rules/`、`SPECS/` 或 `memory/`。
- 改动范围可独立审查和回退。
