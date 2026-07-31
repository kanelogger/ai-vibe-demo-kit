# {{projectName}} Agent 指南

本仓库已安装 ai-vibe-demo-kit。套件只管理 AI 原生研发层，不规定应用技术栈、源码目录或部署方式。

## 冷启动顺序

1. 读 `workflow-state.json`，确认当前阶段和允许动作。
2. 读 `TEMPLATE.md`，理解目录职责和上下文边界。
3. 读 `SPECS/ARCHITECTURE.md`，获取真实技术栈、模块位置和验证命令。
4. 按任务读取 `workflow/`、`SPECS/FEATURES/`、`tasks/`、`memory/` 与相关 `rules/`。
5. 需要选择 Skill 时读取 `.agents/skills.json`。

`AGENTS.md` 是索引。技术栈、测试、安全和 Git 细则分别维护在 `SPECS/ARCHITECTURE.md` 与 `rules/` 中，不在这里重复。

## 命令

- `node scripts/kit.mjs check`：校验控制层和当前阶段。
- `node scripts/kit.mjs next`：输出下一阶段、推荐 Skill 和建议文件。
- `node scripts/kit.mjs skills`：列出 Skill 路由。
- `node scripts/kit.mjs propose --title "..."`：创建需求草稿。
- `node scripts/kit.mjs options --ids a,b,c`：需求确认后创建三个方案。
- `node scripts/kit.mjs sdd <feature-slug>`：方案选定后创建通用 feature spec 与 tasks。
- `node scripts/kit.mjs stage advance <stage> --by user --quote "<用户原话>"`：携带用户证据推进一个阶段。

## 阶段门禁

```text
initialized
-> requirements-draft
-> requirements-confirmed
-> solution-options
-> solution-selected
-> implementation-ready
```

- `workflow-state.json` 是唯一机器状态源，不得手改。
- 需求未确认前不得创建方案。
- 用户未选定方案前不得创建实现规格或开始编码。
- 未进入 `implementation-ready` 前不得实现功能。
- Agent 不得代替用户确认需求或选择方案；明确授权时记录用户原话。

## 上下文闭环

- `workflow/` 保存本轮需求、方案和确认过程。
- `SPECS/` 保存长期有效的架构、行为契约和 feature spec。
- `tasks/` 保存当前可执行单元。
- `memory/decisions.md` 保存简单决策；重要决策进入 `memory/adr/`。
- `rules/` 保存按主题加载的工程约束。
- `.agents/` 保存 Skills、Hooks 和能力路由。

需求、方案、feature spec 和实现计划必须维护 Source Register。记录用户原话、文档、现有代码、设计、测试和日志来源；没有来源时显式写明原因。

## 执行闭环

- 一次只交付一个可独立运行的小切片，并限制主要不确定性。
- 设计问题回设计事实源，规格问题回 `SPECS/`，实现问题回代码。
- 验证方式按风险选择：核心逻辑用单测，真实依赖用集成测试，共享接口用契约测试，关键用户路径用 E2E 或实际操作。
- 静态检查和测试输出必须让 Agent 可读取；失败后在当前会话修复并重跑。
- 验证后记录证据并清理账户、文件、数据库记录等测试数据。

## 完成标准

- 实现符合确认后的规格和方案。
- `SPECS/ARCHITECTURE.md` 中与改动相关的验证命令通过。
- 关键用户路径实际运行过；无法运行时明确记录缺口和风险。
- 可复用经验写回 `rules/`、`SPECS/` 或 `memory/`。
- 改动范围可独立审查和回退。
