# AI Native Harness Overlay 重构计划

## 1. 计划摘要

本计划把 `ai-vibe-demo-kit` 从“Overlay 安装器 + 开发流程引擎”收缩为一个可以复制到现有代码库的 **AI Native Harness Overlay**。

目标用户已经拥有可运行或正在建设的本地项目。用户将本仓库的 `overlay/` 内容复制到目标项目后，即可获得 Agent 冷启动索引、规格与决策记忆、阶段证据、反馈检查和经验回写入口。Overlay 不创建应用，不规定技术栈，不生成业务文档，也不替用户推进开发阶段。

计划依据：

- `/Users/kanehua/project/kane_echoes/inbox/article/技术/AI原生开发系统.md`
- `/Users/kanehua/project/kane_echoes/inbox/download/AI原生项目结构设计.md`
- 当前仓库 `README.md`、`packages/cli/src/index.ts`、`templates/vibe-coding/` 和 `.agents/`

## 2. 产品定义

> AI Native Harness Overlay 是一层可复制到现有代码库的 Agent 开发装甲。它为已有项目补充上下文恢复、规格管理、阶段证据、反馈验证和经验回写能力，不生成或接管应用本身。

组合关系：

```text
已有项目
  + Harness Overlay
  = 可以被冷启动 Agent 初步理解、约束、执行和验证的项目
```

Harness 提供四层装甲：

| 装甲层 | 解决的问题 | 主要载体 |
| --- | --- | --- |
| 上下文装甲 | Agent 能否恢复项目事实和当前工作环境 | `AGENTS.md`、`HARNESS.md`、`SPECS/`、Source Register |
| 流程装甲 | Agent 能否识别当前阶段、允许动作和人工放行证据 | `workflow-state.json`、`workflow/`、`tasks/` |
| 反馈装甲 | Agent 能否看到确定性错误并完成风险匹配验证 | `scripts/harness-check.mjs`、Hooks、项目验证命令 |
| 恢复装甲 | 失败后能否理解历史、清理数据并回退 | `memory/`、ADR、验证报告、清理与回退记录 |

## 3. 目标与非目标

### 3.1 目标

1. 将 Overlay 变成仓库唯一交付主体。
2. 用户可以把 `overlay/` 复制到已有 Git 项目，并在一次最小适配后开始 Agent 开发。
3. 新会话只读目标仓库即可回答六个问题：项目是什么、走到哪一步、允许做什么、按什么流程做、如何验证、经验写到哪里。
4. 上下文闭环与执行闭环同时存在；门禁检查证据，不伪造产品已经可用的结论。
5. Overlay 不绑定 frontend、backend、数据库、框架、语言、包管理器或部署平台。
6. Overlay 文件全部可读、可审计、可由目标项目直接修改。
7. 删除中央 CLI、Markdown renderer、流程生成命令和全量 Skills 复制机制。

### 3.2 非目标

- 不创建新项目或业务目录。
- 不选择或安装前端、后端、数据库模板。
- 不生成需求、三个方案、SDD、API 或数据库契约内容。
- 不自动确认需求、选择方案、推进阶段或伪造用户原话。
- 不提供模板自动升级、三方合并或迁移平台。
- 不替目标项目决定测试金字塔、CI 平台或发布流程。
- 不因目录或文档存在就宣称实现已经通过验收。
- 不把 43 个通用 Skills 全量复制到每个目标项目。

## 4. 核心架构决策

### ADR-1：`overlay/` 是唯一复制单元

仓库根目录用于开发和验证 Overlay；用户只复制 `overlay/` 内容。根目录的 `.git`、开发依赖、测试夹具和维护文档不会进入目标项目。

### ADR-2：复制后文件归目标项目所有

本项目不维护自动更新器。复制完成后，目标项目可以按真实情况修改 `AGENTS.md`、规格、规则和脚本。未来版本更新通过 Git diff 和人工选择吸收，避免重造模板生命周期平台。

### ADR-3：项目本地检查代替中央流程引擎

Overlay 内保留一个无第三方依赖的 `scripts/harness-check.mjs`。它只读取目标仓库的事实和证据，提供 `context`、`gates`、`evidence`、`all` 四类确定性检查。

它不创建文档、不修改状态、不执行阶段推进，也不判断需求和设计的语义质量。

### ADR-4：状态显式，推进资格由证据共同决定

`workflow-state.json` 保留当前阶段和历史记录；阶段检查同时要求：

1. 当前阶段文档存在并满足结构约定；
2. 状态允许当前动作；
3. 需要人工判断的节点存在用户确认原话；
4. 实现或验收节点存在与风险匹配的验证证据。

状态文件不会单独构成“可以继续”的充分条件。

### ADR-5：机器配置和人类说明各有唯一职责

`.harness/config.json` 保存机器需要执行或检查的项目命令和关键路径；`SPECS/ARCHITECTURE.md` 解释技术栈、模块边界和这些命令的适用条件。Markdown 不复制 JSON 的完整值，只引用机器配置，避免双事实源。

### ADR-6：Skills 只保留 Harness 专属最小集

默认 Overlay 只保留直接维护双闭环的少量 Skills，例如需求证据整理、Source Register、验证收尾和经验回写。通用实现、前端、后端、安全、Playwright 等能力由用户环境或后续可选能力包提供。

## 5. 目标目录

```text
kit-test/
├── overlay/                              # 唯一交付主体
│   ├── AGENTS.md                         # 冷启动索引和最高频门禁
│   ├── HARNESS.md                        # Harness 地图、边界和接入说明
│   ├── workflow-state.json               # 当前阶段的唯一机器状态源
│   ├── .harness/
│   │   ├── config.json                   # 项目验证命令、关键路径和清理入口
│   │   └── manifest.json                 # Overlay 版本和文件职责说明
│   ├── .agents/
│   │   ├── skills.json                   # 最小 Harness Skill 路由
│   │   ├── skills/
│   │   │   ├── source-register/
│   │   │   ├── verification-closeout/
│   │   │   └── memory-writeback/
│   │   └── hooks/
│   │       └── check-harness.mjs
│   ├── workflow/
│   │   ├── README.md
│   │   ├── requirements.template.md
│   │   ├── solution-options.template.md
│   │   ├── solution-selected.template.md
│   │   └── implementation-ready.template.md
│   ├── SPECS/
│   │   ├── README.md
│   │   ├── ARCHITECTURE.md
│   │   └── FEATURES/
│   │       └── .gitkeep
│   ├── tasks/
│   │   ├── README.md
│   │   ├── backlog.template.md
│   │   └── sprint.template.md
│   ├── memory/
│   │   ├── decisions.md
│   │   └── adr/
│   │       └── .gitkeep
│   ├── rules/
│   │   ├── core.md
│   │   ├── project-structure.md
│   │   ├── ai-implementation.md
│   │   ├── testing.md
│   │   ├── security.md
│   │   └── git.md
│   └── scripts/
│       └── harness-check.mjs
├── tests/
│   ├── fixtures/
│   └── harness-check.test.mjs
├── docs/
│   ├── plans/
│   └── ideation/
├── README.md
└── LICENSE
```

说明：

- `HARNESS.md` 替代容易被理解为应用模板地图的 `TEMPLATE.md`。
- 根目录可以保留仅用于维护 Overlay 的测试配置，但不得成为目标项目依赖。
- Overlay 不包含 `package.json`、锁文件、应用源码或第三方依赖。

## 6. Overlay 接入流程

目标项目必须已经由 Git 管理。复制前先提交、暂存或备份现有修改，保证覆盖可以恢复。

```sh
git clone <harness-repository> /tmp/ai-native-harness
cp -R /tmp/ai-native-harness/overlay/. /path/to/existing-project/
cd /path/to/existing-project
git status --short
git diff
node scripts/harness-check.mjs context
```

首次适配顺序：

1. 审查复制产生的所有冲突和覆盖。
2. 合并已有 `AGENTS.md`，保留项目原有高优先级约束。
3. 填写 `HARNESS.md` 与 `SPECS/ARCHITECTURE.md` 中的项目事实。
4. 在 `.harness/config.json` 登记真实运行、静态检查、测试、关键用户路径、清理和恢复命令。
5. 执行 `node scripts/harness-check.mjs all`。
6. 修复全部结构错误；项目专属命令暂不可运行时，显式记录缺口、原因和风险。
7. 形成一次独立、可回退的 Harness 接入提交。

## 7. Harness 检查契约

### 7.1 `context`

验证新会话六问的必要入口是否存在：

- 项目定义和地图已填写；
- 当前状态合法；
- 当前允许动作可以推导；
- 开发流程有明确入口；
- 验证命令已经登记；
- 经验回写位置存在；
- 不允许保留关键占位符。

### 7.2 `gates`

验证阶段和人工放行证据：

- `workflow-state.json` 的阶段和允许转换一致；
- 当前阶段对应文档存在；
- 需求确认、方案选择和实现放行节点包含用户原话、时间和文档引用；
- Agent 不能仅通过修改一个布尔值绕过文档证据；
- 当前阶段以后的产物不会被误判为已经生效。

### 7.3 `evidence`

验证执行闭环是否具备可审计入口：

- 当前需求、方案和 Feature Spec 维护 Source Register；
- `.harness/config.json` 中至少登记与项目相符的静态检查和测试入口；
- 用户可见行为变更登记关键用户路径；
- 验证报告记录执行命令、结果、时间和未覆盖风险；
- 存在测试数据清理和恢复说明；
- 重要失败可以定位到设计、规格或实现事实源。

### 7.4 `all`

依次运行 `context`、`gates` 和 `evidence`，输出 Agent 可读取的结构化错误：

```text
ERROR <check-id> <path>: <problem>
REPAIR: <deterministic next action>
```

检查器退出码：

- `0`：Harness 结构和当前阶段证据通过；
- `1`：存在必须修复的问题；
- `2`：配置或状态文件无法解析。

通过 Harness 检查不代表应用已经验收通过。真实构建、测试和用户路径结果仍以目标项目的验证报告为准。

## 8. 文件职责和冲突策略

| 文件类型 | 初次复制策略 | 复制后所有权 | 后续更新方式 |
| --- | --- | --- | --- |
| `AGENTS.md`、`HARNESS.md`、`SPECS/ARCHITECTURE.md` | 必须人工合并项目事实 | 目标项目 | 人工 diff |
| `workflow-state.json`、`workflow/*.md` | 新项目初始化；已有流程必须人工合并 | 目标项目 | 不自动覆盖 |
| `memory/`、生效中的 `SPECS/` | 只补缺失骨架 | 目标项目 | 不自动覆盖 |
| `*.template.md` | 可以采用新版模板 | 目标项目 | 人工选择替换 |
| `rules/` | 按项目适用性合并 | 目标项目 | 人工选择替换 |
| `.agents/skills/`、Hooks、`scripts/harness-check.mjs` | 可以整体审查后替换 | 目标项目 | 人工 diff |
| `.harness/manifest.json` | 记录来源版本和职责，不驱动更新 | 目标项目 | 随人工升级更新 |

Overlay 不实现自动冲突处理。Git 是覆盖审计和恢复机制；目标项目必须在复制前拥有可恢复基线。

## 9. 实施任务

### Phase 1：固定产品契约

#### Task 1：建立 Overlay 根契约

**Description:** 创建 `overlay/` 的顶层入口、来源清单和机器配置，固定“只覆盖 Harness 层”的产品边界。

**Acceptance criteria:**

- [ ] `overlay/HARNESS.md` 能解释产品定位、目录职责、接入步骤和非目标。
- [ ] `.harness/manifest.json` 标识 Overlay 版本及文件职责，不包含自动更新语义。
- [ ] `.harness/config.json` 有稳定 schema，并明确哪些字段必须由目标项目填写。

**Verification:**

- [ ] JSON 文件可由 Node.js 解析。
- [ ] 文档中不出现固定 frontend、backend、数据库或框架要求。
- [ ] 文档审查确认不存在项目创建、依赖安装或业务生成承诺。

**Dependencies:** None

**Files likely touched:**

- `overlay/HARNESS.md`
- `overlay/.harness/manifest.json`
- `overlay/.harness/config.json`

**Estimated scope:** Medium

#### Task 2：迁移冷启动索引和长期事实骨架

**Description:** 将通用 `AGENTS.md` 与 `SPECS/` 骨架迁入 `overlay/`，删除应用技术栈假设，保持 AGENTS 作为短索引。

**Acceptance criteria:**

- [ ] `AGENTS.md` 可以导航到状态、规格、规则、验证和经验入口。
- [ ] `SPECS/ARCHITECTURE.md` 只记录目标项目真实事实，并引用 `.harness/config.json` 的机器命令。
- [ ] Source Register 规则明确要求“无来源”也显式记录。

**Verification:**

- [ ] 新会话六问中的“项目是什么”和“如何验证”有唯一入口。
- [ ] `AGENTS.md` 保持索引职责，不复制规则全文。
- [ ] 全仓搜索无模板业务域和固定技术栈残留。

**Dependencies:** Task 1

**Files likely touched:**

- `overlay/AGENTS.md`
- `overlay/SPECS/README.md`
- `overlay/SPECS/ARCHITECTURE.md`
- `overlay/SPECS/FEATURES/.gitkeep`

**Estimated scope:** Medium

#### Task 3：迁移过程、任务和记忆骨架

**Description:** 将 `workflow/`、`tasks/` 和 `memory/` 按“过程、执行单元、长期经验”职责迁入 Overlay。

**Acceptance criteria:**

- [ ] workflow 模板包含 Source Register、用户确认证据和方案边界。
- [ ] task 模板要求小而可运行的切片、验证和回退边界。
- [ ] decisions 模板支持新决策覆盖旧决策的谱系。

**Verification:**

- [ ] 过程文档不被描述为长期生效契约。
- [ ] `SPECS/` 与 `workflow/` 的生命周期说明没有冲突。
- [ ] memory 模板包含 supersedes 或等价覆盖字段。

**Dependencies:** Task 1

**Files likely touched:**

- `overlay/workflow/`
- `overlay/tasks/`
- `overlay/memory/decisions.md`
- `overlay/memory/adr/.gitkeep`

**Estimated scope:** Medium（目录内机械迁移）

### Checkpoint A：Overlay 结构成立

- [ ] `overlay/` 可以单独复制，不依赖仓库根目录文件。
- [ ] 上下文闭环的事实、过程、状态和经验入口齐全。
- [ ] 不包含应用代码、应用包配置或技术栈目录。
- [ ] 人工审查产品边界后再进入检查器实现。

### Phase 2：建立项目本地反馈装甲

#### Task 4：实现 Context 检查

**Description:** 建立无第三方依赖的 Harness 检查器入口和 context 检查，验证六问所需的结构与配置。

**Acceptance criteria:**

- [ ] 支持 `node scripts/harness-check.mjs context`。
- [ ] 缺失文件、无效 JSON 和关键占位符分别输出稳定检查 ID。
- [ ] 每个错误都包含目标路径和可执行 Repair 建议。

**Verification:**

- [ ] 有效 fixture 退出码为 0。
- [ ] 缺失 AGENTS、ARCHITECTURE、config 的 fixture 退出码为 1。
- [ ] 损坏 JSON 的 fixture 退出码为 2。

**Dependencies:** Tasks 1-3

**Files likely touched:**

- `overlay/scripts/harness-check.mjs`
- `tests/harness-check.test.mjs`
- `tests/fixtures/valid-context/`
- `tests/fixtures/invalid-context/`

**Estimated scope:** Medium

#### Task 5：实现 Gate 检查

**Description:** 在同一检查器中增加阶段状态、文档前置条件和用户原话证据校验，不提供状态修改命令。

**Acceptance criteria:**

- [ ] 支持 `node scripts/harness-check.mjs gates`。
- [ ] 能发现跳阶段、状态与文档不一致、缺少用户原话和非法未来产物。
- [ ] 检查器不会创建或修改 `workflow-state.json`。

**Verification:**

- [ ] 六个合法阶段 fixture 全部通过。
- [ ] 每类篡改状态至少有一个失败测试。
- [ ] 测试前后 fixture 内容哈希一致，证明检查器只读。

**Dependencies:** Task 4

**Files likely touched:**

- `overlay/scripts/harness-check.mjs`
- `overlay/workflow-state.json`
- `tests/harness-check.test.mjs`
- `tests/fixtures/stages/`

**Estimated scope:** Medium

#### Task 6：实现 Evidence 检查

**Description:** 校验 Source Register、项目验证入口、关键用户路径、验证报告、数据清理和回退证据的结构完整性。

**Acceptance criteria:**

- [ ] 支持 `node scripts/harness-check.mjs evidence` 和 `all`。
- [ ] 验证级别随 `.harness/config.json` 中声明的风险和项目类型变化。
- [ ] 检查结果明确区分结构通过与应用验收通过。

**Verification:**

- [ ] 缺 Source Register、验证入口、清理记录和回退说明分别失败。
- [ ] 非 UI 项目不会被强制要求浏览器 E2E。
- [ ] 声明关键用户路径后，缺少对应验证证据会失败。

**Dependencies:** Tasks 4-5

**Files likely touched:**

- `overlay/scripts/harness-check.mjs`
- `overlay/.harness/config.json`
- `tests/harness-check.test.mjs`
- `tests/fixtures/evidence/`

**Estimated scope:** Medium

#### Task 7：增加 Agent Hook 适配

**Description:** 提供一个薄 Hook，在支持 Hooks 的 Agent 环境中调用项目本地 Harness 检查，不复制检查逻辑。

**Acceptance criteria:**

- [ ] Hook 只调用 `scripts/harness-check.mjs`，没有第二套门禁实现。
- [ ] 不支持 Hooks 的环境仍可通过 AGENTS 命令手动运行检查。
- [ ] Hook 失败输出完整透传给 Agent。

**Verification:**

- [ ] Hook 与直接执行检查器产生相同退出码。
- [ ] Hook 不修改工作流和项目文件。
- [ ] Hooks README 明确平台适配边界。

**Dependencies:** Tasks 4-6

**Files likely touched:**

- `overlay/.agents/hooks/check-harness.mjs`
- `overlay/.agents/hooks/README.md`
- `tests/harness-hook.test.mjs`

**Estimated scope:** Small

### Checkpoint B：双闭环可执行

- [ ] `context`、`gates`、`evidence`、`all` 全部有正反测试。
- [ ] 检查输出能被 Agent 直接读取并修复。
- [ ] Harness 检查器没有写操作和业务语义判断。
- [ ] 关键用户路径仍由目标项目真实运行，Harness 不产生虚假通过状态。

### Phase 3：删除脚手架和流程引擎

#### Task 8：移除中央 CLI

**Description:** 删除 `packages/cli`、bin 入口和与 CLI 相关的构建发布配置，使仓库不再提供项目创建或开发流程命令。

**Acceptance criteria:**

- [ ] 不再存在 `kit init/check/next/propose/options/sdd/stage/skills` 命令。
- [ ] 不再复制 `kit-runtime.mjs` 到目标项目。
- [ ] 根目录构建仅用于验证 Overlay，或在无必要时完全删除。

**Verification:**

- [ ] 全仓搜索不存在 CLI 命令承诺和 renderer 函数。
- [ ] `overlay/` 仍能独立完成 Harness 检查。
- [ ] 发布清单不包含 CLI dist。

**Dependencies:** Checkpoint B

**Files likely touched:**

- `packages/cli/`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`

**Estimated scope:** Medium（删除为机械变更）

#### Task 9：收缩 Skills 和路由

**Description:** 删除与 Harness 核心无关的全量 Skills，建立最小 Skill 索引，避免把通用能力库复制到每个项目。

**Acceptance criteria:**

- [ ] 默认 Skills 只服务 Source Register、验证收尾和经验回写。
- [ ] 不包含固定前端、后端、数据库或单一 Agent 平台假设。
- [ ] 每个保留 Skill 都有明确触发条件、输入和输出。

**Verification:**

- [ ] Skill 索引只引用真实存在的目录。
- [ ] Overlay 体积相对当前 `.agents` 显著下降。
- [ ] 删除任何通用 Skill 不影响 Harness 检查器运行。

**Dependencies:** Task 8

**Files likely touched:**

- `.agents/skills/`
- `.agents/skills.json`
- `overlay/.agents/skills/`
- `overlay/.agents/skills.json`

**Estimated scope:** Medium（批量删除与少量重写）

#### Task 10：重写公开说明

**Description:** 将 README 和使用示例统一改为 Harness Overlay 定位，删除脚手架、安装器和 npm CLI 叙述。

**Acceptance criteria:**

- [ ] README 首屏说明目标用户已有项目。
- [ ] 使用流程以复制 `overlay/`、审查 diff、填写项目事实和运行检查为主。
- [ ] 清楚说明复制前必须有可恢复 Git 基线。

**Verification:**

- [ ] README 中不存在 `npx ... init` 和中央流程命令。
- [ ] 新用户可以只按 README 完成一次接入演练。
- [ ] 文档明确 Harness 检查通过不等于应用验收通过。

**Dependencies:** Tasks 8-9

**Files likely touched:**

- `README.md`
- `overlay/HARNESS.md`
- `skills-list.md`

**Estimated scope:** Medium

### Checkpoint C：脚手架职责清零

- [ ] 仓库没有项目生成入口、npm bin 或流程生成器。
- [ ] `overlay/` 是唯一用户交付物。
- [ ] 全量 Skills 和项目内编译运行时已经删除。
- [ ] README、目录和实际行为一致。

### Phase 4：真实 Overlay 演练

#### Task 11：建立现有项目复制演练

**Description:** 创建一个带既有应用文件和既有 AGENTS 的 fixture，验证 Overlay 复制、人工合并和项目文件保护流程。

**Acceptance criteria:**

- [ ] 复制 Overlay 后既有应用源码和包配置保持不变。
- [ ] AGENTS 冲突会在 Git diff 中清晰出现并有合并说明。
- [ ] 首次适配完成后 `harness-check all` 通过。

**Verification:**

- [ ] 自动化 smoke test 比较复制前后的应用文件哈希。
- [ ] fixture 中不存在新生成的 frontend 或 backend 目录。
- [ ] 删除 Overlay 文件可以恢复到原始 fixture 状态。

**Dependencies:** Checkpoint C

**Files likely touched:**

- `tests/overlay-copy.test.mjs`
- `tests/fixtures/existing-project/`
- `tests/fixtures/expected-overlay/`

**Estimated scope:** Medium

#### Task 12：执行冷启动六问验收

**Description:** 使用一个没有口头背景的新 Agent 会话，只读取接入后的 fixture，验证 Harness 能否恢复工作环境。

**Acceptance criteria:**

- [ ] 六问每个答案都引用唯一仓库证据。
- [ ] Agent 能区分当前事实、历史过程和模板占位符。
- [ ] Agent 不会把 Harness 检查通过误报为应用已经验收。

**Verification:**

- [ ] 保存六问答案及文件引用作为审计报告。
- [ ] 对答不上来的问题回到对应事实源修复，再重新运行。
- [ ] 最终报告明确仍需运行的项目专属真实用户路径。

**Dependencies:** Task 11

**Files likely touched:**

- `tests/reports/cold-start-six-questions.md`
- `overlay/AGENTS.md`
- `overlay/HARNESS.md`
- `overlay/SPECS/ARCHITECTURE.md`

**Estimated scope:** Medium

#### Task 13：完成发布前审计

**Description:** 审计最终目录、体积、技术栈残留、检查器只读性和文档一致性，形成可回退提交。

**Acceptance criteria:**

- [ ] Overlay 不包含业务源码、依赖目录、锁文件、密钥或环境文件。
- [ ] 所有测试通过，工作区只包含本计划范围内的变更。
- [ ] 最终提交可以独立回退，不影响其他用户改动。

**Verification:**

- [ ] 运行全部 Harness 单元和复制演练测试。
- [ ] 搜索 frontend、backend、Vue、Fastify、MySQL 等历史假设。
- [ ] 检查 Overlay 文件清单和总体体积。
- [ ] 运行 `git diff --check` 和最终代码审查。

**Dependencies:** Tasks 11-12

**Files likely touched:**

- `README.md`
- `tests/`
- `overlay/.harness/manifest.json`

**Estimated scope:** Small

### Checkpoint D：完成

- [ ] 目标和非目标全部满足。
- [ ] Overlay 在已有项目上完成真实复制演练。
- [ ] 新会话六问全部有仓库证据。
- [ ] 上下文、门禁、验证、清理和回退形成闭环。
- [ ] 人工审查通过后形成独立提交。

## 10. 依赖关系

```text
Task 1 Overlay 契约
├── Task 2 冷启动与 SPECS
└── Task 3 workflow/tasks/memory
        │
        └── Checkpoint A
               │
               └── Task 4 context check
                      └── Task 5 gates check
                             └── Task 6 evidence check
                                    └── Task 7 Hook
                                           └── Checkpoint B
                                                  │
                                                  └── Task 8 删除 CLI
                                                         └── Task 9 收缩 Skills
                                                                └── Task 10 文档
                                                                       └── Checkpoint C
                                                                              │
                                                                              └── Task 11 复制演练
                                                                                     └── Task 12 六问验收
                                                                                            └── Task 13 发布审计
                                                                                                   └── Checkpoint D
```

可并行部分：

- Task 2 与 Task 3 可在 Task 1 完成后并行。
- Task 9 的 Skill 盘点可以与 Task 8 的 CLI 删除准备并行，但最终文件移动需顺序执行。
- Task 12 的验收脚本准备可以与 Task 11 的 fixture 准备并行，正式验收必须等待复制演练完成。

必须顺序执行：

- 检查契约必须先于删除中央 CLI，避免一次性失去可执行门禁。
- CLI 删除必须先于公开文档定稿，防止说明和实际行为错位。
- 复制演练必须先于六问验收。

## 11. 风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| 复制覆盖已有 `AGENTS.md` 或规格 | 高 | 强制干净 Git 基线；README 要求先审查 diff；项目事实文件必须人工合并 |
| Harness 检查器重新长成流程引擎 | 高 | 只允许只读检查；禁止 create、advance、render、install；对公开命令做边界测试 |
| 状态通过被误认为应用可用 | 高 | 输出和文档始终区分结构证据与真实验收；关键用户路径必须单独记录结果 |
| `.harness/config.json` 与 Markdown 漂移 | 中 | JSON 保存机器值，Markdown 只解释和引用；检查器验证引用入口 |
| Skills 收缩过度导致流程不可发现 | 中 | 保留 Harness 专属最小 Skills；AGENTS 提供明确手动流程；用六问测试验证可发现性 |
| Skills 和 Profile 再次膨胀 | 中 | 首版不做 Profile 注册表；新增能力必须证明跨项目复用且不属于业务模板 |
| 无自动升级导致模板改进难传播 | 中 | 接受人工 diff 作为当前产品边界；真实出现多项目升级成本后再单独评估生命周期工具 |
| 跨 Agent 平台 Hook 不兼容 | 中 | Harness 检查器保持普通 Node 命令；Hook 只做适配，AGENTS 保留手动入口 |
| Node.js 不是目标项目运行时 | 低到中 | Node 仅作为 Harness 自带零依赖执行环境；后续可评估 POSIX shell 兼容层，但首版维持单实现 |

## 12. 开放问题

以下问题不会阻塞计划评审，但应在 Task 1 前确认：

1. 产品最终名称是否使用 `AI Native Harness Overlay`，仓库名是否同步调整。
2. `workflow-state.json` 是否保留当前六阶段，或压缩为需求、实现、验收三个阶段。
3. `.harness/config.json` 是否允许登记多个等价命令，例如本地轻量验证与 CI 完整验证。
4. 首版是否保留三个 Harness 专属 Skills，还是只使用 AGENTS + Rules + Hooks。
5. `TEMPLATE.md` 是否直接改名为 `HARNESS.md`，以及是否保留兼容指针。

默认建议：

- 产品名使用 `AI Native Harness Overlay`。
- 首版保留现有六阶段，先减少实现变量；稳定后再评估阶段压缩。
- config 支持 `quick` 和 `full` 两组验证命令。
- 保留三个 Harness 专属 Skills。
- 改名为 `HARNESS.md`，不保留长期兼容副本，避免双事实源。

## 13. Definition of Done

重构完成需要同时满足：

- [ ] 仓库首屏定位为 Harness Overlay。
- [ ] `overlay/` 是唯一复制单元，可以独立工作。
- [ ] 已有项目的应用代码、包配置和目录不被生成或改写。
- [ ] 中央 CLI、npm bin、文档 renderer 和流程生成命令全部删除。
- [ ] Harness 检查器只读、零第三方依赖，并有稳定退出码和 Repair 输出。
- [ ] Context、Gate、Evidence 检查都有正反测试。
- [ ] 默认 Skills 收缩为 Harness 专属最小集。
- [ ] 新会话六问全部有唯一仓库证据。
- [ ] 关键用户路径、清理和回退仍由目标项目真实执行和记录。
- [ ] README 接入流程在既有项目 fixture 上演练通过。
- [ ] 不存在固定业务域或技术栈残留。
- [ ] 全部验证通过，最终变更可以独立审查和回退。

