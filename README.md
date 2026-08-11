# AI Vibe Demo Kit

AI Vibe Demo Kit 是一个零 npm 依赖的 Node.js CLI，用于把版本化的 Coding Agent Source 与可恢复的 Harness Runtime 分发到现有 Git 仓库，并通过 Workflow、Stage Result、Policy 和 Human Gate 控制任务推进。

当前版本已经实现安全的初始化、升级、卸载、恢复和确定性 Workflow 状态机。Source 的版本跟随当前执行的 npm 包版本；CLI 本身不查询 npm 最新版本、不拉取远程 Skill，也不执行 Skill 或测试。

## 解决什么问题

Coding Agent 项目通常需要同时维护：

- 可持续升级的知识、规则、规格、工作流和治理模板；
- 可验证的任务阶段、Evidence 和人工决策；
- 不覆盖项目本地修改的安装与升级机制；
- 中断后可以继续或回滚的文件事务。

本项目把这些职责拆成三个可独立理解的层：

```text
ai-vibe-demo-kit npm package
├── Distribution CLI
│   ├── init / upgrade / doctor
│   └── uninstall / recover / version
├── installed Harness Runtime
│   ├── Workflow 与 Stage Result 校验
│   ├── Revision、Policy、Gate 与人工决策
│   └── Git 私有控制状态
└── installed Source
    ├── Skill 远程源声明
    ├── knowledge / rules / specs / workflows
    └── Agent、环境、编码规则与项目模板
```

## 当前能力边界

| 能力 | 当前行为 |
| --- | --- |
| Source 分发 | 从当前 npm 包内的 `source/manifest.json` 安装完整版本化 Source |
| 最新版本选择 | 由 npm、npx 或操作者选择包版本；CLI 不查询 registry |
| 外部 Skill 来源 | `source/.agents/skills.sources.json` 只保存远程仓库声明 |
| Skill 安装与更新 | CLI 当前不 clone、resolve 或 materialize 外部 Skill |
| Skill 调用 | Workflow 声明 Required Skill；Harness 校验 Agent 提交的 Skill 回执 |
| Workflow 推进 | Harness 强制 Required Condition、Skill 回执、Policy、Revision 和 Gate |
| 测试与业务操作 | Harness 不执行测试、Shell、Git 提交、业务写入或外部系统操作 |
| 治理文件启用 | 模板安装到 `source/`；有效根级治理文件由维护者提升和填写 |
| Source 本地修改 | `managed` 内容要求保持上游一致；修改会阻止安全升级 |

## 运行要求

- Node.js 22 或更高版本；
- Git；
- 位于现有 Git 仓库中的目标目录；
- macOS 或 Linux；
- `arm64` 或 `x86_64`。

Docker 不是 CLI 的运行依赖。npm 仅用于获取或安装包；生产代码只使用 Node.js 内置模块。

## 安装

直接运行最新 npm 版本：

```sh
npx --yes ai-vibe-demo-kit@latest version --json
```

这里的 `@latest` 由 npm/npx 解析，可能访问网络。进入 CLI 后，Lifecycle 只读取该包内已经固定的 Manifest 和文件，不再发现远程最新版。

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
    └── ai-vibe-demo-kit/
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
ai-vibe-demo-kit doctor [--target <path>] [--json]
ai-vibe-demo-kit uninstall [--target <path>] [--apply] [--json]
ai-vibe-demo-kit recover [--target <path>] --strategy <resume|rollback> [--apply] [--json]
ai-vibe-demo-kit version [--json]
```

| 命令 | 默认行为 | 写入条件 |
| --- | --- | --- |
| `init` | 规划并立即初始化 | fresh init 无冲突 |
| `upgrade` | 只输出计划 | 增加 `--apply` |
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

升级来源是命令中选择的 npm 包。CLI 不会在运行时把 `<version>` 自动替换为 registry 最新版本。

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
| `source/.agents/skills.sources.json` | 默认外部 Skill 仓库、路径、跟踪分支和排除规则 | `managed` |
| `source/knowledge/` | 知识索引、渐进路由、应用模板、ADR 和知识模板 | `managed` |
| `source/rules/` | 测试、安全和 Git 规则 | `managed` |
| `source/specs/` | Specification 模板 | `managed` |
| `source/workflows/` | 默认 Workflow、Skill Catalog、Stage Result 和 verification report 契约 | `managed` |
| `source/agents_template.md` | 根级 `AGENTS.md` 模板 | `seed` |
| `source/ai_environment_template.md` | 根级环境清单模板 | `seed` |
| `source/coding_agent_rules_template.md` | Coding Agent 通用编码规则模板 | `seed` |
| `source/project-template.yml` | 根级 `project.yml` 模板 | `seed` |

`source/.agents/skills.sources.json` 不包含 Skill 源文件。当前 CLI 只分发并校验这份声明；远程仓库解析、clone、更新和 `.agents/skills/` 物化仍需独立工具或人工流程。

项目专属的有效治理文件位于 Lifecycle 管理的上游 Source 之外。不要直接修改 Manifest 登记为 `managed` 的文件；升级会把这类修改视为冲突。

## Harness Runtime

Harness 是安装到目标仓库的确定性控制层：

```text
Workflow
  -> Stage Result validation
  -> Required Condition / Skill receipt checks
  -> Policy evaluation
  -> Automatic transition or Human Gate
  -> Revisioned control state
```

常用命令：

```sh
./harness version --json
./harness check --json
./harness check-environment --file AI_ENVIRONMENT.md --json
./harness start --workflow source/workflows/workflow-template.json --intent "<goal>" --json
./harness status --json
./harness check-result --workflow <workflow.json> --stage <stage> --file <stage-result.json> --json
./harness signal --revision <revision> --file <stage-result.json> --json
./harness decide --revision <revision> --action <action> --reason "<reason>" --json
```

Harness 只校验 Workflow 和 Agent 提交的 Evidence。Skill、测试、Shell、Git 操作、业务写入和外部系统调用由 Agent、CI 或人工执行，结果再通过 Stage Result 回传。

Human Gate 的 approve、reject、pause、redirect、override 和 abort 必须由被授权的人明确决定。进入 Gate 或 Policy Block 时，`signal --json` 可能已经持久化结果，同时返回退出码 `1`；应以响应中的 `applied`、`requiresHumanAction` 和新 Revision 为准。

## 三种就绪状态

| 状态 | 含义 | 最低检查 |
| --- | --- | --- |
| Runtime-ready | Harness Runtime、默认 Workflow 和 Runtime contract 可加载 | `./harness check --json` |
| Governance-ready | 有效治理文件已创建，项目事实和环境已确认，没有未知占位符 | `doctor`、`check-environment`、`check` |
| Completion-evidence-ready | acceptance Stage Result 和 `verification-report/v1` 可以通过无状态完成检查 | `check-result --require-complete` |

`check-result` 不读取本地控制历史，也不证明 Human Gate 已批准。`completionEligible: true` 只说明结果结构、Policy 和完成 Transition 满足要求。

## 默认 Workflow

默认 Workflow 位于 `source/workflows/workflow-template.json`，包含：

1. `alignment`：冻结意图、验收标准、风险和环境事实；
2. `implementation`：只实现已确认范围并保留验证证据；
3. `acceptance`：验证结果、清理状态、风险和交接证据。

当前默认 Skill Catalog 只内置 `ai-vibe-demo-kit` 控制 Skill，三个 Stage 都通过 Required Skill 回执引用它。`skills.sources.json` 中声明的外部 Skill 尚未自动进入 Catalog，也未自动绑定到具体 Stage。

## 已知实现边界

以下行为当前需要显式外部流程：

1. 发现 npm 最新版本，并保证 plan 与 apply 使用同一固定版本；
2. 根据 `skills.sources.json` 解析、下载和更新外部 Skill；
3. 把外部 Skill 注册到 `skills-list.json` 并绑定 Workflow Stage；
4. 实际执行 Skill、测试、业务命令和清理动作；
5. 将 Source 模板提升为项目根级有效治理文件。

另有一个已知分发契约差异：下游模板引用 `source/manifest.json`，当前 Distribution Manifest 将自身标记为 `package-only`，所以该文件不会被初始化到目标仓库。目标项目不应假定该路径已经存在；后续应拆分 Package Distribution Manifest 与可下发的 Source Manifest，或移除模板中的该引用。

## 本地开发

仓库没有需要安装的生产依赖。使用 Node.js 22+：

```sh
npm test
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