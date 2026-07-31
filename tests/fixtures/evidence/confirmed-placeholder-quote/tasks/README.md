# Tasks

`tasks/` 保存当前可执行工作，来源必须可追溯到已确认需求、选定方案和 feature spec。每个任务是小而可独立运行的切片，带明确验证和回退边界。

- `backlog.md`：需求确认后建立（模板见 `backlog.template.md`）。
- `sprint-NN.md`：实现准备完成后建立（模板见 `sprint.template.md`）。
- feature 级任务位于 `SPECS/FEATURES/<feature-slug>/tasks.md`。

每个 sprint 必须保留 Verification Report。`harness-verify.mjs` 自动回填机器报告、命令、结果、时间、关键路径和清理；任务负责人补充未覆盖风险与提交哈希。进入 `accepted` 前所有字段必须非空。
