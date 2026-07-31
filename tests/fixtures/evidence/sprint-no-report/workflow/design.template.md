---
status: confirmed
confirmedBy: 
confirmedAt: 
confirmationQuote: 
prototypeCommand: 
prototypePaths: []
prototypeEvidence: 
---
# 设计确认

设计稿是 UI 实现的上游事实源。确认对象必须是可运行、可操作的原型；UI 问题先修改原型并更新证据，再同步正式实现。

## 可执行原型

- 运行命令：与 frontmatter `prototypeCommand` 相同
- 原型文件：在 frontmatter `prototypePaths` 登记 HTML、CSS、组件、模拟数据等仓库相对路径
- 操作证据：在 frontmatter `prototypeEvidence` 登记截图或人工走查记录

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
