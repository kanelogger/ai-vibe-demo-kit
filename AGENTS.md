# Agent 指南

本仓库是面向个人开发者的 AI Native Harness Overlay。它只管理一次开发任务的对齐、实现、验证与恢复；项目事实以 `SPECS/architecture.md` 和 `.harness/config.json` 为准。

## 冷启动

1. 运行 `node scripts/harness/cli.mjs status --json`，读取当前 `idle / alignment / implementation / acceptance` 状态。
2. 读 `HARNESS.md`、`SPECS/architecture.md` 和 `.harness/config.json`。
3. 按目标文件读取 `.harness-index.json` 交付的局部上下文，不预载整个仓库。
4. 外部 Skill 由平台依据 `.agents/skills/*/SKILL.md` 的名称和描述按需选择；禁止恢复确定性路由表。

## 唯一流程

普通任务：

```text
干净工作区 -> align -> implementation -> 用户提交候选变更 -> finish(Full) -> idle
```

高风险任务：

```text
align -> 用户确认 alignment digest -> implementation -> 用户提交候选变更
-> finish(Full) -> acceptance -> 用户确认 acceptance digest -> idle
```

- `align` 必须记录明确意图和至少一个 done-when；高风险任务还要记录风险原因和回退方式。
- `check` 是可选 Quick，可在脏工作区运行；`finish` 只验证干净、已提交且仍是 baseline 后继的候选提交。
- Agent 不代替用户提供确认原话，不自动 commit、push、reset、revert 或改写历史。
- `abort` 只关闭活动状态并报告 baseline、当前候选和恢复建议，不修改工作区。

## 写入与上下文

`.harness/config.json` 的 `contextIndex.codeRoots` 是硬门禁范围。写入受管文件前，平台必须调用：

```sh
node scripts/harness/cli.mjs context guard --file <path> --session <stable-id> --json
```

首次返回 `E_CONTEXT_BLOCKED`/退出码 `1` 表示前置上下文已经交付；读取后只能以同一 session 和目标重试。回执绑定活动任务、revision、session、target 和 context digest。不得通过删除 Code Root、伪造回执或改 Hook 放行。

Hook 只硬拦截能提供结构化目标路径的写工具。Shell 写入无法可靠解析，执行者必须主动遵守同一 Guard。

## 工程底线

- 先读现有事实、实现和测试，再做聚焦改动；事实不足时明确未知，不补模板占位符。
- 一次只引入一种主要不确定性。真实运行通过才算完成，说明文字不能替代失败命令。
- 核心状态与不变量用单测；真实依赖用集成测试；跨平台输入输出用契约测试；确有用户界面时才增加 E2E。
- 保留用户已有改动。不得擅自清理、强推、重置、泄露秘密或执行范围不明的破坏性命令。
- 任务完成前运行与风险匹配的 Quick/Full；提交只包含本任务变更，并保持可独立回退。

## 稳定入口

```sh
node scripts/harness/cli.mjs status [--json]
node scripts/harness/cli.mjs align --intent <text> --done-when <text> [--json]
node scripts/harness/cli.mjs align --confirm <digest> --quote <用户原话> [--json]
node scripts/harness/cli.mjs check [--json]
node scripts/harness/cli.mjs finish [--json]
node scripts/harness/cli.mjs finish --confirm <digest> --quote <用户原话> [--json]
node scripts/harness/cli.mjs abort --reason <text> [--json]
node scripts/skills-sync.mjs
```

退出码固定为：`0` 成功，`1` 门禁或验证拒绝，`2` 用法、配置、状态或依赖错误。
