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
2. 填写 `HARNESS.md` 相关章节与 `SPECS/architecture.md` 中的项目事实。
3. 在 `.harness/config.json` 登记可执行验证、关键路径、清理、回退、报告有效期和工作区指纹。
4. 外部 Skills 默认跟踪三个上游（见 `.agents/skills.sources.json`）；首次使用执行 `node scripts/skills-sync.mjs --update` 解析并锁定，之后复制到目标项目用 `node scripts/skills-sync.mjs` 按锁恢复；不需要时把 `sources` 置为空数组并执行一次 `--update` 清理。
5. 按 `overlay/.agents/hooks/README.md` 注册平台阻断点；不支持 Hook 时登记相同节点的人工命令。
6. 执行 `node scripts/harness-check.mjs all` 并修复全部结构错误。
7. 形成一次独立、可回退的 Harness 接入提交。

## 外部 Skills

`.agents/skills.json` 是 Harness 路由索引；外部 Skill 的**来源**由 `.agents/skills.sources.json` 声明（v2），二者职责不同。清单表达更新意图（track），`.agents/skills.lock.json` 记录本次解析到的完整 commit SHA 与内容摘要：

```json
{
  "version": 2,
  "sources": [
    { "id": "mattpocock-skills", "repo": "https://github.com/<owner>/<repo>", "path": "skills", "track": { "kind": "branch", "value": "main" }, "exclude": ["deprecated/"] }
  ]
}
```

- `path` 指向含 `SKILL.md` 的单个 Skill 目录，或含多个 Skill 的父目录（技能组）；`only` / `exclude` 可选，按 Skill 名或目录前缀（以 `/` 结尾）过滤，`exclude` 最后执行。
- `track.kind` 为 `branch`、`tag` 或 `commit`；普通 sync 永不重新解析，`--update` 才把 branch 解析为该次 fetch 观察到的 tip。
- **锁定 sync**：`node scripts/skills-sync.mjs` 严格恢复 lock 中的 resolved SHA（上游 branch 前移也不影响），READY 时零网络零写入；`--force` 从同一锁定 SHA 重新物化。
- **显式更新**：`node scripts/skills-sync.mjs --update` 联网解析全部来源，报告旧/新 SHA 与技能增删，原子替换 lock 并物化；更新前请审查 lock diff。
- 两个命令都生成 `.agents/skills/.gitignore`（受管目录与 `.sources` 不入库，内置 Skill 不受影响）；失败时现有可用状态字节不变。
- 技能在 Agent 会话启动时加载，sync / update 必须在会话开始前运行，`--update` 成功后请开启新会话，不做会话内懒加载。清单、锁文件、磁盘摘要与 provenance 漂移由 `harness-check context` 只读报错。
- Overlay 自带的三个 Harness Skill（source-register、verification-closeout、memory-writeback）照常提交，sync 不会覆盖锁文件之外的目录。
- 同步后如需接入 Harness 路由，在 `.agents/skills.json` 人工登记对应 alias；同步器不改写路由。

从 v1（`ref` 字段与扁平 `managed` lock）迁移：先提交或备份工作区，再用本版本替换控制面文件（`skills.sources.json`、`scripts/skills-sync*.mjs`、检查器），删除旧 lock 后执行一次 `node scripts/skills-sync.mjs --update`；系统不会把旧 lock 静默升级为 v2。

注意：本仓库根的 `/.agents/` 忽略规则只作用于根仓库，不会覆盖 `overlay/.agents/`；`git check-ignore` 与 `harness-check context` 都必须针对目标项目实际的 `skillsRoot` 执行。

## Harness 检查

`scripts/harness-check.mjs` 无第三方依赖、只读，是唯一检查入口：

```sh
node scripts/harness-check.mjs context   # 冷启动六问所需入口和占位符
node scripts/harness-check.mjs gates     # 阶段状态、文档前置和用户原话证据
node scripts/harness-check.mjs evidence  # Source Register、契约校验、验证入口、报告、清理和回退
node scripts/harness-check.mjs commit    # 实现任务收尾：工作区不得遗留未提交改动
node scripts/harness-check.mjs all       # context、gates、evidence 依次执行
```

真实反馈由验证器执行：

```sh
node scripts/harness-verify.mjs quick --sprint tasks/sprint-01.md
node scripts/harness-verify.mjs full --sprint tasks/sprint-01.md
```

验证器实际运行命令、关键路径和清理，生成绑定配置与工作区的机器报告，并回填 Sprint 摘要。

阶段推进由 `scripts/harness-stage.mjs` 原子硬门禁控制：它先对候选状态运行 `context + gates + evidence`，全部通过后才替换正式状态。每次推进必须携带用户原话并写入 history：

```sh
node scripts/harness-stage.mjs status
node scripts/harness-stage.mjs advance --to <stage> --by user --quote "<用户原话>"
```

进入 `accepted` 必须有当前 `full` 验证报告；配置或项目文件变化会使报告失效。

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
