# Harness Architecture

## 目标

为 Coding Agent 提供可恢复的项目上下文、可组合的执行能力、可审计的阶段状态和明确的人工门禁。

## 模块地图

| Module | Interface | Responsibility | Depends on |
| --- | --- | --- | --- |
| Project manifest | `project.yml` | 声明项目身份、环境、命令和权威入口 | 现有工具配置 |
| Knowledge | `knowledge/INDEX.md`、`knowledge/ROUTING.md` | 提供经过来源和状态管理的长期上下文 | 代码、文档、人工确认 |
| Skills | `skills/<skill>/SKILL.md` | 封装项目自有能力及其输入、输出和权限 | 项目工具链 |
| Workflows | `workflows/*.yml` | 描述阶段依赖、执行者、产物和门禁 | Knowledge、Skills、Schemas |
| Work items | `work/requirements/<id>/status.yml` | 保存单次需求的过程状态、证据和交接 | Workflow definition |
| Rules | `rules/*.md` | 提供按任务加载的主题红线 | 项目政策 |
| Schemas | `schemas/*` | 约束工作流和交接产物的机器接口 | 无 |

## 依赖方向

```text
project.yml
    │
    ├──> knowledge/ ──> 当前代码与外部证据
    ├──> skills/ ─────> 项目工具链
    └──> workflows/ ──> schemas/
              │
              └──> work/requirements/<id>/
```

Workflow 可以引用 Knowledge、Skill 和 Schema。Knowledge 不引用某次需求状态；Skill 不负责推进 Workflow；单次需求产物不得反向成为长期事实，必须经过知识回补流程。

## 关键不变量

- `AGENTS.md` 只做高频规则和导航，不承载全部知识。
- 只有 `project.yml#architecture_memory.code_roots` 下的目录属于代码模块；项目治理目录不因存在文件夹而自动成为代码模块。
- 每个未排除的代码目录都必须包含 `ARCHITECTURE.md`，直接父模块必须登记其子模块。
- 正式知识必须有来源、状态和负责人；推断先进入 `knowledge/candidate/`。
- 每个需求的当前阶段只由其 `status.yml` 表达。
- 人工批准必须保存证据文本、确认人和时间，不能只保存布尔值。
- Workflow 的输出使用 Artifact 契约，避免依赖自由文本猜测完成状态。
- Hooks 用于策略、审计和机器检查；业务步骤属于 Workflow stage。

## 变更指南

- 新增长期事实：先查看 `knowledge/KNOWLEDGE-RULES.md`。
- 新增项目能力：从 `skills/_template/` 创建 Skill。
- 新增执行流程：复制 `workflows/workflow-schema-template.yml` 并删除不用的字段。
- 开始新需求：复制 `work/requirements/_template/`，填写唯一需求 ID。
- 新增代码目录：在同一次变更中创建 `ARCHITECTURE.md`，并更新直接父模块的子模块索引。
- 完成代码需求：更新当前需求的 `architecture-impact.yml`，运行 `commands.architecture_check`，再形成交接。
