# Harness Tool

这个目录保存 Harness 的仓库内说明；活动状态位于 Git 私有目录 `.git/harness/`。

```sh
./harness check
./harness start --workflow workflows/workflow-template.json --intent "<goal>"
./harness status --json
./harness signal --revision <n> --file <stage-result.json>
./harness decide --revision <n> --action <action> --reason "<reason>"
```

运行 `./harness help` 查看完整参数。Harness 只控制和校验 Workflow，不执行 Skill、测试、Shell、Git 提交或外部写入。

`signal --json` 的无错误响应包含 `applied` 和 `requiresHumanAction`。进入 Human Gate 或 Policy Block 时 Stage Result 已持久化，但命令仍返回退出码 `1`；同内容、同 Revision 重试返回 `applied: false` 和退出码 `0`。

Mutation 锁位于 `.git/harness/control.lock`。Harness 会自动回收能够确认其 PID 已死亡的锁；活 PID、权限不足、空锁或非法 PID 会保留并返回 `E_STATE_BUSY`。人工删除前必须确认没有 Harness Mutation 正在运行，并在删除后执行 `./harness status --json` 校验状态。

安装器只复制控制 Runtime、默认 Workflow 和入口模板；`knowledge/`、`rules/` 等项目内容由目标仓库自行选择和维护。
