# AI Native Harness Overlay 操作手册

这是一个面向个人开发者的仓库内 Agent 控制面。本仓库负责开发、测试和发布 Overlay；安装器把固定版本的运行时复制进目标 Git 仓库，之后所有状态、验证和平台 Hook 都在目标仓库内运行。

手册分为五部分：

- 快速开始：已经接入 Overlay 时，如何立即发起一个需求。
- 常用操作：日常命令、提示词、普通任务和高风险任务。
- 接入与配置：如何把 Overlay 安装进老项目或新项目。
- 常见问题：门禁、验证、上下文和恢复问题如何处理。
- 完整流程：从需求原话到交付的一次完整操作清单。

## 背景

```text
本仓库（开发、测试、发布 Overlay）
  └─ install-overlay
       ├─ 老项目 + Overlay
       └─ 新项目 + Overlay
```

Overlay 不是应用脚手架、npm 包或全局 CLI，也不要求目标项目使用 Node.js 作为应用技术栈。Node.js 只负责运行仓库内 Harness 脚本。

本项目只有一种人的身份：用户。用户维护老项目或创建新项目；Agent 和 Harness 都是用户使用的工具。

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| 用户 | 项目事实、需求目标、范围判断、风险确认、代码审查、提交与交付 | 把关键决策交给自动化代办 |
| Agent | 读取上下文、实现、运行验证、提供失败证据 | 代替用户确认、提交、回滚或推送 |
| Harness | 保存本地任务状态、执行门禁与 Quick/Full、交付目录上下文 | 管理业务、生成团队流程或跨仓库状态 |

核心路径：

```text
普通任务：需求原话 -> align -> Agent 实现 -> 用户审查并提交 -> finish -> idle
高风险项：需求原话 -> align 确认 -> Agent 实现 -> 用户审查并提交 -> Full -> 验收确认 -> idle
```

## 快速开始

本节适用于已经接入并提交 Overlay 的目标仓库。首次使用请先完成[接入与配置](#接入与配置)。

### 1. 打开目标仓库和 Agent

```sh
cd /absolute/path/to/target-repo

codex   # Codex CLI
omp     # OMP
claude  # Claude Code（已安装时）
```

使用 Codex 桌面端时，直接把目标仓库作为工作区打开。不要在 Overlay 母仓库中发起业务需求。

### 2. 发送最小提示词

```text
请在当前仓库使用 AI Native Harness Overlay 完成下面的任务。

任务意图：<要解决的问题>

完成条件：
1. <用户可观察的结果>
2. <必须保持的兼容行为>
3. <需要通过的测试或真实操作>

约束：
- <不能修改的范围>

先读取 Harness 状态和项目事实，执行 align 后实现。
不要 commit、push、reset、revert；完成后报告 diff 和验证证据，等待用户审查。
```

Agent 会运行 `status`、读取仓库事实、执行 `align` 并开始实现。用户不需要自己拼 Harness 命令。

### 3. 用户审查并提交

Agent 完成实现后会停在候选提交之前。用户审查 diff 和验证结果，然后在另一个终端或 Git 客户端中提交：

```sh
git add <本次改动文件>
git commit -m "feat: describe the change"
```

提交后在同一个 Agent 会话发送：

```text
候选变更已经由用户审查并提交。请重新读取 Harness 状态，运行 finish 完成 Full 验证。
不要创建新提交、不要 push。失败时给出失败命令、关键输出和修复建议。
```

普通任务 Full 通过后自动回到 `idle`。

## 常用操作

### 基础命令

以下命令都在目标仓库根目录运行。

| 命令 | 使用场景 | 结果 |
| --- | --- | --- |
| `node scripts/harness/cli.mjs status --json` | 打开仓库、继续任务或不确定当前状态时 | 返回 `idle / alignment / implementation / acceptance` 与允许动作 |
| `node scripts/harness/cli.mjs align ...` | 开始一个新任务 | 记录 baseline、意图、完成条件、约束和风险 |
| `node scripts/harness/cli.mjs check` | 实现过程中需要快速反馈时 | 在脏工作区执行 Quick，不完成任务 |
| `node scripts/harness/cli.mjs finish` | 用户已经提交候选且工作区干净时 | 执行 Full；普通任务通过后回到 `idle` |
| `node scripts/harness/cli.mjs abort --reason <text>` | 确定放弃当前活动任务时 | 清理活动状态并报告恢复建议，不修改工作区 |
| `node scripts/harness/cli.mjs context guard ...` | Shell 写入受管代码前 | 首次交付上下文并阻断，同 session 重试后放行 |

退出码：

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 门禁、确认或验证拒绝；按返回事实处理后可继续 |
| `2` | 用法、配置、状态或依赖错误 |

### 普通任务命令

```sh
node scripts/harness/cli.mjs status --json

node scripts/harness/cli.mjs align \
  --intent "要完成什么" \
  --done-when "可观察完成条件"

node scripts/harness/cli.mjs check    # 可选 Quick

# 用户审查并提交候选，保持工作区干净
node scripts/harness/cli.mjs finish   # 执行 Full
```

### 首轮提示词模板

任务较复杂时使用完整模板：

```text
请在当前仓库使用 AI Native Harness Overlay 完成下面的任务。

任务意图：
<要解决的问题或要新增的能力>

完成条件：
1. <用户可以观察到的结果>
2. <必须保持的兼容行为>
3. <需要通过的测试或真实操作>

约束：
- <不能修改的范围>
- <兼容性、性能或安全限制>

来源：
- <需求原话、问题链接、日志或相关文件>

执行要求：
1. 先运行 `node scripts/harness/cli.mjs status --json`。
2. 读取 `HARNESS.md`、`SPECS/architecture.md` 和 `.harness/config.json`。
3. 状态为 idle 时，用上述事实执行 align；不要自行扩展需求。
4. 如果 Harness 要求 digest 确认，停止并把 digest、风险原因和待确认原话交给用户。
5. 获得放行后实现最小完整改动，并运行与风险匹配的 Quick 或项目测试。
6. 不要 commit、push、reset、revert，也不要代替用户确认。
7. 完成后报告改动文件、验证结果、未覆盖风险和建议提交信息，等待用户审查并提交。
```

### 普通需求示例

```text
请在当前仓库使用 AI Native Harness Overlay 完成下面的任务。

任务意图：给订单列表增加 CSV 导出，导出内容必须使用当前筛选条件。

完成条件：
1. 用户点击导出后可以得到 CSV 文件。
2. 导出结果只包含当前筛选命中的订单。
3. CSV 至少包含订单号、创建时间、状态和金额。
4. 现有列表查询和筛选行为保持不变。
5. 相关测试、类型检查和构建通过。

约束：
- 不修改数据库结构。
- 不增加新的队列或后台服务。
- 数据量沿用当前列表接口能够承受的范围。

来源：用户原话“订单筛选后，希望能把眼前这些数据直接导出来”。

先检查 Harness 状态并执行 align。实现后不要提交，报告 diff 和验证证据，等待用户审查。
```

### 高风险任务

认证、数据库迁移、部署配置、Harness 控制面或平台 Adapter 等任务必须保留两次用户确认。

`align` 返回 confirmation digest 后，用户发送：

```text
我确认按上述任务范围实施，接受已列出的风险和回退方式。
请使用刚才返回的 alignment digest 和这句原话完成确认，然后继续实现。
```

用户提交候选并让 Agent 执行 `finish`。Full 通过后，Harness 停在 acceptance 并返回新的 digest，用户发送：

```text
我确认验收这个候选提交及其 Full 验证结果。
请使用刚才返回的 acceptance digest 和这句原话完成验收确认。
```

两次确认必须使用各自最新的 digest。事实、配置、命令计划、分支或候选提交发生变化后，旧 digest 会失效。

### 继续任务

暂时离开但仍要继续同一任务时，不运行 `abort`。下次打开同一个目标仓库后发送：

```text
请先读取 Harness status，说明当前任务阶段、baseline、候选状态和下一步允许动作，
然后从现有活动任务继续。不要重新 align。
```

### 中止任务

确定放弃当前任务时发送：

```text
请运行 Harness abort，原因为“需求取消”。
不要修改、清理或回滚工作区，只报告 baseline、当前候选和恢复建议。
```

`abort` 只处理 Harness 活动状态。工作区恢复由用户根据返回事实决定。

## 接入与配置

首次接入只执行本节一次。完成接入提交后，日常需求从[快速开始](#快速开始)进入。

### 1. 准备目标仓库

维护老项目时：

1. 确认当前代码能够真实运行。
2. 保留一个干净的 baseline commit。
3. 为 Overlay 接入创建独立分支。

创建新项目时：

1. 先创建真正的应用并跑通最小功能。
2. 提交第一个业务 baseline。
3. 不要从 Overlay 母仓库直接改造成业务项目。

Overlay 安装器只接受已经存在 baseline commit 的目标 Git 仓库根目录。

### 2. 写入项目事实

目标项目必须先提供三份真实事实：

- `.harness/config.json`：验证命令、风险路径、代码根和恢复命令。
- `AGENTS.md`：项目原有规则与最小 Harness 指令。
- `SPECS/architecture.md`：项目架构、模块位置和运行事实。

`.harness/config.json` 使用 v2 schema。下面是字段示例，必须把命令和路径替换为目标项目的真实内容：

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

安装器拒绝没有任何 Full、契约或关键路径命令的配置。小项目可以先保持 `contextIndex.codeRoots: []`。

将以下最小约束合并进目标项目 `AGENTS.md`，保留原有项目规则：

```md
本仓库接入 AI Native Harness Overlay。开始任务先运行
`node scripts/harness/cli.mjs status --json`，并读取 `HARNESS.md`、
`SPECS/architecture.md` 和 `.harness/config.json`。

普通任务路径：干净工作区 -> align -> 实现 -> 用户提交候选 -> finish。
Agent 不自动 commit、push、reset、revert；高风险确认必须保留用户原话。
```

### 3. 安装 Overlay

从 Overlay 母仓库运行：

```sh
cd /path/to/ai-native-harness-overlay

node scripts/install-overlay.mjs \
  --target /absolute/path/to/target-repo \
  --platform codex
```

`--platform` 每次接受一个值：

| 值 | 安装内容 | 必须登记的高风险路径 |
| --- | --- | --- |
| `codex` | `.codex/hooks.json` 与共享 PreToolUse Adapter | `.codex/hooks.json` |
| `claude` | `.claude/settings.json`、`CLAUDE.md` 与共享 PreToolUse Adapter | `.claude/settings.json`、`CLAUDE.md` |
| `omp` | `.omp/extensions/harness-context-guard.js` 与共享 Hook Core | `.omp/extensions` |

安装器会：

- 校验目标 Git 根、baseline、三份项目事实和 Full 计划。
- 确认 Overlay 与所选 Adapter 都属于高风险路径。
- 复制 `HARNESS.md`、CLI、运行库和选定 Adapter。
- 对相同内容返回 `KEPT`。
- 对人工合并完成的 Codex/Claude 配置返回 `PRESERVED`。

安装器不会：

- 复制母仓库测试、自托管配置、Skills 或目录索引。
- 覆盖不同内容、symlink 或非普通文件。
- 提交、删除、reset、revert 或 push。

遇到冲突时，安装器会在复制任何文件前整体拒绝。目标已有 Codex/Claude 配置时，先人工合并母仓库中的 Hook，再重跑安装器。

### 4. 验证并提交接入

在目标仓库运行：

```sh
node scripts/harness/cli.mjs status --json  # 应返回 idle
git diff --check                            # 检查空白错误
git status --short                          # 审查全部接入文件
```

用户审查后提交 Overlay 接入。安装器不代替提交或推送。

### 5. Directory Context Guard

只有 `.harness/config.json#contextIndex.codeRoots` 中的目标会触发写前 Guard。每个受管根需要真实的 `.harness-index.json`。

建议小项目先使用空数组。只有 Agent 确实反复漏读局部约束时，再登记代码根和目录索引。

平台 Adapter 会处理结构化写工具。Shell 写入没有可靠目标路径时，由执行者主动调用：

```sh
node scripts/harness/cli.mjs context guard \
  --file <path> \
  --session <stable-id> \
  --json
```

首次调用返回 `E_CONTEXT_BLOCKED` 并交付上下文；读取后用同一 session 和目标重试。

### 6. Skills 与升级

Skills 供应链与任务生命周期独立。安装器默认不复制 `.agents/skills` 或同步脚本。目标项目出现稳定、重复的专业任务后，再单独选择和锁定 Skill。

当前安装器只负责首次发布和相同版本的幂等检查，不覆盖旧版本。Overlay 升级先在母仓库查看版本差异，再把受管文件作为一组高风险变更审查；出现真实的重复升级需求后再增加自动升级机制。

## 常见问题

### `align` 返回 `E_GIT_DIRTY`

`align` 只从干净 baseline 开始。运行 `git status --short`，确认未提交内容的归属。提交、转移或恢复这些内容后重新执行；Harness 不会自动处理工作区。

### `finish` 返回 `E_GIT_DIRTY` 或 `E_GIT_DRIFT`

常见原因：

- 用户还没有提交候选。
- 提交后工作区又产生了修改。
- 当前分支不是任务开始时的分支。
- baseline 不是当前候选的祖先。

先运行 `status` 和 `git status --short`。保留正确分支和候选，提交必要修复并保持工作区干净，再重新执行 `finish`。

### 返回 `E_CONFIRM_REQUIRED`

这是高风险门禁，不是程序故障。把 Harness 返回的最新 digest、风险原因和回退方式交给用户。用户提供明确原话后才能执行 `align --confirm` 或 `finish --confirm`。

### 返回 `E_CONFIRM_STALE` 或 `E_VERIFY_STALE`

旧证据已经与当前事实不一致。不要复用旧 digest 或旧验证结果；重新读取 `status`，按当前阶段重新确认或运行 `finish`。

### `check` 或 `finish` 返回 `E_VERIFY_FAILED`

查看报告中的失败命令、退出码和末尾输出。修复问题后重新运行相关项目命令；由用户审查并提交新的候选，再执行 `finish`。活动任务会保留，不需要重新 `align`。

### 写文件时返回 `E_CONTEXT_BLOCKED`

首次阻断是预期行为，表示前置上下文已经交付。Agent 读取依赖内容后，必须使用同一 session 和同一目标重试。索引或依赖变化后会再次阻断。

### 重新打开 Agent 后发现已有活动任务

不要重新 `align`。发送：

```text
请读取 Harness status，说明当前阶段、baseline、候选状态和下一步允许动作，
然后从现有活动任务继续。
```

### 安装器报告文件冲突

安装器不会覆盖目标文件。先审查冲突：

- Codex/Claude 配置：人工合并对应 Hook，重跑后应显示 `PRESERVED`。
- Overlay 运行时：比较母仓库与目标版本，作为高风险升级人工处理。
- symlink 或非普通文件：改为目标仓库内普通文件后重试。

### 放弃任务后代码为什么还在

`abort` 只清理 Harness 活动状态，不回滚工作区。它会返回 baseline、当前候选和恢复建议；用户据此决定保留、提交、恢复或执行 `git revert`。

## 一次完整的需求开发流程

1. 用户确认目标仓库已有 Overlay，工作区干净且 `status` 为 `idle`。
2. 用户从目标仓库打开 Agent，提供任务意图、完成条件、约束和来源。
3. Agent 读取项目事实并执行 `align`。
4. 高风险任务由用户确认 alignment digest；普通任务直接进入 implementation。
5. Agent 实现最小完整改动，按需运行 Quick 和项目测试。
6. Agent 报告 diff、验证结果和未覆盖风险，然后停止。
7. 用户审查代码并提交候选；Agent 不代替提交或 push。
8. 用户让 Agent 运行 `finish`，Full 验证干净且已提交的候选。
9. 普通任务通过后回到 `idle`；高风险任务由用户确认 acceptance digest 后回到 `idle`。
10. 用户交付或合并候选提交。Harness 状态保留在本地 `.git`，不生成流程报告或审计账本。

## 母仓库开发验证

```sh
node --test scripts/install-overlay.test.mjs
node --test scripts/harness/test/*.test.mjs scripts/skills-sync-links.test.mjs scripts/install-overlay.test.mjs
node scripts/skills-sync.mjs
```

本项目架构见 `SPECS/architecture.md`，控制面完整契约见 `HARNESS.md`。
