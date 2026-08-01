---
description: AI 实现、参考证据和反馈闭环规则
alwaysApply: false
---

# AI Implementation

## 开始前

- 确认 `workflow-state.json` 已进入 `implementation-ready`。
- 读取选定方案、feature spec、tasks 和 `SPECS/architecture.md`。
- 找到最接近的现有行为、接口和验证方式，记录到 Harness References。
- 没有可复用参考时明确记录原因，再设计新形态。

## 实现

- 先更新受影响的长期契约，再修改依赖它的代码。
- 每个切片只增加一种主要不确定性，并保持独立可运行。
- 不复制参考实现中的隐性行为而不审查默认值、状态、权限、排序、时间、空值和错误恢复。
- 遇到设计或规格问题先修正对应事实源，再同步代码。

## 收尾

- 运行与风险匹配的静态、单元、集成、契约和端到端验证。
- 记录命令、结果、未覆盖风险和回退方式。
- 清理测试产生的数据和文件。
- 把可复用约束写回 `rules/`、事实写回 `SPECS/`、重要决定写回 `memory/`。
