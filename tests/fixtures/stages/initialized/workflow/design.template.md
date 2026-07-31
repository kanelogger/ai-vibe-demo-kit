---
status: confirmed
confirmedBy: 
confirmedAt: 
confirmationQuote: 
---
# 设计确认

设计稿是 UI 实现的上游事实源。UI 问题先回到设计工具修改原型、用更新后的设计稿替换本地文件，再由 Agent 比较设计稿变更后更新实现；不直接补正式代码修 UI。

## 设计稿位置

| 文件 / 链接 | 版本 | 覆盖范围 |
| --- | --- | --- |
|  |  |  |

## 覆盖的界面与状态

- 页面 / 组件：
- 权限与可见性：
- 空态 / 加载 / 错误：
- 禁用与边界状态：

## Source Register

| 来源类型 | 位置 / 原话 | 用途 | 状态 |
| --- | --- | --- | --- |
| 设计 / 原型 |  | 可观察目标 | 必需 |
| 用户请求 |  | 问题边界 | 必需 |
| 现有代码 / 文档 |  | 当前行为 | 可用时必需 |

没有任何来源时，在本节显式写明“无来源”及原因，不得留空。

## 确认记录

用户确认设计稿后，在 frontmatter 记录 confirmedBy、confirmedAt、confirmationQuote（用户原话），再运行 `node scripts/harness-stage.mjs advance --to design-confirmed --by user --quote "<用户原话>"`。
