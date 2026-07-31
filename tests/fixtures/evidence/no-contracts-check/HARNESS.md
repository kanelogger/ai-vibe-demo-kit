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
│   ├── config.json        # 机器配置：验证命令、契约校验、关键路径、清理和恢复入口
│   ├── manifest.json      # Overlay 版本和文件职责说明（不驱动自动更新）
├── .agents/               # Harness 专属 Skills 和 Hook 适配
├── workflow/              # 本轮需求、方案和放行过程
├── SPECS/                 # 长期有效的项目事实、唯一契约来源和 feature spec
├── tasks/                 # 当前执行单元
├── memory/                # 决策谱系和 ADR
├── rules/                 # 按主题加载的工程约束
└── scripts/
    ├── harness-check.mjs  # 只读、零依赖的项目本地检查器
    └── harness-stage.mjs  # workflow-state.json 的唯一写入入口（阶段门禁）
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
3. 填写 `HARNESS.md` 相关章节与 `SPECS/ARCHITECTURE.md` 中的项目事实。
4. 在 `.harness/config.json` 登记真实运行、静态检查、测试、关键用户路径、清理和恢复命令；采用 `SPECS/API.md` 或 `SPECS/DATABASE.md` 时登记 `commands.contracts` 契约校验，无对应契约则删除该文件并写明显式说明。
5. 执行 `node scripts/harness-check.mjs all`。
6. 修复全部结构错误；项目专属命令暂不可运行时，显式记录缺口、原因和风险。
7. 形成一次独立、可回退的 Harness 接入提交。

## 检查契约

`scripts/harness-check.mjs` 是唯一检查入口，无第三方依赖，只读取仓库事实，不创建文档、不修改状态、不推进阶段。

```sh
node scripts/harness-check.mjs context   # 冷启动六问所需的入口和占位符
node scripts/harness-check.mjs gates     # 阶段状态、文档前置和用户原话证据
node scripts/harness-check.mjs evidence  # Source Register、验证入口、报告、清理和回退
node scripts/harness-check.mjs all       # 以上全部
```

退出码：`0` 通过，`1` 存在必须修复的问题，`2` 配置或状态文件无法解析。

## 阶段推进

`workflow-state.json` 的唯一写入入口是 `scripts/harness-stage.mjs`：

```sh
node scripts/harness-stage.mjs status                                        # 当前阶段与最近放行记录
node scripts/harness-stage.mjs advance --to <stage> --by user --quote "<用户原话>"
```

推进是硬门禁：只允许单步推进，目标阶段文档必须已存在，每次推进必须携带用户原话并写入 `history` 证据链。Agent 不得手改状态文件或伪造原话。推进后运行 `node scripts/harness-check.mjs gates` 复核文档证据。

## 契约唯一来源

`SPECS/API.md` 和 `SPECS/DATABASE.md` 是前后端共享的唯一契约来源。任一文件存在时，`.harness/config.json` 的 `commands.contracts` 必须登记机器校验命令；项目没有对应契约时删除该文件并在 config 中写明显式说明。契约只有一份，实现侧引用路径而不复制内容。

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
