# Agent 指南

本仓库已接入 AI Native Harness Overlay。Overlay 只管理 Agent 研发装甲层，不规定应用技术栈、源码目录或部署方式；项目事实以 `SPECS/ARCHITECTURE.md` 和 `.harness/config.json` 为准。

## 冷启动顺序

1. 读 `workflow-state.json`，确认当前阶段和允许动作。
2. 读 `HARNESS.md`，理解 Harness 边界和目录职责。
3. 读 `SPECS/ARCHITECTURE.md`，获取真实技术栈、模块位置和风险事实。
4. 读 `.harness/config.json`，获取机器可执行的验证命令和关键用户路径。
5. 按任务读取 `workflow/`、`SPECS/FEATURES/`、`tasks/`、`memory/` 与相关 `rules/`。
6. 需要 Harness 流程帮助时读取 `.agents/skills.json` 中的最小 Skill 路由；外部 Skills 由 `.agents/skills.sources.json` 声明、`scripts/skills-sync.mjs` 在会话开始前同步。

`AGENTS.md` 是索引。技术栈、测试、安全和 Git 细则分别维护在 `SPECS/ARCHITECTURE.md` 与 `rules/` 中，不在这里重复。

## 检查命令

- `node scripts/harness-check.mjs context`：校验冷启动六问所需入口和关键占位符。
- `node scripts/harness-check.mjs gates`：校验阶段状态、文档前置和用户原话证据。
- `node scripts/harness-check.mjs evidence`：校验 Source Register、契约校验入口、验证入口、验证报告、清理和回退。
- `node scripts/harness-check.mjs commit`：实现任务收尾校验——工作区不得遗留未提交改动。
- `node scripts/harness-check.mjs all`：依次运行 context、gates、evidence。
- `node scripts/harness-verify.mjs quick --sprint <path>`：实际执行迭代验证、关键路径和清理并生成报告。
- `node scripts/harness-verify.mjs full --sprint <path>`：生成进入 `accepted` 所需的完整报告。
- `node scripts/harness-stage.mjs status`：查看当前阶段、允许的下一阶段和最近一次放行记录。
- `node scripts/harness-stage.mjs advance --to <stage> --by user --quote "<用户原话>"`：阶段推进的唯一入口。
- `node scripts/skills-sync.mjs`：按 `.agents/skills.sources.json` 同步外部 Skills（会话开始前运行，幂等）。

检查器只读。`harness-stage.mjs` 对候选状态执行完整 preflight，全部通过后才原子更新 `workflow-state.json`；Agent 不得直接编辑状态文件。

## 阶段门禁

```text
initialized
-> requirements-draft
-> requirements-confirmed
-> design-confirmed        （仅 .harness/config.json 中 hasUserInterface 为 true 的项目）
-> solution-options
-> solution-selected
-> implementation-ready
-> accepted
```

- `workflow-state.json` 是唯一机器状态源；`harness-stage.mjs advance` 对候选状态运行完整 preflight，失败时正式状态不变。
- 需求未确认前不得创建方案。
- UI 项目必须先确认可运行原型、原型文件和操作证据；设计问题先更新原型。
- 用户未选定方案前不得创建实现规格或开始编码。
- 未进入 `implementation-ready` 前不得实现功能。
- `harness-verify.mjs full` 实际执行验证、关键路径和清理；通过报告必须仍与当前配置及工作区一致，才允许进入 `accepted`。
- Agent 不得代替用户确认需求、设计、方案或验收；frontmatter、状态记录和 history 必须保存同一份用户原话。

## 上下文闭环

- `workflow/` 保存本轮需求、方案和确认过程，完成后可以归档。
- `SPECS/` 保存长期有效的架构、行为契约和 feature spec，必须随代码演进；`SPECS/API.md` 和 `SPECS/DATABASE.md` 是前后端共享的唯一契约来源，字段一致性由 `commands.contracts` 机器校验。
- `tasks/` 保存当前可执行单元。
- `memory/decisions.md` 保存简单决策，新决策覆盖旧决策时写明谱系；重要决策进入 `memory/adr/`。
- `rules/` 保存按主题加载的工程约束。
- `.agents/` 保存 Harness 专属 Skills、外部 Skill 来源清单和 Hook 适配。

需求、方案、feature spec 和实现计划必须维护 Source Register。记录用户原话、文档、现有代码、设计、测试和日志来源；没有来源时显式写明“无来源”及原因。

## 执行闭环

- 一次只交付一个可独立运行的小切片，并限制主要不确定性。
- 设计问题回设计事实源，规格问题回 `SPECS/`，实现问题回代码。
- 验证方式按风险选择：核心逻辑用单测，真实依赖用集成测试，共享接口用契约测试，关键用户路径用 E2E 或实际操作。
- 迭代中运行 `harness-verify.mjs quick`，验收前运行 `harness-verify.mjs full`；失败后修复并重跑。
- 验证器生成机器报告并回填 Sprint 摘要；补充未覆盖风险和提交哈希，确认清理与回退记录。
- 实现任务以聚焦、可回退的 Git 提交收尾，运行 `node scripts/harness-check.mjs commit` 确认无遗留改动。

## 完成标准

- 实现符合确认后的规格和方案。
- `.harness/config.json` 中与改动相关的验证命令实际运行并通过。
- 关键用户路径实际运行过；无法运行时明确记录缺口和风险。
- 可复用经验写回 `rules/`、`SPECS/` 或 `memory/`。
- 改动范围可独立审查和回退。
