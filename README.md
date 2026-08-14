# AI Vibe Demo Kit

AI Vibe Demo Kit 是一个零 npm 依赖的 Node.js CLI，用于把版本化的 Coding Agent Source 与可恢复的 Harness Runtime 分发到现有 Git 仓库，并通过 Workflow、Stage Result、Policy 和 Human Gate 控制任务推进。

当前版本已经实现安全的初始化、指定版本升级、npm latest 同步、卸载、恢复和确定性 Workflow 状态机。Source 的版本跟随实际执行升级的 npm 包版本；CLI 不拉取远程 Skill，也不执行 Skill 或测试。

## 解决什么问题

Coding Agent 项目通常需要同时维护：

- 可持续升级的知识、规则、规格、工作流和治理模板；
- 可验证的任务阶段、Evidence 和人工决策；
- 不覆盖项目本地修改的安装与升级机制；
- 中断后可以继续或回滚的文件事务。

本项目把这些职责拆成控制面、执行指引和分发层：

```text
ai-vibe-demo-kit npm package
├── Distribution CLI
│   ├── init / upgrade / sync / doctor
│   └── uninstall / recover / version
├── installed Harness Runtime
│   ├── Workflow 与 Stage Result 校验
│   ├── Revision、Policy、Gate 与人工决策
│   └── Git 私有控制状态
└── installed Source
    ├── workflow-runner / kit-lifecycle Skills
    ├── Skill 推荐来源声明
    ├── knowledge / rules / specs / workflows
    └── Agent、环境、编码规则与项目模板
```

## 当前能力边界

| 能力 | 当前行为 |
| --- | --- |
| Source 分发 | 从当前 npm 包内的 `source/manifest.json` 安装完整版本化 Source |
| 最新版本同步 | `sync` 查询 npm `latest`，固定精确版本后委派该版本执行 `upgrade` |
| 外部 Skill 推荐 | `source/.agents/skills.sources.json` 只保存推荐仓库、路径和跟踪意图，不是安装清单或版本锁 |
| Skill 安装与更新 | CLI 不解析、锁定、安装、更新、物化或检查外部 Skill；这些能力不属于本项目 |
| Stage 执行 | `workflow-runner` 指引 Agent 完成 Observe → Understand → Discover → Decide → Execute → Advance |
| 动态能力选择 | Runner 只从当前会话已暴露的 Skills、Tools 和 Agent 原生能力中选择最小组合，并写入 `execution-trace/v1` |
| Skill 管理 | 消费者自行管理本地领域 Skills；CLI 不安装、不更新、不检查失效或鉴权 |
| Skill 回执 | 默认 Workflow 只声明 Runner；Harness 校验 Runner 回执、Evidence 和 Trace 引用，不探测领域能力健康状态 |
| Workflow 推进 | Harness 强制 Required Condition、Skill 回执、Policy、Revision 和 Gate |
| 测试与业务操作 | Harness 不执行测试、Shell、Git 提交、业务写入或外部系统操作 |
| 治理文件启用 | 模板安装到 `source/`；有效根级治理文件由维护者提升和填写 |
| Source 本地修改 | `managed` 内容要求保持上游一致；修改会阻止安全升级 |

## 内置 Skills

0.6.0 安装两个单一职责 Skill。两者都允许 Agent Host 根据对话隐式触发，但不会替用户作出 Human Gate 或写入授权决定。

| Skill | 使用时机 | 唯一职责 |
| --- | --- | --- |
| `workflow-runner`（Workflow Runner） | Harness 存在 active Stage，需要完成 alignment、implementation、acceptance 或返工循环 | 把当前 Stage 从 active 推进到一个真实、可校验、可提交的 Stage Result |
| `kit-lifecycle`（Kit Lifecycle） | 需要 doctor、init、upgrade、sync、recover 或 uninstall Kit | 安全规划和执行 Kit 安装生命周期 |

### Workflow Runner

Workflow Runner 按固定闭环驱动一个 Stage：

```text
Observe → Understand → Discover → Decide → Execute → Advance
```

- **Observe**：读取环境探测、Harness revision、当前 Stage、`allowedActions` 和 Pending Gate。
- **Understand**：理解当前 Stage 的 goal、outcomes、exit conditions、required artifacts 和权限边界。
- **Discover**：只使用当前 Agent 会话已经暴露的 Skills、Tools 和原生能力；不扫描来源声明或远程仓库。
- **Decide**：选择覆盖当前 Stage 的最小能力组合；没有合适领域 Skill 时显式使用具体 Tool 或 `agent-native`。
- **Execute**：执行编码、测试、修复和 Evidence 收集；失败尝试与替代能力都如实保留。
- **Advance**：生成 Stage artifacts、`execution-trace/v1` 和 Stage Result，通过 `check-result` 后以当前 revision `signal`，再读取最新状态。

Stage Result 的 `skills[]` 只包含 Workflow 声明的 Runner 回执。动态选择的领域 Skill 或 Tool、选择理由、执行状态和证据全部进入 `execution-trace/v1`。遇到 Human Gate、publish、生产写入或破坏性操作时，Runner 停止并等待用户对具体动作明确授权。

### Kit Lifecycle

Kit Lifecycle 只管理本包安装到仓库的文件和生命周期状态：

- `doctor`、版本与账本检查始终只读；
- `upgrade`、`sync`、`recover` 和 `uninstall` 先给出计划，只有用户明确授权具体操作和目标后才 Apply；
- 保留 PID lock、canonical recovery、managed/seed ownership 和冲突时原子停止；
- 存在 active Work Item 时拒绝 Lifecycle Apply；
- 不推进 Workflow Stage，不选择领域能力，不编码、测试或生成 Stage Evidence。

消费者仍使用自己的 Skill Manager 管理本地领域 Skills。CLI、Workflow Runner 和 Harness 都不负责安装、更新、失效检查、鉴权或远程健康探测；Agent Host 只需把消费者已具备的能力暴露给当前会话。

## 运行要求

- Node.js 22 或更高版本；
- Git；
- 位于现有 Git 仓库中的目标目录；

Docker 不是 CLI 的运行依赖。npm 仅用于获取或安装包；生产代码只使用 Node.js 内置模块。

## 安装

直接运行最新 npm 版本：

```sh
npx --yes ai-vibe-demo-kit@latest version --json
```

这里的 `@latest` 由 npm/npx 解析。已安装的旧 CLI 也可以用 `sync` 查询并固定远程最新版。

也可以全局安装：

```sh
npm install --global ai-vibe-demo-kit
ai-vibe-demo-kit version --json
```

## 快速开始

### 1. 初始化

在目标 Git 仓库中运行：

```sh
npx --yes ai-vibe-demo-kit@latest init --target . --json
```

`init` 会立即应用，不需要 `--apply`。存在被占用、被修改或不安全的目标路径时，初始化返回 conflict 并保持零写入。

初始化后的主要投影：

```text
harness
.harness/
├── manifest.json
├── runtime/
├── shared/
└── ...
.agents/
└── skills/
    ├── workflow-runner/
    └── kit-lifecycle/
source/
├── .agents/skills.sources.json
├── knowledge/
├── rules/
├── specs/
├── workflows/
├── agents_template.md
├── ai_environment_template.md
├── coding_agent_rules_template.md
└── project-template.yml
```

### 2. 检查安装状态

```sh
npx --yes ai-vibe-demo-kit@latest doctor --target . --json
./harness check --json
./harness status --json
```

`doctor` 区分 Runtime 和 Governance 就绪状态。文件安装成功只代表 Runtime 可以运行，不代表项目事实、环境和治理规则已经填写完成。

### 3. 提升项目治理模板

仅在目标文件不存在时创建有效治理文件；已有文件必须人工审查和合并：

```sh
[ -e AGENTS.md ] || cp source/agents_template.md AGENTS.md
[ -e AI_ENVIRONMENT.md ] || cp source/ai_environment_template.md AI_ENVIRONMENT.md
[ -e project.yml ] || cp source/project-template.yml project.yml
```

随后：

1. 填完全部占位符；
2. 根据真实代码、配置、环境探测或负责人确认项目事实；
3. 把 `source/coding_agent_rules_template.md` 合并到 Coding Agent 实际加载的规则位置；
4. 创建或补全项目的 `ARCHITECTURE.md`；
5. 执行环境与 Runtime 检查。

```sh
./harness check-environment --file AI_ENVIRONMENT.md --json
./harness check --json
```

Kit 不自动选择 Coding Agent 的全局规则目录，也不覆盖已有的 `AGENTS.md`、`AI_ENVIRONMENT.md`、`project.yml` 或架构文档。

## Distribution CLI

```text
ai-vibe-demo-kit init [--target <path>] [--json]
ai-vibe-demo-kit upgrade [--target <path>] [--apply] [--json]
ai-vibe-demo-kit sync [--target <path>] [--apply] [--json]
ai-vibe-demo-kit doctor [--target <path>] [--json]
ai-vibe-demo-kit uninstall [--target <path>] [--apply] [--json]
ai-vibe-demo-kit recover [--target <path>] --strategy <resume|rollback> [--apply] [--json]
ai-vibe-demo-kit version [--json]
```

| 命令 | 默认行为 | 写入条件 |
| --- | --- | --- |
| `init` | 规划并立即初始化 | fresh init 无冲突 |
| `upgrade` | 只输出计划 | 增加 `--apply` |
| `sync` | 查询 npm latest 并委派该精确版本输出升级计划 | 增加 `--apply` |
| `doctor` | 只读检查 | 从不写入 |
| `uninstall` | 只输出计划 | 增加 `--apply` |
| `recover` | 计划 resume 或 rollback | 使用 canonical transaction 指定的精确命令 |
| `version` | 输出当前包版本和能力 | 从不写入 |

所有命令都支持 `--json`，适合 Agent 和 CI 消费。退出码非零时应读取结构化的 `status`、`errors` 和 `nextActions`，不能只依据终端文本推断下一步。

### 升级

先选定并固定要应用的包版本。计划和 Apply 应使用同一个版本：

```sh
npx --yes ai-vibe-demo-kit@<version> upgrade --target . --json
npx --yes ai-vibe-demo-kit@<same-version> upgrade --target . --apply --json
```

升级来源是命令中选择的 npm 包。需要自动发现最新版时使用：

```sh
ai-vibe-demo-kit sync --target . --json
ai-vibe-demo-kit sync --target . --apply --json
```

`sync` 以 npm `latest` 为权威来源，拒绝自动降级和隐式初始化。默认只计划；Apply 仍由固定版本的 `upgrade` canonical transaction 执行。

### 卸载

```sh
npx --yes ai-vibe-demo-kit@<installed-version> uninstall --target . --json
npx --yes ai-vibe-demo-kit@<installed-version> uninstall --target . --apply --json
```

卸载只处理安装账本拥有的内容。已修改文件、不安全路径和非空的安装器创建目录会被保留或形成冲突，不会被静默删除。

### 中断恢复

每次 Apply 都先写入 canonical maintenance transaction，再执行文件变更和账本提交。进程中断后：

1. 读取命令响应中的 `nextActions`；
2. 使用其中固定的包版本、目标路径和策略；
3. 选择 `resume` 或 `rollback`；
4. 先查看恢复计划，再执行带 `--apply` 的精确命令。

不要用另一个包版本解释已有 transaction，也不要手工修改 `.git/harness/maintenance.json`。

## 文件 Ownership

Distribution Manifest 使用三种 Ownership：

| Kind | 用途 | 升级行为 |
| --- | --- | --- |
| `managed` | Runtime、Workflow、规则、知识和其他上游资产 | 内容必须与已安装版本一致；第三状态或本地修改会阻止安全升级 |
| `seed` | 项目需要自行填写的模板 | 未修改时可更新；修改后保留本地版本并报告 warning |
| `package-only` | 只供 Distribution CLI 使用的实现和 Manifest | 不投影到目标仓库 |

Lifecycle 还有以下保护：

- 拒绝把 Lifecycle 目标设置为 Symlink；
- 所有路径必须保持在目标 Git 仓库内；
- Runtime 和 Distribution 共用 Git 私有 mutation lock；
- 存在活动 Harness Work Item 时拒绝 Lifecycle Apply；
- 新文件、旧文件删除和安装账本提交属于同一可恢复事务；
- `upgrade` 和 `uninstall` 默认只计划，必须显式 `--apply`。

安装账本位于 `.harness/install-lock.json`。活动 Workflow 状态、历史和 maintenance journal 位于 `.git/harness/`，不会进入正常工作树。

## Source

`source/` 是随 npm 包版本发布的 Coding Agent 控制资料：

| 路径 | 内容 | Ownership |
| --- | --- | --- |
| `source/.agents/skills.sources.json` | 推荐的外部 Skill 仓库、路径、跟踪分支和排除规则 | `managed` |
| `source/knowledge/` | 知识索引、渐进路由、应用模板、ADR 和知识模板 | `managed` |
| `source/rules/` | 测试、安全和 Git 规则 | `managed` |
| `source/specs/` | Specification 模板 | `managed` |
| `source/workflows/` | 默认 Workflow、Runner Catalog、Stage Result、execution trace 和 verification report 契约 | `managed` |
| `source/agents_template.md` | 根级 `AGENTS.md` 模板 | `seed` |
| `source/ai_environment_template.md` | 根级环境清单模板 | `seed` |
| `source/coding_agent_rules_template.md` | Coding Agent 通用编码规则模板 | `seed` |
| `source/project-template.yml` | 根级 `project.yml` 模板 | `seed` |

`source/.agents/skills.sources.json` 不包含 Skill 源文件、resolved commit、实体清单或物化状态。CLI 只把它作为版本化推荐声明随 Source 分发；是否采用、解析或安装由消费方自行决定，本项目不提供对应管理流程。

项目专属的有效治理文件位于 Lifecycle 管理的上游 Source 之外。不要直接修改 Manifest 登记为 `managed` 的文件；升级会把这类修改视为冲突。

## Harness Runtime

Harness 是安装到目标仓库的确定性控制层：

```text
Workflow (What)
  -> Stage Result validation
  -> Evidence / Policy / Revision checks
  -> Automatic transition or Human Gate
  -> Revisioned control state

Workflow Runner (How)
  -> Agent selects exposed domain Skills / Tools
  -> Agent executes coding and tests
  -> execution-trace/v1 records decisions and evidence
```

常用命令：

```sh
./harness version --json
./harness check --json
./harness check-architecture --file project.yml --json
./harness check-environment --file AI_ENVIRONMENT.md --json
./harness start --workflow source/workflows/workflow-default.json --intent "<goal>" --json
./harness status --json
./harness check-result --workflow <workflow.json> --stage <stage> --file <stage-result.json> --json
./harness signal --revision <revision> --file <stage-result.json> --json
./harness decide --revision <revision> --action <action> --reason "<reason>" --json
```

Harness 只校验 Workflow 和 Agent 提交的 Evidence。Workflow Runner 指引 Agent 执行当前 Stage；领域 Skill、测试、Shell、Git 操作、业务写入和外部系统调用仍由 Agent、CI 或人工实际执行，结果通过 Stage Result 和 `execution-trace/v1` 回传。

Human Gate 的 approve、reject、pause、redirect、override 和 abort 必须由被授权的人明确决定。进入 Gate 或 Policy Block 时，`signal --json` 可能已经持久化结果，同时返回退出码 `1`；应以响应中的 `applied`、`requiresHumanAction` 和新 Revision 为准。

## 三种就绪状态

| 状态 | 含义 | 最低检查 |
| --- | --- | --- |
| Runtime-ready | Harness Runtime、默认 Workflow 和 Runtime contract 可加载 | `./harness check --json` |
| Governance-ready | 有效治理文件已创建，项目事实和环境已确认，没有未知占位符 | `doctor`、`check-environment`、`check` |
| Completion-evidence-ready | acceptance Stage Result 和 `verification-report/v1` 可以通过无状态完成检查 | `check-result --require-complete` |

`check-result` 不读取本地控制历史，也不证明 Human Gate 已批准。`completionEligible: true` 只说明结果结构、Policy 和完成 Transition 满足要求。

## 默认 Workflow

0.6.0 默认 Workflow v4 位于 `source/workflows/workflow-default.json`，`workflow-template.json` 是相同契约的兼容镜像。Runtime 同时接受 Workflow schema v2 和 v3；v3 允许 Exit Condition 通过 `requiredForOutcomes` 只约束指定 outcome。默认流程包含：

1. `alignment`：冻结意图、验收标准、风险和环境事实；
2. `implementation`：只实现已确认范围，并强制提交 `test-impact/v1` 与当前验证证据；
3. `acceptance`：验证结果、清理状态、风险和交接证据。

三个 Stage 都只声明一个 required `workflow-runner` 回执和一个 required `execution-trace` Artifact。implementation 负责编码、focused tests 与 `test-impact/v1`，不增加独立 Test Stage；acceptance 负责完整验证与 cleanup。动态领域能力只记录在 execution trace，不能作为未声明回执写入 Stage Result。

`skills.sources.json` 中的外部 Skill 只是消费者可采用的推荐来源。Agent Host 负责把消费者本地 Skills 与 Tools 暴露给会话；Runner 不扫描来源文件，Harness 也不判断这些能力是否安装、失效、已鉴权或远程可用。

## 已知实现边界

以下行为明确属于消费方或独立工具：

1. 根据 `skills.sources.json` 解析、下载、更新或鉴权外部 Skill；
2. 由 Agent Host 向会话暴露消费者本地 Skills 与 Tools；
3. 实际执行测试、业务命令和清理动作；
4. 将 Source 模板提升为项目根级有效治理文件。

Phase 2 的 planner / implementer / reviewer Orchestrator、OCI 隔离和跨 Agent handoff 仍只保留在 RFC 中。

另有一个已知分发契约差异：下游模板引用 `source/manifest.json`，当前 Distribution Manifest 将自身标记为 `package-only`，所以该文件不会被初始化到目标仓库。目标项目不应假定该路径已经存在；后续应拆分 Package Distribution Manifest 与可下发的 Source Manifest，或移除模板中的该引用。

## 本地开发

仓库没有需要安装的生产依赖。使用 Node.js 22+：

```sh
npm test
npm run check:architecture
npm run check:skill
npm run check:distribution
npm run pack:dry
```

验证范围：

- Runtime 或控制状态：`node --test test/runtime/*.test.mjs`
- Lifecycle 或 Distribution CLI：相关 `test/distribution/*.test.mjs`
- 发行内容一致性：`npm run check:distribution`
- 打包文件清单：`npm run pack:dry`

发布是人工高风险操作；项目不会自动 publish、push、修改 Git 历史或写入生产系统。

## License

MIT
