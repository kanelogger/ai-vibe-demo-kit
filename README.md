# AI Native Harness Overlay

面向个人开发者的仓库内 Agent 控制面。这个仓库是 Overlay 母仓库；安装器把固定版本的运行时复制进目标 Git 仓库，之后所有状态、验证和平台 Hook 都在目标仓库内运行。

```text
本仓库（开发、测试、发布 Overlay）
  └─ install-overlay
       ├─ 老项目 + Overlay
       └─ 新项目 + Overlay
```

它不是应用脚手架、npm 包或全局 CLI，也不要求目标项目使用 Node.js 作为应用技术栈。Node.js 只负责运行仓库内的 Harness 脚本。

## 用户旅程

### 旅程 A：维护老项目

1. 用户确定新需求、缺陷或维护目标，并说明可观察的完成条件。
2. 用户在老项目中确认当前代码可以运行，保留一个干净的 baseline commit，并创建本次工作的分支。
3. 首次接入时，用户根据老项目真实情况写好 `.harness/config.json`、`AGENTS.md` 和 `SPECS/architecture.md`，再从本母仓库安装一个平台 Adapter。
4. 用户用 `align` 固定本次意图、完成条件和约束；高风险任务由用户确认 alignment digest。
5. Agent 读取项目事实和局部上下文，完成代码修改；需要中途反馈时运行 Quick。
6. 用户审查实际 diff 和运行结果，决定是否形成候选提交。Harness 不替用户提交或推送。
7. `finish` 对干净、已提交的候选执行 Full。普通任务通过后直接回到 `idle`；高风险任务由用户再次确认 acceptance digest。
8. 用户交付或合并候选提交。活动状态留在本地 `.git` 中，不给目标仓库增加流程报告或审计账本。

Overlay 只需首次接入一次。以后每个需求从第 4 步开始。

### 旅程 B：创建新项目

1. 用户先创建真正的应用，跑通最小功能并提交第一个 baseline；不要从 Overlay 母仓库直接改造成业务项目。
2. 用户按当前技术栈登记真实 Quick/Full 命令、风险路径和架构事实。
3. 用户安装实际使用的平台 Adapter，验证 `status` 为 `idle`，并把本次接入作为独立提交保存。
4. 后续需求沿用与老项目相同的 `align -> 实现 -> 用户提交候选 -> finish` 闭环。
5. 项目还小时保持 `contextIndex.codeRoots: []`；只有 Agent 确实反复漏读局部约束时，再启用 Directory Context Guard。

```text
首次接入：业务 baseline -> 写真实项目事实 -> install-overlay -> 审查并提交 -> idle
日常需求：需求原话 -> align -> Agent 实现 -> 用户审查并提交 -> finish -> idle
高风险项：需求原话 -> align 确认 -> Agent 实现 -> 用户审查并提交 -> Full -> 验收确认 -> idle
```

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| 用户 | 项目事实、需求目标、范围判断、风险确认、代码审查、提交与交付 | 把关键决策交给自动化代办 |
| Agent | 读取上下文、实现、运行验证、提供失败证据 | 代替用户确认、提交、回滚或推送 |
| Harness | 保存本地任务状态、执行门禁与 Quick/Full、交付目录上下文 | 管理业务、生成团队流程或跨仓库状态 |

## 安装到目标仓库

安装器只发布 Overlay 拥有的运行时和一个选定的平台 Adapter。目标项目的事实不能由母仓库猜测，必须先由用户写入目标仓库：

- `.harness/config.json`：真实验证命令、风险路径、代码根和恢复命令。
- `AGENTS.md`：合并目标项目原有约束与下方最小 Harness 指令。
- `SPECS/architecture.md`：目标项目的真实架构、模块位置和运行事实。

目标仓库必须已经有一个可运行的 baseline commit；新项目先完成业务最小基线提交，再接入 Overlay。建议在目标项目的新分支完成准备和安装，先检查已有改动，不要覆盖其他未完成工作。

### 1. 写入真实项目事实

`.harness/config.json` 使用 v2 schema。下面只展示字段形状，命令和路径必须替换成目标项目实际可运行的内容；安装器拒绝没有任何 Full、契约或关键路径命令的配置。

```json
{
  "version": 2,
  "project": {
    "name": "legacy-app",
    "summary": "现有业务系统",
    "hasUserInterface": true
  },
  "contextIndex": {
    "codeRoots": []
  },
  "risk": {
    "highRiskPaths": [
      ".harness/config.json",
      ".codex/hooks.json",
      "AGENTS.md",
      "HARNESS.md",
      "SPECS/architecture.md",
      "scripts/harness",
      "src/auth",
      "database/migrations"
    ]
  },
  "commands": {
    "quick": {
      "static": ["npm run typecheck"],
      "test": ["npm run test:quick"]
    },
    "full": {
      "static": ["npm run lint", "npm run typecheck"],
      "test": ["npm test", "npm run build"]
    },
    "contracts": []
  },
  "criticalUserPaths": [],
  "verification": {
    "commandTimeoutMs": 600000
  },
  "recovery": {
    "testDataCleanup": [],
    "rollback": ["git revert <candidate-commit>"]
  }
}
```

小项目可以先保持 `contextIndex.codeRoots: []`。只有出现真实的局部上下文遗漏后，再登记代码根并在根目录增加 `.harness-index.json`。

将以下最小约束合并进目标项目的 `AGENTS.md`，保留原有项目规则：

```md
本仓库接入 AI Native Harness Overlay。开始任务先运行
`node scripts/harness/cli.mjs status --json`，并读取 `HARNESS.md`、
`SPECS/architecture.md` 和 `.harness/config.json`。

普通任务路径：干净工作区 -> align -> 实现 -> 用户提交候选 -> finish。
Agent 不自动 commit、push、reset、revert；高风险确认必须保留用户原话。
```

### 2. 从母仓库运行安装器

```sh
cd /path/to/ai-native-harness-overlay
node scripts/install-overlay.mjs \
  --target /absolute/path/to/target-repo \
  --platform codex
```

`--platform` 每次接受一个值：

| 值 | 安装内容 | 配置必须覆盖的高风险路径 |
| --- | --- | --- |
| `codex` | `.codex/hooks.json` 与共享 PreToolUse Adapter | `.codex/hooks.json` |
| `claude` | `.claude/settings.json`、`CLAUDE.md` 与共享 PreToolUse Adapter | `.claude/settings.json`、`CLAUDE.md` |
| `omp` | `.omp/extensions/harness-context-guard.js` 与共享 Hook Core | `.omp/extensions` |

安装器的行为是确定性的：

- 只接受已经存在 baseline commit 的目标 Git 仓库根目录。
- 校验三份项目事实，拒绝空的 Full 计划，并确认 Overlay 与所选 Adapter 都属于高风险路径。
- 复制 `HARNESS.md`、`scripts/harness/cli.mjs`、运行库和选定 Adapter。
- 不复制母仓库测试、自托管配置、Skills 或目录索引。
- 已有文件内容相同则 `KEPT`；内容不同、是 symlink 或非普通文件时，在任何复制前整体拒绝。
- 目标已有 Codex/Claude 配置时先人工合并 Hook；重跑后安装器只验证所需 Adapter 已存在并标记 `PRESERVED`，不改写目标配置。
- 不提交、不删除、不覆盖目标仓库内容。

需要机器输出时增加 `--json`。安装另一个平台前，先把该平台路径加入 `risk.highRiskPaths`，再运行对应命令；共享文件会保持 `KEPT`。

### 3. 验证并提交接入

在目标仓库运行：

```sh
node scripts/harness/cli.mjs status --json
git diff --check
git status --short
```

确认输出为 `idle`，审查全部新增文件，然后由用户提交这次 Overlay 接入。安装器不代替提交或推送。

## 日常使用

普通任务只需要：

```sh
node scripts/harness/cli.mjs status --json
node scripts/harness/cli.mjs align \
  --intent "要完成什么" \
  --done-when "可观察完成条件"

# Agent 修改代码；需要快速反馈时可选运行
node scripts/harness/cli.mjs check

# 由用户审查并提交候选变更，保持工作区干净
node scripts/harness/cli.mjs finish
```

高风险任务会在 `align` 后和 Full 通过后各停一次，并输出绑定当前事实的 digest：

```sh
node scripts/harness/cli.mjs align --confirm <digest> --quote "用户原话"
node scripts/harness/cli.mjs finish --confirm <digest> --quote "用户原话"
```

停止任务时运行：

```sh
node scripts/harness/cli.mjs abort --reason "停止原因"
```

`abort` 只清理活动状态并报告恢复建议，不修改工作区。完整状态、验证和 Context Guard 语义见 `HARNESS.md`。

## Context Guard

只有 `.harness/config.json#contextIndex.codeRoots` 中的目标会触发写前 Guard。每个受管根需要真实的 `.harness-index.json`。平台 Adapter 会处理结构化写工具；Shell 写入没有可靠目标路径时，由执行者主动调用：

```sh
node scripts/harness/cli.mjs context guard \
  --file <path> \
  --session <stable-id> \
  --json
```

## Skills 与升级

Skills 供应链与生命周期独立，安装器默认不复制 `.agents/skills` 或同步脚本。目标项目出现稳定、重复的专业任务后，再单独选择和锁定 Skill。

当前安装器只负责首次发布和相同版本的幂等检查，故意不覆盖旧版本。Overlay 升级先在母仓库查看版本差异，再把受管文件作为一组高风险变更审查；出现真实的重复升级需求后再增加自动升级机制。

## 母仓库开发验证

```sh
node --test scripts/install-overlay.test.mjs
node --test scripts/harness/test/*.test.mjs scripts/skills-sync-links.test.mjs scripts/install-overlay.test.mjs
node scripts/skills-sync.mjs
```

本项目架构见 `SPECS/architecture.md`，控制面完整契约见 `HARNESS.md`。
