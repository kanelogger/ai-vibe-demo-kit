# Handoff

- 修改位置：`source/specs/template.md`（顶部 `## 需求简报`）、`source/rules/git.md`（受治理条目同区间约束）、`source/agents_template.md`（完成条件证据链纪律）。
- 证据位置：`work/requirements/wi-msoo5k9d-7f83d4b7/`（spec、alignment/implementation/acceptance result、quick-evidence、verification-report）。
- 验证：c1-c5 通过（退出码 0），c6 全量测试按 docs-only 跳过；临时文件已清理，无残留资源。
- 后续：Gate 2 批准后执行 3 个 `feat` 内容提交 + 1 个 `chore` 证据提交（含 `acceptance-result.json`、`verification-report.json`、`workflow.json` 同目录副本），随后在同一 `e0f6ba9..HEAD` 区间复跑 `check-commit-messages` 与 `check-completion-evidence`。
- 未做：发布、Tag、Push、生产写入；`workflow-case-zh.md` 联动按计划跳过。
- 残留风险：c3/c4 当前为 0 提交基线运行，其结论以提交后复验为准。
