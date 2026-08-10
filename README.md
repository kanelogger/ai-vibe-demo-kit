# AI Vibe Demo Kit

面向具体软件项目的轻量 Coding Agent 控制层与工具层。它把项目知识、Skill、Workflow 和人工决策组织成可加载、可校验、可恢复的仓库资产，同时把执行权保留给用户和 Agent。

工具只做确定性工作：初始化、契约校验、状态转换、Gate 和证据引用。它不会调度 Skill、运行测试、修改业务代码、提交 Git 或写入外部系统。

## 五分钟开始

要求 Node.js 22+、Git 和用于安装的 npm。安装后的 Runtime 无 npm 依赖。

```sh
npx --yes ai-vibe-demo-kit@0.4.0 init --target /path/to/project --json
cd /path/to/project
./harness check --json
./harness status --json
./harness start --workflow workflows/workflow-template.json --intent "完成一个可观察目标"
```

相同版本 `init` 幂等。无账本安装、未登记路径、第三种内容、Symlink、活动 Work Item 或非法事务会整体拒绝；生命周期不自动提交、发布或接管用户文件。

完成以上步骤表示 **Runtime-ready**：CLI 已安装，默认 Workflow 可校验和运行。它不表示项目治理内容已经就绪，也不表示已经具备可由 CI 校验的完成证据。

## 完整项目接入

达到 **Governance-ready** 前，项目负责人需要完成以下清单：

1. 在目标路径不存在时，将 `AGENTS_template.md`、`project-template.yml`、`AI_ENVIRONMENT_template.md` 分别复制为 `AGENTS.md`、`project.yml`、`AI_ENVIRONMENT.md`；禁止覆盖已有项目文件。
2. 先填写 `AI_ENVIRONMENT.md` 中全部 `{填写：...}`，实际探测机器状态和 Agent 能力；再填写其余模板中的 `{填写}`、`<placeholder>`、代码根目录、权限和人工确认边界。
3. 从 Kit 中按需选择 `knowledge/`、`rules/` 和架构模板，并扩展已安装的 `SPECS/template.md`；Distribution Lifecycle 不复制 `knowledge/` 和 `rules/`。
4. 为已声明的代码根建立 `ARCHITECTURE.md`，只录入能够由代码、配置或负责人确认的项目事实。
5. 运行 `./harness check-environment --file AI_ENVIRONMENT.md --json`、`./harness check --json` 与 `./harness status --json`，确认环境模板、Workflow、状态和下一步动作均符合目标项目。

模板中的留白和空知识骨架是待定输入，不是可以直接引用的事实。未完成上述清单时，应明确称为 Runtime-ready，不能宣称 Governance-ready。

达到 **Completion-evidence-ready** 还需要：为 acceptance Stage 使用 `verification-report/v1`，把 Stage Result 与报告保存到仓库 Evidence 路径，并在本地或 CI 中运行 `check-result --require-complete`。该检查证明 Evidence 具备进入完成 Transition 的资格；Human Gate 仍由本地控制状态或代码托管平台处理。

## 公共命令

Distribution 生命周期：

```text
ai-vibe-demo-kit init [--target <path>] [--json]
ai-vibe-demo-kit upgrade [--target <path>] [--apply] [--json]
ai-vibe-demo-kit doctor [--target <path>] [--json]
ai-vibe-demo-kit uninstall [--target <path>] [--apply] [--json]
ai-vibe-demo-kit recover [--target <path>] --strategy <resume|rollback> [--apply] [--json]
ai-vibe-demo-kit version [--json]
```

`init` 直接应用；`upgrade`、`uninstall`、`recover` 默认只计划。所有命令共享 schemaVersion 1 JSON envelope；`manual-action-required` 返回 1，`conflict/error` 返回 2，其余返回 0。恢复必须使用 journal 的 `createdByPackageVersion` 和完全一致的 Distribution Manifest Digest。

安装后的 Runtime 控制：

```text
./harness check [--workflow <path>] [--json]
./harness check-environment --file <AI_ENVIRONMENT.md> [--json]
./harness version [--json]
./harness start --workflow <path> --intent <text> [--json]
./harness status [--json]
./harness check-result --workflow <path> --stage <stage> --file <stage-result.json>
    [--require-complete] [--json]
./harness signal --revision <n> --file <stage-result.json> [--json]
./harness decide --revision <n> --action <action>
    [--actor <name>] --reason <text>
    [--target <stage>] [--accept-risk <condition-id> ...] [--json]
```

`signal` 接收 Agent、命令或人工已经完成的 Stage Result。Harness 只校验结构、证据引用与策略结果，不执行 Stage 内容。

`check-environment` 是只读结构检查：它要求 Manifest 保留完整章节、移除全部填写占位符、使用声明的 capability 状态词汇并确认 alignment 清单；它不判断自然语言事实是否真实，实际版本和能力仍必须由探测 Evidence 证明。

`check-result` 对显式 Workflow、Stage 和 Stage Result 执行相同校验，但不读取或修改 `.git/harness/control.json`。`--require-complete` 要求结果对应的 Transition 指向 `complete`。JSON 会区分结构有效、策略满足、完成资格和后续是否仍需人工批准。

`./harness version --json` 从 `.harness/manifest.json` 返回安装版本和最低 Node.js 主版本；该命令不要求当前目录位于 Git 仓库。安装、升级、Doctor、恢复和卸载只由 Distribution CLI 提供。

退出码稳定为：`0` 成功；`1` 被环境就绪检查、Gate、策略条件或 completion route 要求阻止；`2` 参数、结构、状态、Revision 或 I/O 错误。`signal` 返回 `1` 时 Stage Result 已经落盘；调用方必须读取 JSON，而不能把非零简单解释为 Mutation 回滚。无错误的 `signal --json` 使用 `applied` 区分本次写入与幂等重试，并用 `requiresHumanAction` 表示是否等待人工处理。JSON 输出始终包含 Revision、状态、当前 Stage、Pending Gate、允许动作和可复制的 Next Actions；错误输出同时保留当前状态上下文与稳定错误码。

## 控制模型

Workflow v2 是自定义状态图。Stage 声明 Goal、Outcome、Exit Condition、Skill Call 和必需 Artifact；Transition 负责唯一流转，并选择 `auto` 或 `human` Gate。默认模板提供 `alignment -> implementation -> acceptance`，用户可以定义不同数量和关系的 Stage。

工具不解析任意表达式。Stage Result 必须逐项报告：

- Condition：`passed`、`failed` 或 `not-applicable`；通过时给 Evidence，其他状态给 Reason。
- Skill Call：`succeeded`、`failed` 或 `skipped`；成功时给 Artifact，其他状态给 Reason。
- Artifact：仓库内真实文件或格式有效的外部 URI。

本地 Evidence 和 Artifact 引用必须存在、位于仓库内且不经过 Symlink；外部 URI 只校验格式，不访问网络。

`requiredArtifacts[].contract` 可以为 Artifact 声明机器契约。Runtime 支持 `verification-report/v1`：报告必须记录与 Stage Result 一致的 Condition、实际检查命令与退出码，以及测试数据、文件、账户和进程的清理状态。带 contract 的 Artifact 必须是仓库内 JSON 文件，不接受外部 URI。

默认 Workflow 的三个 Stage 都调用随包安装的 `ai-vibe-demo-kit` Skill，并通过 `artifactIds ⊆ artifactRefs ⊆ artifacts[].id` 约束阶段性产物。Required Skill 的路径、普通文件属性、Symlink 安全和仅含 `name/description` 的 frontmatter 会在 `check/start` 时验证。

## 用户在任意 Gate 介入

Human Control 是所有活动状态的内建能力：

- `approve` / `reject`：处理当前 Human Gate。
- `pause` / `resume`：冻结或恢复控制状态。
- `redirect`：跳转到任意已声明 Stage，旧结果保留并标记为 `superseded`。
- `override`：精确接受全部未满足 Condition 或必需 Skill 风险后继续。
- `abort`：终止任务，不修改工作区或 Git 历史。

结构错误不能 Override。流程策略可以由用户接管，决定会保存 Actor、Reason、时间、Accepted Risks 和关联 Transition。任何 Mutation 都要求 Expected Revision；用户 Pause 后，持有旧 Revision 的 Agent 提交会被拒绝。

## 状态与恢复

每个 Worktree 同时只有一个活动任务，唯一机器状态位于 `.git/harness/control.json`。Runtime Mutation 与 Lifecycle Apply 共用 `.git/harness/control.lock`；完成或终止记录归档到 `.git/harness/history/<work-id>.json`。Git 私有控制路径若包含 Symlink，RepositoryGuard 会拒绝读写。

生命周期先在 `.git/harness/maintenance.tmp-<id>/` 完整持久化 staged、backup 与 journal，再原子发布为 canonical `maintenance/`。canonical 存在时 Runtime Mutation 停止并由 `status` 返回精确恢复命令。提交后 canonical 原子改名为 `maintenance.gc-<id>/`，因此清理中断不再阻塞 Runtime。

锁文件记录持有者 PID。Mutation 遇到锁时只会自动回收可以确认 PID 已不存在的锁；PID 仍存活、权限不足、空锁或非法 PID 都返回 `E_STATE_BUSY`，JSON 错误中的 `facts` 和 `repair` 会保留诊断信息。人工恢复前必须确认没有 Harness Mutation 正在运行：读取 `.git/harness/control.lock`，对有效 PID 执行 `kill -0 <pid>`；只有系统确认进程不存在，或锁内容无有效 PID且已排除活动写入时，才能删除该精确锁文件，再运行 `./harness status --json` 检查状态。不要在 Mutation 仍运行时删除锁。

启动任务时会绑定 Workflow 内容 Digest。Workflow 漂移后，工具只允许 `status`、`check` 和 `abort`，避免用新规则解释旧状态。已关闭的历史 v1 本地状态可以只读加载，首次新 Mutation 才按当前格式保存。

## 项目资产

```text
.
├── harness                         # 安装后的公共入口
├── bin/harness.mjs                 # CLI Adapter
├── bin/ai-vibe-demo-kit.mjs        # npm Distribution CLI Adapter
├── scripts/harness/lib/            # ControlKernel、Validator、FileStore、RepositoryGuard、Lifecycle
├── workflows/                      # Workflow v2、Stage Result 模板、案例与 Skill Catalog
│   └── verification-report-template.json
├── project-template.yml            # 项目身份和权威入口模板
├── AGENTS_template.md              # Agent 冷启动入口模板
├── AI_ENVIRONMENT_template.md       # 机器、Agent 能力和项目操作契约模板
├── knowledge/                      # 长期项目与业务知识
├── rules/                          # 测试、安全和 Git 规则
└── SPECS/                          # 长期实现规格
```

`workflows/workflow-case.json` 是带 Policy Override、Human Gate、Pause/Resume 和 Redirect 的说明性完成记录，不是真实执行证明。`workflows/skills-list.json` 只负责 Skill ID 路由；Skill 是否实际可用属于 Stage Result 的策略事实。

## 安全升级与卸载

使用目标 npm 版本生成 upgrade 计划，人工审查 `changes/warnings/errors` 后再加 `--apply`。`managed` 只在账本证明安全时替换或删除；修改后的 `seed` 被保留并进入人工处理或 residual 账本。`.git/harness`、Evidence、生效治理文件、用户 Workflow 和未登记内容始终保留。

## 明确不做

本版本不包含 Skill 调度、测试执行、平台 Hooks、多活动任务、跨机器同步、UI、遥测、自动发布、旧 npm `0.1.x` 迁移、无账本接管或治理文件自动合并。npm 发布、Git Tag 和 push 必须单独获得人工授权。
