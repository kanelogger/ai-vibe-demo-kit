# AI Native Harness Overlay

可复制到现有代码库的 Agent 开发装甲。它为已有项目补充上下文恢复、规格管理、阶段证据、反馈验证和经验回写能力。

目标用户已经拥有可运行或正在建设的本地项目。把本仓库的 `overlay/` 复制进去，就能获得 Agent 冷启动索引、规格与决策记忆、阶段证据、反馈检查和经验回写入口。

Overlay 不创建应用，不规定技术栈，不生成业务文档，也不替你推进开发阶段。

```text
已有项目
  + Harness Overlay
  = 可以被冷启动 Agent 初步理解、约束、执行和验证的项目
```

## 接入

前提：目标项目已经由 Git 管理。**复制前先提交、暂存或备份现有修改**，保证覆盖可以恢复。

```sh
git clone <harness-repository> /tmp/ai-native-harness
cp -R /tmp/ai-native-harness/overlay/. /path/to/existing-project/
cd /path/to/existing-project
git status --short
git diff
```

首次适配：

1. 审查复制产生的所有冲突和覆盖；合并已有 `AGENTS.md`，保留项目原有高优先级约束。
2. 填写 `HARNESS.md` 相关章节与 `SPECS/ARCHITECTURE.md` 中的项目事实。
3. 在 `.harness/config.json` 登记真实运行、静态检查、测试、关键用户路径、清理和恢复命令；采用 `SPECS/API.md` 或 `SPECS/DATABASE.md` 时登记 `commands.contracts` 契约校验，无对应契约则删除该文件并写明显式说明。
4. 执行 `node scripts/harness-check.mjs all`。
5. 修复全部结构错误；项目专属命令暂不可运行时，显式记录缺口、原因和风险。
6. 形成一次独立、可回退的 Harness 接入提交。

## Harness 检查

`scripts/harness-check.mjs` 无第三方依赖、只读，是唯一检查入口：

```sh
node scripts/harness-check.mjs context   # 冷启动六问所需入口和占位符
node scripts/harness-check.mjs gates     # 阶段状态、文档前置和用户原话证据
node scripts/harness-check.mjs evidence  # Source Register、契约校验、验证入口、报告、清理和回退
node scripts/harness-check.mjs commit    # 实现任务收尾：工作区不得遗留未提交改动
node scripts/harness-check.mjs all       # context、gates、evidence 依次执行
```

阶段推进由 `scripts/harness-stage.mjs` 硬门禁控制——它是 `workflow-state.json` 的唯一写入入口，只允许单步推进，每次推进必须携带用户原话并写入可审计的 history 证据链：

```sh
node scripts/harness-stage.mjs status                                        # 当前阶段与最近放行记录
node scripts/harness-stage.mjs advance --to <stage> --by user --quote "<用户原话>"
```

输出 Agent 可直接修复的结构化错误（`ERROR <check-id> <path>: <problem>` + `REPAIR:`），退出码 `0` 通过、`1` 有问题、`2` 配置无法解析。

**Harness 检查通过不等于应用验收通过。** 真实构建、测试和用户路径结果以项目的验证报告为准。

## 复制后所有权

复制完成后 `overlay/` 文件归目标项目所有：按真实情况修改 `AGENTS.md`、规格、规则和脚本。本仓库不维护自动更新器；未来版本更新通过 Git diff 人工选择吸收。

## 冷启动验收

判断接入是否有效：让一个没有口头背景的新会话只读仓库并回答六个问题——项目是什么、走到哪一步、允许做什么、按什么流程做、如何验证、经验写到哪里。每个答案都必须有唯一仓库证据。

## 非目标

- 不创建新项目或业务目录，不选择或安装前端、后端、数据库模板。
- 不生成需求、方案、SDD、API 或数据库契约内容。
- 不自动确认需求、选择方案、推进阶段或伪造用户原话。
- 不提供模板自动升级、三方合并或迁移平台。
- 不因目录或文档存在就宣称实现已通过验收。

## 仓库布局

```text
overlay/    # 唯一交付主体，复制单元
tests/      # Harness 检查器与复制演练测试（仅用于维护 Overlay，不进入目标项目）
docs/       # 计划与构想文档
```

## 开发

```sh
npm test              # 运行全部 Harness 测试
npm run fixtures      # overlay 变更后重新生成 tests/fixtures/
```

## 要求

- Node.js `^20.19.0 || >=22.13.0`（仅作为 Harness 自带零依赖执行环境，目标项目本身不需要 Node）
