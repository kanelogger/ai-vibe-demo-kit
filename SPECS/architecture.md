# 项目架构

接入 Harness 后，先用仓库证据填写本文件。未知信息写“待确认”，不要猜测。机器可执行命令登记在 `.harness/config.json`，本文件只解释命令的适用条件，不复制命令全文。

## 项目身份

- Product / service: AI Native Harness Overlay，可复制到既有 Git 仓库的 Agent 研发控制层。
- Primary users: 维护具体软件项目的工程团队，以及在仓库内执行工作的 AI coding agents。
- Primary outcome: Agent 能从仓库恢复事实、遵守人工放行和 Slice 门禁、运行真实验证并留下可审计恢复证据。

## Runtime And Tooling

| 领域 | 技术 / 版本 | 证据 |
| --- | --- | --- |
| 运行时 | Node.js，版本未在仓库固定；源码使用 ESM `.mjs` 与 Node 内置模块 | `scripts/**/*.mjs` |
| 包管理 / 构建工具 | 无包管理和构建步骤；Overlay 以可直接执行的脚本交付 | 根目录无 package manifest；`.harness/config.json` 直接运行 `node` |
| 应用框架 | 无应用框架；CLI、状态机和检查器使用 Node 标准库 | `scripts/harness/cli.mjs`、`scripts/harness-check.mjs` |
| 数据 / 外部系统 | Git refs/commits、仓库内 JSON/Markdown、可选 MCP 声明 | `scripts/harness/lib/state-store.mjs`、`.agents/mcp.json` |

## 模块映射

| 职责 | 位置 | 所需上下文 |
| --- | --- | --- |
| 冷启动与流程索引 | `AGENTS.md`、`HARNESS.md`、`workflow/`、`SPECS/`、`tasks/`、`rules/` | `workflow-state.json`、`.harness/config.json` 与当前阶段文档 |
| v1 阶段、验证与报告门禁 | `scripts/harness-check.mjs`、`scripts/harness-stage.mjs`、`scripts/harness-verify.mjs` | `workflow-state.json`、Sprint、验证配置和用户原话 |
| v2 Work Item 与 Slice 控制面 | `scripts/harness/cli.mjs`、`scripts/harness/lib/` | stateRef registry、Work Item、Slice、Quick 与生命周期契约 |
| Skill 来源、同步与路由 | `.agents/`、`scripts/skills-sync*.mjs`、`scripts/harness/lib/skill-routing.mjs` | source/lock/catalog 与 active Work Item 上下文 |
| 平台 Hook 适配 | `.agents/hooks/` | 只调用 Harness 唯一检查或门禁入口，不复制领域规则 |
| 目录上下文与写前门禁 | `scripts/harness/lib/context-guard.mjs`、`scripts/harness/cli.mjs`、`.agents/hooks/guard-write-context.mjs` | `.harness/config.json` 的 Code Roots、祖先 `.harness-index.json`、Git 私有 Context Receipt |
| 自动化验证 | `scripts/harness/test/` | Node `node:test`、隔离临时 Git 仓库与表驱动 fixtures |

## 持久契约

| 契约 | 位置 | 消费者 |
| --- | --- | --- |
| 项目机器配置 | `.harness/config.json` | 检查器、验证器、v2 context resolver |
| v1 阶段状态 | `workflow-state.json` | `harness-stage.mjs` 与门禁检查器 |
| v2 状态拓扑 | `refs/heads/harness/state` 下的 registry / Work Item / Slice JSON | `scripts/harness/cli.mjs` |
| Skill catalog 与路由 | `.agents/skills.json` | Skill resolver 与 Agent 会话 |
| 目录上下文索引 | 各 Code Root 及子目录的 `.harness-index.json` | Context Guard、`harness-check context`、平台写前 Hook |

## 验证命令

机器命令的唯一登记处是 `.harness/config.json`（`commands.quick` 与 `commands.full`）。在此说明各命令的适用条件和预期证据：

| 用途 | 配置项 | 使用时机 | 预期证据 |
| --- | --- | --- | --- |
| 静态检查 | `commands.*.static` | 修改 Harness JavaScript 后 | 相关 `.mjs` 通过 `node --check` |
| 测试 | `commands.*.test` | 修改领域行为、CLI 或检查器后 | `node:test` 覆盖的行为与错误契约通过 |
| 关键用户路径 | `criticalUserPaths[]` | 配置了真实项目路径时 | 命令输出、退出码或人工证据可审计 |

## 风险与恢复

- 敏感资产：目标分支、`refs/heads/harness/state`、工作流状态、验证报告和 Skill lock。
- 破坏性操作：状态迁移、阶段推进、Work Item 事务、rollback 与受管 Skill 物化；只能走对应 CLI。
- 回退 / 恢复路径：机器入口见 `.harness/config.json` 的 `recovery`；实现任务使用 Sprint 记录的聚焦提交执行 `git revert`。
- 测试数据清理：Node 测试在隔离临时 Git 仓库运行，不创建共享测试数据；机器声明见 `.harness/config.json` 的 `recovery.testDataCleanup`。
