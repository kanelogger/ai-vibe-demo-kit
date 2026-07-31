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

1. 按改动风险选择验证级别：核心逻辑单测、真实依赖集成测试、共享接口契约测试、关键用户路径自动化或人工证据。
2. 迭代中运行 `node scripts/harness-verify.mjs quick --sprint <path>`；最终验收前运行 `node scripts/harness-verify.mjs full --sprint <path>`。
3. 验证器实际执行当前配置中的命令、关键路径和清理步骤，生成绑定配置与工作区的机器报告；失败就在当前会话修复并重跑。
4. 检查自动回填的 Sprint Verification Report，补充未覆盖风险和提交哈希。
5. 用户根据真实运行结果验收；`harness-stage` 只有在报告通过且仍然有效时才允许进入 `accepted`。

## 输出

- `.harness/verification-report.json`：绑定配置和工作区的机器报告。
- `tasks/sprint-*.md`：自动回填的可读摘要，以及人工补充的风险和提交哈希。

## 边界

- Harness 检查通过不等于应用验收通过；验收以真实运行的验证报告为准。
- 不伪造运行结果；命令不可运行时显式记录缺口。
