# Git Rules

- 开始前检查并保留用户已有改动。
- 每一行改动都应能追溯到当前需求。
- 不擅自推送、发布、改写历史或执行破坏性清理。
- 验证完成后再形成独立提交或等价的可回退记录。
- 一个逻辑变更形成一个提交；实现、测试和直接相关文档必须在同一个提交中。
- 提交消息使用 `<type>(<optional-scope>)<optional-!>: <summary>`；允许的 Type 为 `feat`、`fix`、`docs`、`test`、`refactor`、`perf`、`build`、`ci`、`chore` 和 `revert`。
- 提交前运行 `node scripts/check-commit-messages.mjs <base-ref> HEAD`，CI 只检查当前变更引入的新提交。
- 受治理变更必须在 `work/requirements/<work-id>/` 提交 acceptance Stage Result、verification report 和生成该结果的 `workflow.json`；CI 优先用同目录 Workflow 校验，缺失时才回退默认 Workflow，并运行 `node scripts/check-completion-evidence.mjs <base-ref> HEAD`。
- 只读任务不创建空提交；未通过的检查必须明确报告。
