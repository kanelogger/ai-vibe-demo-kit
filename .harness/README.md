# Harness Tool

这个目录保存 Harness 的仓库内说明；活动状态位于 Git 私有目录 `.git/harness/`。

```sh
./harness check
./harness version --json
./harness start --workflow workflows/workflow-template.json --intent "<goal>"
./harness status --json
./harness check-result --workflow <workflow.json> --stage <stage> --file <stage-result.json> --require-complete --json
./harness signal --revision <n> --file <stage-result.json>
./harness decide --revision <n> --action <action> --reason "<reason>"
```

运行 `./harness help` 查看完整参数。Harness 只控制和校验 Workflow，不执行 Skill、测试、Shell、Git 提交或外部写入。

Installer 完成且 `./harness check --json` 通过只表示 **Runtime-ready**。达到 **Governance-ready** 还需要：在不覆盖现有文件的前提下将 `AGENTS_template.md`、`project-template.yml` 提升为项目文件，填写全部占位符，按需从 Kit 选择 `knowledge/`、`rules/` 和架构模板，扩展已安装的 `SPECS/template.md`，并用代码、配置或负责人确认每条项目事实。空模板不能作为正式知识引用。达到 **Completion-evidence-ready** 还需要提交 acceptance Stage Result 与 `verification-report/v1`，并由 Agent 或 CI 调用 `check-result --require-complete`。

`signal --json` 的无错误响应包含 `applied` 和 `requiresHumanAction`。进入 Human Gate 或 Policy Block 时 Stage Result 已持久化，但命令仍返回退出码 `1`；同内容、同 Revision 重试返回 `applied: false` 和退出码 `0`。

Mutation 锁位于 `.git/harness/control.lock`。Harness 会自动回收能够确认其 PID 已死亡的锁；活 PID、权限不足、空锁或非法 PID 会保留并返回 `E_STATE_BUSY`。人工删除前必须确认没有 Harness Mutation 正在运行，并在删除后执行 `./harness status --json` 校验状态。

发行身份位于 `.harness/manifest.json`，变更记录位于 `.harness/CHANGELOG.md`。升级前比较新旧 `./harness version --json`，在独立 Git 分支逐项审查 Installer 冲突和文件 Diff；Harness 不自动覆盖或合并不同版本。

`check-result` 是无状态检查：它不读取本地控制历史，也不证明 Human Gate 已批准。`completionEligible: true` 表示结果结构、Policy 和完成 Transition 均满足；`requiresHumanApproval` 表示仍需外部人工决策。

安装器只复制控制 Runtime、默认 Workflow 和入口模板；`knowledge/`、`rules/` 等项目内容由目标仓库自行选择和维护，不属于 Runtime-ready 的自动安装范围。
