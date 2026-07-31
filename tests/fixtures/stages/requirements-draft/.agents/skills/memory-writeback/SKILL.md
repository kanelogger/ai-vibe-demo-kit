---
name: memory-writeback
description: 经验回写与决策谱系维护。当产生可复用经验、旧决策被新决策覆盖或出现重要架构选择时使用。
---

# Memory Writeback

把本轮产生的可复用经验写回长期事实源，保持决策谱系可追溯。

## 输入

- `memory/decisions.md`、`memory/adr/`、`rules/`、`SPECS/`。

## 步骤

1. 判断经验归属：可复用工程约束 → `rules/`；长期项目事实 → `SPECS/`；简单决策 → `memory/decisions.md`；重要架构决策 → `memory/adr/`。
2. 新决策覆盖旧决策时：旧条目标注 `superseded-by <date> <new title>`，新条目写明被替代项和原因；ADR 使用 `Status: superseded-by ADR-NNNN`。
3. 每条记录带来源（用户原话、文档或代码位置）；没有来源时写明“无来源”及原因。
4. 任务专属信息留在 feature spec 和 tasks，不写入长期记忆。

## 输出

- 决策条目、ADR 或规则更新，含覆盖谱系。

## 边界

- 只回写本轮真实产生的经验，不批量编造历史。
