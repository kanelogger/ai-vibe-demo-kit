# Tasks

`tasks/` 保存当前可执行工作，来源必须可追溯到已确认需求、选定方案和 feature spec。每个任务是小而可独立运行的切片，带明确验证和回退边界。

- `backlog.md`：需求确认后建立（模板见 `backlog.template.md`）。
- `sprint-NN.md`：实现准备完成后建立（模板见 `sprint.template.md`）。
- feature 级任务位于 `SPECS/FEATURES/<feature-slug>/tasks.md`。

每个 sprint 必须附验证报告：执行命令、结果、时间、关键用户路径证据、未覆盖风险和清理记录。
