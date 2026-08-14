# Harness Tool

这个目录保存 Harness 的仓库内说明；活动状态位于 Git 私有目录 `.git/harness/`。

```sh
./harness check
./harness check-architecture --file project.yml --json
./harness check-environment --file AI_ENVIRONMENT.md --json
./harness version --json
./harness start --workflow source/workflows/workflow-default.json --intent "<goal>"
./harness status --json
./harness check-result --workflow <workflow.json> --stage <stage> --file <stage-result.json> --require-complete --json
./harness signal --revision <n> --file <stage-result.json>
./harness decide --revision <n> --action <action> --reason "<reason>"
```

运行 `./harness help` 查看完整参数。Harness 只控制和校验 Workflow，不执行 Skill、测试、Shell、Git 提交或外部写入。安装的 `workflow-runner` 指引 Agent 推进当前 Stage；`kit-lifecycle` 只处理 Kit 安装生命周期。

Distribution Lifecycle 完成且 `./harness check --json` 通过只表示 **Runtime-ready**。达到 **Governance-ready** 还需要：在不覆盖现有文件的前提下将 `source/agents_template.md`、`source/project-template.yml`、`source/ai_environment_template.md` 分别提升为 `AGENTS.md`、`project.yml`、`AI_ENVIRONMENT.md`，填写全部占位符，通过 `check-environment`，并用代码、配置、实际探测或负责人确认每条项目事实。`source/knowledge/`、`source/rules/`、`source/specs/` 和 `source/workflows/` 是 Lifecycle 管理的上游资料，项目专属内容不得直接写入 Source。达到 **Completion-evidence-ready** 还需要提交 acceptance Stage Result 与 `verification-report/v1`，并由 Agent 或 CI 调用 `check-result --require-complete`。

`signal --json` 的无错误响应包含 `applied` 和 `requiresHumanAction`。进入 Human Gate 或 Policy Block 时 Stage Result 已持久化，但命令仍返回退出码 `1`；同内容、同 Revision 重试返回 `applied: false` 和退出码 `0`。

Mutation 锁位于 `.git/harness/control.lock`，Runtime 和 Distribution Lifecycle 共用此锁。Harness 会自动回收能够确认其 PID 已死亡的锁；活 PID、权限不足、空锁或非法 PID 会保留并返回 `E_STATE_BUSY`。canonical maintenance 存在时只使用 `./harness status --json` 返回的精确 pinned recover 命令。

发行身份位于 `.harness/manifest.json`，变更记录位于 `.harness/CHANGELOG.md`。指定版本升级使用 `ai-vibe-demo-kit upgrade`；最新版同步使用 `ai-vibe-demo-kit sync`。两者都先计划再应用，不自动覆盖第三状态内容或合并治理文件。

安装后的生产投影位于 `.harness/runtime/` 与 `.harness/shared/`，根目录 `harness` 只加载 `.harness/runtime/cli.mjs`。`.harness/manifest.json` schema v2 通过 `capabilities.commands` 和 `capabilities.contracts` 明确声明 Runtime 能力；Doctor 不读取 JavaScript 源码文本。

`check-result` 是无状态检查：它不读取本地控制历史，也不证明 Human Gate 已批准。`completionEligible: true` 表示结果结构、Policy 和完成 Transition 均满足；`requiresHumanApproval` 表示仍需外部人工决策。

Distribution Lifecycle 安装 Runtime、`workflow-runner`、`kit-lifecycle` 和完整 `source/`。Source 包含可分发的只读治理检查器、`execution-trace/v1`、`test-impact/v1` 模板和默认 Workflow，由 `source/manifest.json` 与安装账本管理；项目生效治理文件和用户 Workflow 位于 Source 外，不由 Lifecycle 接管。
