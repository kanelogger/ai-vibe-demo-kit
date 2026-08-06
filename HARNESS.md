# Harness Overlay

这是一个给单人项目使用的仓库内控制面。核心原则：判断交给模型，确定性约束交给脚本，真实运行定义完成；只有出现独立失败模式、独立回退点和真实需求时才新增实体。

## 控制模型

唯一深模块是 `scripts/harness/lib/control.mjs`，状态路径固定为 Git 私有目录中的 `.git/harness/control.json`：

```text
idle -> alignment -> implementation -> acceptance -> idle
          |                |               |
          +------------- abort ------------+
```

- 普通任务由 `align` 原子进入 `implementation`，Full 通过后自动回到 `idle`。
- 显式高风险任务停在 `alignment` 等待 digest 确认；普通任务触及 `risk.highRiskPaths` 时也会升级。
- 高风险候选 Full 通过后停在 `acceptance`，新的 digest 必须由用户原话确认。
- 本地状态顶层只有版本/revision、`active` 和 `last`。写入使用短期 lock、revision 检查和同目录原子 rename。
- 旧 `refs/heads/harness/state` 及其账本只作为 Git 历史存在；稳态代码不读取、不迁移、不删除它。

## 验证语义

`.harness/config.json` 是项目机器事实的唯一入口。

- Quick 执行 `commands.quick`，允许脏工作区，报告绑定配置、命令计划和当前工作区内容。
- Full 执行 `commands.full`、`commands.contracts`、`criticalUserPaths` 和清理命令，只接受干净且已提交的候选。
- 验证前后工作区内容、候选 HEAD、配置或命令计划变化都会令证据失败或失效。
- 报告只保存在当前活动状态中，不创建报告树、审计账本或 Git stateRef 事务。
- `finish` 不提交、不回滚、不推送；恢复动作由人根据 `abort` 或失败输出执行。

稳定错误族：`E_USAGE`、`E_STATE`、`E_ACTIVE/E_IDLE`、`E_PHASE`、`E_CONFIRM_REQUIRED/E_CONFIRM_STALE`、`E_GIT_DIRTY/E_GIT_DRIFT`、`E_CONTEXT_BLOCKED`、`E_VERIFY_FAILED/E_VERIFY_STALE`。

## Directory Context Guard

只有 `contextIndex.codeRoots` 中的目标会触发 Guard。每个受管根必须有 `.harness-index.json`；从根到目标目录依次累加默认前置和精确文件前置，传递依赖必须是 DAG。

首次调用会完整输出索引摘要和依赖内容，随后把回执写入 `control.json#active.contextReceipts` 并阻断写入。同一任务 revision、session、target 和 resolution digest 全部一致时，第二次调用才放行。索引或任一依赖漂移后重新交付并阻断。

目标、索引和依赖拒绝 symlink、Git 私有路径、二进制、越界、目录和超限文件。

## 平台适配

共享事实只有根 `AGENTS.md`、`.agents/skills/`、`.harness/config.json`、目录索引和统一 CLI。Adapter 只把平台事件转换为 `{cwd, session_id, tool_name, tool_input}`，不保存状态或复制风险与验证规则。

| 平台 | 共享指令/Skills | 写前 Adapter |
| --- | --- | --- |
| OMP | 原生读取 `AGENTS.md`、`.agents/skills` | `.omp/extensions/harness-context-guard.js` |
| Codex | 原生读取 `AGENTS.md`、`.agents/skills` | `.codex/hooks.json` -> `pre-tool-use.mjs` |
| Claude Code | `CLAUDE.md` 导入 `AGENTS.md`；同步生成 `.claude/skills/*` 链接 | `.claude/settings.json` -> `pre-tool-use.mjs` |

Hook 只处理 `apply_patch`、Write/Edit/NotebookEdit 和 OMP 对应的结构化写工具。Bash/Shell 没有可靠目标路径，不宣称硬拦截。

## Skills 供应链

`scripts/skills-sync.mjs` 与任务生命周期解耦。默认按 `.agents/skills.lock.json` 恢复固定 SHA；只有 `--update` 解析上游 track 并改 lock。同步成功后，它为 `.agents/skills` 中实际带 `SKILL.md` 的逐项目录创建未跟踪的 `.claude/skills` 相对链接，只删除自己生成且已过期的链接，不覆盖其他条目。

平台依据 Skill 名称和描述按需选择，不再维护 `.agents/skills.json` 路由、阶段 matcher 或 resolver。

## 配置边界

v2 配置只含：`project`、`contextIndex`、`risk.highRiskPaths`、`commands`、`criticalUserPaths`、`verification.commandTimeoutMs` 和 `recovery`。本项目没有 API、数据库、UI、部署或外部系统关键路径，对应命令和路径保持空数组，不创建占位契约。

日常只需要：

```sh
node scripts/harness/cli.mjs status --json
node scripts/harness/cli.mjs align --intent "..." --done-when "..."
# 修改；可选 check；由用户提交候选
node scripts/harness/cli.mjs finish
```
