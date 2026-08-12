# Governance Tools

这些零依赖、只读工具随 Source 原样分发，供项目本地和 CI 调用：

- `check-commit-messages.mjs`：校验 Git 范围内的语义化提交主题。
- `check-completion-evidence.mjs`：对受治理变更运行无状态 Acceptance Evidence 检查。
- `check-change-tests.mjs`：逐 commit 要求 `feat`、`fix` 行为变更同步更新自动化测试。

工具不会创建 commit、执行测试、修改业务文件或批准 Human Gate。
