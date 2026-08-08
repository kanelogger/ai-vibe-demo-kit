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

安装器只复制控制 Runtime、默认 Workflow 和入口模板；`knowledge/`、`rules/` 等项目内容由目标仓库自行选择和维护。
