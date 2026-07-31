---
name: verification-closeout
description: 实现切片的验证收尾。当一个可运行切片完成、需要按风险执行验证并产出证据时使用。
---

# Verification Closeout

按 `.harness/config.json` 登记的命令完成风险匹配验证，留下可审计证据。

## 输入

- `.harness/config.json` 的 `commands`、`criticalUserPaths`、`recovery`。
- 当前 `tasks/sprint-*.md`。

## 步骤

1. 按改动风险选择验证级别：核心逻辑单测、真实依赖集成测试、共享接口契约测试、关键用户路径 E2E 或实际操作。
2. 运行 `commands.quick`；涉及共享契约或发布前运行 `commands.full`。输出必须可读，失败就在当前会话修复并重跑。
3. 实际运行受影响的关键用户路径并记录证据；无法运行时写明缺口、原因和风险。
4. 在 sprint 文档的 Verification Report 记录命令、结果、执行时间、用户路径证据和未覆盖风险。
5. 按 `recovery.testDataCleanup` 清理测试数据，按 `recovery.rollback` 记录回退步骤。

## 输出

- 完整的 Verification Report 和清理/回退记录。

## 边界

- Harness 检查通过不等于应用验收通过；验收以真实运行的验证报告为准。
- 不伪造运行结果；命令不可运行时显式记录缺口。
