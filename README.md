# AI Native Harness Overlay

仓库级 Agent 开发控制面。为既有 Git 项目补充上下文恢复、阶段门禁、Skill 路由、真实验证和可审计回退能力。

## 安装

前提：目标项目已由 Git 管理。复制前先提交或暂存现有修改。

```sh
git clone <this-repo> /tmp/ai-native-harness
cp -R /tmp/ai-native-harness/overlay/. /path/to/existing-project/
cd /path/to/existing-project
node scripts/harness-check.mjs context   # 确认骨架完整
```

然后按 `HARNESS.md` 的接入流程完成适配：填写项目事实、登记验证命令、配置 Code Roots、同步外部 Skills。

## 日常命令

所有命令零第三方依赖，只读仓库事实。

### 检查

```sh
node scripts/harness-check.mjs context   # 冷启动入口和关键占位符
node scripts/harness-check.mjs gates     # 阶段状态、文档前置、用户原话
node scripts/harness-check.mjs evidence  # Source Register、验证入口、报告、清理
node scripts/harness-check.mjs all       # 以上三项依次执行
node scripts/harness-check.mjs commit    # 工作区不得遗留未提交改动
```

### 验证

```sh
node scripts/harness-verify.mjs quick --sprint tasks/sprint-01.md  # 迭代反馈
node scripts/harness-verify.mjs full --sprint tasks/sprint-01.md   # 验收报告
```

验证器执行 `.harness/config.json` 中登记的 static、test、criticalUserPaths 和 cleanup 命令，生成机器报告并回填 Sprint 摘要。`full` 报告绑定配置哈希和工作区指纹，内容漂移后自动失效。

### 阶段推进

```sh
node scripts/harness-stage.mjs status                                  # 当前阶段
node scripts/harness-stage.mjs advance --to <stage> --by user --quote "<原话>"  # 推进
```

推进是原子硬门禁：先写候选状态，再运行 `context + gates + evidence` 全部 preflight，任一失败则回滚候选状态。阶段链：

```
initialized → requirements-draft → requirements-confirmed
  → solution-options → solution-selected → implementation-ready → accepted
```

UI 项目插入 `design-confirmed`。进入 `accepted` 必须有当前 `full` 验证报告和用户验收原话。

### 写入门禁

```sh
# Agent 修改受管文件前，先通过 Context Guard
node scripts/harness/cli.mjs context guard --file <path> --session <id> [--json]

# 平台 Hook 调用同一入口
node .agents/hooks/guard-write-context.mjs --file <path> --session <id>
```

首次调用被阻断（退出码 1），返回完整前置上下文并生成会话回执；同一 session 重试放行。索引或前置漂移后回执立即失效。

### Skill 管理

```sh
node scripts/skills-sync.mjs           # 按 lock 恢复 Skills（零网络）
node scripts/skills-sync.mjs --update  # 拉取上游最新并重写 lock
```

### Skill 路由

```sh
# 按 Work Item 类型和阶段查路由
node scripts/harness/cli.mjs skills route --type feature --stage requirements-draft --risk-level high --json

# 从 active Work Item 与 stateRef 查路由
node scripts/harness/cli.mjs skills route --slice <slice-id> --trigger command-failed --json
```

路由是确定性的：most-specific route wins，同优先级多路由直接冲突报错。

## 目录职责

```
.
├── AGENTS.md              ← Agent 冷启动入口和高频门禁
├── HARNESS.md             ← Overlay 地图、边界和接入说明
├── workflow-state.json    ← 唯一机器状态源
├── .harness/config.json   ← 验证命令、关键路径、Code Roots
├── workflow/              ← 本轮需求→方案→验收 过程留痕
├── SPECS/                 ← 长期有效的架构、契约和 feature spec
├── tasks/                 ← 当前执行单元 (Sprints)
├── memory/                ← 跨需求决策 (decisions.md) 与 ADR
├── rules/                 ← 按主题加载的工程约束
├── .agents/               ← Skill catalog、路由、Hook 适配、MCP 声明
└── scripts/               ← 检查器、验证器、阶段推进、Skill 同步 CLI
```

## 验证命令配置

机器命令的唯一登记处在 `.harness/config.json`。最小配置示例：

```json
{
  "commands": {
    "quick": {
      "static": ["node --check src/"],
      "test": ["npm test"]
    }
  },
  "criticalUserPaths": [
    {
      "id": "smoke-test",
      "verify": { "mode": "command", "command": "curl -sf http://localhost:3000/health" }
    }
  ]
}
```

详见 `HARNESS.md` 和 `SPECS/architecture.md`。
