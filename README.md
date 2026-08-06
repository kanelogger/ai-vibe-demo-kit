# AI Native Harness Overlay

面向个人开发者的仓库内 Agent 控制面：一个本地状态文件、三段任务路径、真实 Quick/Full 验证，以及按目录交付的写前上下文。

## 日常使用

```sh
node scripts/harness/cli.mjs status --json
node scripts/harness/cli.mjs align --intent "要完成什么" --done-when "可观察完成条件"
# 修改代码；需要快速反馈时运行 check；提交候选变更
node scripts/harness/cli.mjs finish
```

高风险任务在 `align` 后确认一次 alignment digest，Full 通过后再确认 acceptance digest。普通任务 Full 通过后自动关闭。

```sh
node scripts/harness/cli.mjs align --confirm <digest> --quote "用户原话"
node scripts/harness/cli.mjs check
node scripts/harness/cli.mjs finish --confirm <digest> --quote "用户原话"
node scripts/harness/cli.mjs abort --reason "停止原因"
```

写受管文件时，OMP、Codex 和 Claude Code 的 Adapter 会调用同一个 Context Guard。Shell 写入必须由执行者主动调用：

```sh
node scripts/harness/cli.mjs context guard --file <path> --session <stable-id> --json
```

外部 Skills 独立同步：

```sh
node scripts/skills-sync.mjs           # 按 lock 恢复；READY 时不联网
node scripts/skills-sync.mjs --update  # 显式更新来源与 lock
```

架构、配置和完整语义见 `SPECS/architecture.md`、`.harness/config.json` 与 `HARNESS.md`。
