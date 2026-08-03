# AI Native Harness Overlay

AI Native Harness Overlay 是一层可复制到现有代码库的 Agent 开发装甲。它为已有项目补充上下文恢复、规格管理、阶段证据、反馈验证和经验回写能力。

本目录只覆盖 Harness 层：不创建应用，不规定技术栈，不生成业务文档，不替用户推进开发阶段。

```text
已有项目
  + Harness Overlay
  = 可以被冷启动 Agent 初步理解、约束、执行和验证的项目
```

## 四层装甲

| 装甲层 | 解决的问题 | 主要载体 |
| --- | --- | --- |
| 上下文装甲 | Agent 能否恢复项目事实和当前工作环境 | `AGENTS.md`、`HARNESS.md`、`SPECS/`、Source Register |
| 流程装甲 | Agent 能否识别当前阶段、允许动作和人工放行证据 | `workflow-state.json`、`workflow/`、`tasks/` |
| 反馈装甲 | Agent 能否看到确定性错误并完成风险匹配验证 | `scripts/harness-check.mjs`、Hooks、项目验证命令 |
| 恢复装甲 | 失败后能否理解历史、清理数据并回退 | `memory/`、ADR、验证报告、清理与回退记录 |

## 目录职责

```text
.
├── AGENTS.md              # 冷启动索引和高频门禁
├── HARNESS.md             # 本文件：Harness 地图、边界和接入说明
├── workflow-state.json    # 当前阶段的唯一机器状态源
├── .harness/
│   ├── config.json        # 机器配置：验证命令、关键路径、报告绑定、清理和恢复入口
│   ├── manifest.json      # Overlay 版本和文件职责说明（不驱动自动更新）
│   └── verification-report.json # full 验证生成的当前机器报告（初始不存在）
├── .agents/               # Skill catalog 与阶段路由、外部来源/锁、Hook 适配和 MCP 外部连接声明
├── workflow/              # 本轮需求、方案和放行过程
├── SPECS/                 # 长期有效的项目事实、唯一契约来源和 feature spec
├── tasks/                 # 当前执行单元及人类可读验证摘要
├── memory/                # 决策谱系和 ADR
├── rules/                 # 按主题加载的工程约束
└── scripts/
    ├── harness-check.mjs  # 只读检查器及候选状态 preflight
    ├── harness-runtime.mjs# 检查器与验证器共享的报告/指纹契约
    ├── harness-verify.mjs # 实际执行验证、关键路径和清理，生成机器报告
    ├── harness-stage.mjs  # 候选状态预检通过后原子推进
    └── skills-sync.mjs    # 外部 Skills 同步 CLI：默认按 lock 锁定恢复，--update 解析 track 生成新 lock
```

应用源码、测试、部署和基础设施目录保持原样，由目标项目继续拥有。

## 接入流程

前提：目标项目已经由 Git 管理。复制前先提交、暂存或备份现有修改，保证覆盖可以恢复。

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
3. 填写 `HARNESS.md` 相关章节与 `SPECS/architecture.md` 中的项目事实。
4. 在 `.harness/config.json` 登记可执行的静态检查、测试、契约、关键路径和清理步骤，并配置报告有效期与工作区指纹。
5. 外部 Skills：复制后先执行 `node scripts/skills-sync.mjs` 按已提交的 lock 恢复锁定版本；需要上游最新版时执行 `node scripts/skills-sync.mjs --update` 并审查 lock diff。`.agents/skills.json` 只引用已同步的真实 Skill。
6. 按 `.agents/hooks/README.md` 在目标平台注册会话启动、实现前和提交前阻断点；平台不支持 Hook 时登记对应人工命令节点。
7. 在 `.agents/mcp.json` 登记 Agent 可用的 MCP 外部连接并同步到平台配置；无外部连接时保持空 `mcpServers`，文件本身保留。
8. 执行 `node scripts/harness-check.mjs all`。
9. 修复全部结构错误；命令暂不可运行视为未完成，不用说明文字代替执行结果。
10. 形成一次独立、可回退的 Harness 接入提交。

## Skill 路由

`.agents/skills.json` v2 是仓库内唯一 Skill catalog 与路由策略源。它按 Work Item 类型、阶段、风险、UI 属性、Slice 状态、测试基础设施和触发事件选择同一阶段内的最小 Skill DAG；同优先级多路由直接失败。它不保存当前状态、不复制生命周期或 Slice `dependsOn`，也不自动执行 Skill。

```sh
node scripts/harness/cli.mjs skills route --type feature --stage requirements-draft --risk-level high --json
node scripts/harness/cli.mjs skills route --slice <slice-id> --trigger command-failed --json
```

第一条命令可在 v2 状态迁移前显式检查路由；第二条从 active Work Item 与 stateRef 读取真实类型、阶段、风险和 Slice 状态。测试与 UI 验证提示由 `policies` 返回，真实命令和关键路径仍以 `.harness/config.json` 为准。

## 检查契约

`scripts/harness-check.mjs` 是唯一检查入口，无第三方依赖，只读取仓库事实，不创建文档、不修改状态、不推进阶段。

```sh
node scripts/harness-check.mjs context   # 冷启动六问所需的入口和占位符
node scripts/harness-check.mjs gates     # 阶段状态、文档前置和用户原话证据
node scripts/harness-check.mjs evidence  # Source Register、验证入口、报告、清理和回退
node scripts/harness-check.mjs commit    # 实现任务收尾：工作区不得遗留未提交改动
node scripts/harness-check.mjs all       # context、gates、evidence 依次执行
```

实际反馈闭环由验证器执行：

```sh
node scripts/harness-verify.mjs quick --sprint tasks/sprint-01.md # 迭代反馈
node scripts/harness-verify.mjs full --sprint tasks/sprint-01.md  # 验收报告
```

验证器执行登记的命令、关键用户路径和清理步骤，原子写入机器报告并回填 Sprint 摘要。`full` 报告绑定配置哈希和工作区指纹；配置或项目文件变化后自动失效。

退出码：`0` 通过，`1` 存在必须修复的问题，`2` 配置或状态文件无法解析。

## 阶段推进

`workflow-state.json` 的唯一写入入口是 `scripts/harness-stage.mjs`：

```sh
node scripts/harness-stage.mjs status                                        # 当前阶段与最近放行记录
node scripts/harness-stage.mjs advance --to <stage> --by user --quote "<用户原话>"
```

推进是原子硬门禁：`harness-stage` 先写候选状态，再调用同一检查器运行 `context + gates + evidence`。任何文档、Source Register、原话、报告、关键路径、清理、配置哈希或工作区指纹错误都会删除候选状态；正式 `workflow-state.json` 保持不变。全部通过后才原子替换正式状态。

阶段链：`initialized → requirements-draft → requirements-confirmed → solution-options → solution-selected → implementation-ready → accepted`。UI 项目插入 `design-confirmed`，且必须登记可运行原型文件、运行命令和操作证据。进入 `accepted` 必须有当前 `full` 验证报告和用户验收原话。

## 契约唯一来源

`SPECS/api.md` 和 `SPECS/database.md` 是前后端共享的唯一契约来源。任一文件存在时，`.harness/config.json` 的 `commands.contracts` 必须登记机器校验命令；项目没有对应契约时删除该文件并在 config 中写明显式说明。契约只有一份，实现侧引用路径而不复制内容。

通过 Harness 检查不代表应用已经验收通过。真实构建、测试和用户路径结果仍以目标项目的验证报告为准。

## 非目标

- 不创建新项目或业务目录。
- 不选择或安装前端、后端、数据库模板。
- 不生成需求、方案、SDD、API 或数据库契约内容。
- 不自动确认需求、选择方案、推进阶段或伪造用户原话。
- 不提供模板自动升级、三方合并或迁移平台；复制后文件归目标项目所有，后续更新通过 Git diff 人工吸收。
- 不替目标项目决定测试金字塔、CI 平台或发布流程。
- 不因目录或文档存在就宣称实现已经通过验收。

## 冷启动验收

新会话只读仓库后，应能回答六个问题：项目是什么、走到哪一步、允许做什么、按什么流程做、如何验证、经验写到哪里。每个答案都必须有唯一仓库证据。
