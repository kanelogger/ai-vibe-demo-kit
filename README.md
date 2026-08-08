# Project Agent Harness

面向具体软件项目的轻量 Coding Agent 控制层与工具层。它把项目知识、Skill、Workflow 和人工决策组织成可加载、可校验、可恢复的仓库资产，同时把执行权保留给用户和 Agent。

工具只做确定性工作：初始化、契约校验、状态转换、Gate 和证据引用。它不会调度 Skill、运行测试、修改业务代码、提交 Git 或写入外部系统。

## 五分钟开始

要求 Node.js 20+ 和一个 Git 仓库，无 npm 依赖。

```sh
node /path/to/kit/bin/harness.mjs init --target /path/to/project
cd /path/to/project
./harness check
./harness start --workflow workflows/workflow-template.json --intent "完成一个可观察目标"
./harness status
```

相同版本可以幂等重装；安装器会在写入前检查全部目标，遇到不同内容、Symlink 或非 Git 目录时整体拒绝，不覆盖现有文件，也不自动提交。

## 公共命令

```text
./harness check [--workflow <path>] [--json]
./harness start --workflow <path> --intent <text> [--json]
./harness status [--json]
./harness signal --revision <n> --file <stage-result.json> [--json]
./harness decide --revision <n> --action <action>
    [--actor <name>] --reason <text>
    [--target <stage>] [--accept-risk <condition-id> ...] [--json]
```

`signal` 接收 Agent、命令或人工已经完成的 Stage Result。Harness 只校验结构、证据引用与策略结果，不执行 Stage 内容。

退出码稳定为：`0` 成功；`1` 被 Gate 或策略条件阻止；`2` 参数、结构、状态、Revision 或 I/O 错误。`signal` 返回 `1` 时 Stage Result 已经落盘；调用方必须读取 JSON，而不能把非零简单解释为 Mutation 回滚。无错误的 `signal --json` 使用 `applied` 区分本次写入与幂等重试，并用 `requiresHumanAction` 表示是否等待人工处理。JSON 输出始终包含 Revision、状态、当前 Stage、Pending Gate、允许动作和可复制的 Next Actions；错误输出同时保留当前状态上下文与稳定错误码。

## 控制模型

Workflow v2 是自定义状态图。Stage 声明 Goal、Outcome、Exit Condition、Skill Call 和必需 Artifact；Transition 负责唯一流转，并选择 `auto` 或 `human` Gate。默认模板提供 `alignment -> implementation -> acceptance`，用户可以定义不同数量和关系的 Stage。

工具不解析任意表达式。Stage Result 必须逐项报告：

- Condition：`passed`、`failed` 或 `not-applicable`；通过时给 Evidence，其他状态给 Reason。
- Skill Call：`succeeded`、`failed` 或 `skipped`；成功时给 Artifact，其他状态给 Reason。
- Artifact：仓库内真实文件或格式有效的外部 URI。

本地 Evidence 和 Artifact 引用必须存在、位于仓库内且不经过 Symlink；外部 URI 只校验格式，不访问网络。

## 用户在任意 Gate 介入

Human Control 是所有活动状态的内建能力：

- `approve` / `reject`：处理当前 Human Gate。
- `pause` / `resume`：冻结或恢复控制状态。
- `redirect`：跳转到任意已声明 Stage，旧结果保留并标记为 `superseded`。
- `override`：精确接受全部未满足 Condition 或必需 Skill 风险后继续。
- `abort`：终止任务，不修改工作区或 Git 历史。

结构错误不能 Override。流程策略可以由用户接管，决定会保存 Actor、Reason、时间、Accepted Risks 和关联 Transition。任何 Mutation 都要求 Expected Revision；用户 Pause 后，持有旧 Revision 的 Agent 提交会被拒绝。

## 状态与恢复

每个 Worktree 同时只有一个活动任务，唯一机器状态位于 `.git/harness/control.json`。状态使用短锁、Revision 和原子 Rename；完成或终止记录归档到 `.git/harness/history/<work-id>.json`。Git 私有控制路径若包含 Symlink，FileStore 会拒绝读写，避免状态逸出仓库的 Git 私有目录。

锁文件记录持有者 PID。Mutation 遇到锁时只会自动回收可以确认 PID 已不存在的锁；PID 仍存活、权限不足、空锁或非法 PID 都返回 `E_STATE_BUSY`，JSON 错误中的 `facts` 和 `repair` 会保留诊断信息。人工恢复前必须确认没有 Harness Mutation 正在运行：读取 `.git/harness/control.lock`，对有效 PID 执行 `kill -0 <pid>`；只有系统确认进程不存在，或锁内容无有效 PID且已排除活动写入时，才能删除该精确锁文件，再运行 `./harness status --json` 检查状态。不要在 Mutation 仍运行时删除锁。

启动任务时会绑定 Workflow 内容 Digest。Workflow 漂移后，工具只允许 `status`、`check` 和 `abort`，避免用新规则解释旧状态。已关闭的历史 v1 本地状态可以只读加载，首次新 Mutation 才按当前格式保存。

## 项目资产

```text
.
├── harness                         # 安装后的公共入口
├── bin/harness.mjs                 # CLI Adapter
├── scripts/harness/lib/            # ControlKernel、Validator、FileStore、Installer
├── workflows/                      # Workflow v2、Stage Result 模板、案例与 Skill Catalog
├── project-template.yml            # 项目身份和权威入口模板
├── AGENTS_template.md              # Agent 冷启动入口模板
├── knowledge/                      # 长期项目与业务知识
├── rules/                          # 测试、安全和 Git 规则
└── SPECS/                          # 长期实现规格
```

`workflows/workflow-case.json` 是带 Policy Override、Human Gate、Pause/Resume 和 Redirect 的说明性完成记录，不是真实执行证明。`workflows/skills-list.json` 只负责 Skill ID 路由；Skill 是否实际可用属于 Stage Result 的策略事实。

## 明确不做

MVP 不包含 Skill 调度、测试执行、平台 Hooks、多活动任务、跨机器同步、UI、遥测、npm 发布和自动升级。普通命令只读取仓库事实和 `.git/harness`；除 `init` 安装清单外，不写入工作树。
