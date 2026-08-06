# 项目架构

## 项目身份

- 产品：AI Native Harness Overlay，一个复制进既有 Git 仓库的个人开发控制面。
- 主要用户：单人开发者，以及其使用的 OMP、Codex、Claude Code Agent。
- 主要结果：用最少命令完成任务对齐、局部上下文交付、真实验证和可解释恢复，不引入团队治理实体。
- 非目标：应用脚手架、团队并发、审计平台、自动提交/回滚、跨机器任务续接、遥测、评分、MCP 编排。

## Runtime And Tooling

| 领域 | 事实 | 证据 |
| --- | --- | --- |
| 运行时 | Node.js ESM，只使用内置模块；当前以 Node.js 24 验证 | `scripts/**/*.mjs`、验证结果 |
| 版本控制 | Git CLI；任务状态位于当前 worktree 的 Git 私有目录 | `scripts/harness/lib/git.mjs`、`state.mjs` |
| 测试 | Node 内置 `node:test`，真实临时 Git 仓库 | `scripts/harness/test/` |
| 外部 Skills | Git 锁定同步，无 npm 依赖 | `scripts/skills-sync-core.mjs`、`.agents/skills.lock.json` |
| Overlay 分发 | 从母仓库向目标 Git 根复制固定运行时；拒绝覆盖和 symlink | `scripts/install-overlay-core.mjs` |
| 应用/API/数据库/UI/部署 | 不存在 | `.harness/config.json` 中空 contracts 与 critical paths |

## 模块映射

| 职责 | 位置 | 边界 |
| --- | --- | --- |
| 公共命令解析 | `scripts/harness/cli.mjs` | 只解析参数、输出稳定 JSON/文本和退出码 |
| 生命周期控制 | `scripts/harness/lib/control.mjs` | 唯一状态机；组合 Git、验证、状态和 Context Guard |
| 本地原子状态 | `scripts/harness/lib/state.mjs` | 只读写 `.git/harness/control.json`；短锁、revision、原子 rename |
| Git 事实 | `scripts/harness/lib/git.mjs` | 分支、HEAD/tree、工作区、祖先和变更文件 |
| Quick/Full | `scripts/harness/lib/verification.mjs` | 执行配置命令并生成活动任务内证据 |
| Directory Context | `scripts/harness/lib/context-guard.mjs` | 解析局部索引、DAG 和回执，不拥有生命周期 |
| 平台 Hook | `scripts/harness/adapters/`、`.omp/`、`.codex/`、`.claude/` | 只解析结构化工具输入并调用统一 Guard |
| Skills 同步 | `scripts/skills-sync-core.mjs`、`scripts/skills-sync.mjs` | 独立供应链；固定来源、物化、校验和 Claude 链接 |
| Overlay 安装 | `scripts/install-overlay-core.mjs`、`scripts/install-overlay.mjs` | 单一安装接口；校验目标事实、选择平台、预检全部冲突后复制受管运行时 |

## 持久契约

| 契约 | 位置 | 消费者 |
| --- | --- | --- |
| Harness CLI、阶段和退出码 | `HARNESS.md`、`scripts/harness/cli.mjs` | 人与三个 Agent 平台 |
| 项目配置 schema v2 | `.harness/config.json`、`scripts/harness/lib/context.mjs` | 控制面与验证器 |
| Directory Index schema v1 | `scripts/harness/.harness-index.json`、`context-guard.mjs` | Context Guard |
| 本地控制状态 v1 | `.git/harness/control.json`、`state.mjs` | 当前 worktree 的控制面 |
| Hook 输入输出 | `scripts/harness/adapters/hook-core.mjs` | OMP、Codex、Claude Code Adapter |
| Skills 来源与 lock v2 | `.agents/skills.sources.json`、`.agents/skills.lock.json` | Skills 同步器 |
| Overlay 安装接口与发布清单 | `README.md`、`scripts/install-overlay-core.mjs` | 母仓库维护者与目标项目接入者 |

## 验证与恢复

- Quick 聚焦 reducer/状态/Context Guard，用于实现中反馈。
- Full 运行全部保留的 Harness 用例、安装器契约、平台 Adapter 契约、Claude Skills 链接用例和当前 lock 的真实同步检查。
- 测试全部在临时 Git 仓库运行，不污染项目状态；Full 同时检查候选 HEAD 与工作区前后未漂移。
- 高风险路径是控制面、配置、共享 Agent 指令和三个平台 Adapter；修改后需要两次用户确认。
- 首选恢复是对候选提交执行 `git revert`。`abort` 本身不修改工作区。
- 旧 `refs/heads/harness/state` 保持只读历史；新代码没有读取路径。
