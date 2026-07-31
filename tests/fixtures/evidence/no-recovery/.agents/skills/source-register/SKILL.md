---
name: source-register
description: 整理需求、方案和 spec 的事实来源。当准备 workflow 阶段文档或 feature spec、需要填写 Source Register 时使用。
---

# Source Register

把当前文档依据的事实整理成可审计的 Source Register。

## 输入

- 当前阶段的 `workflow/` 文档或 `SPECS/FEATURES/<slug>/spec.md`。
- 用户原话、既有代码与文档、设计稿、测试与日志。

## 步骤

1. 列出文档断言所依据的每条事实。
2. 为每条事实登记来源类型、位置或原话、用途。
3. 用户请求、现有代码/文档为必需来源；UI 变更必需设计来源；测试/日志为可选。
4. 找不到来源的断言：删除该断言，或显式标注“无来源”及原因，交给用户确认。
5. 不得用占位符代替用户原话。

## 输出

- 文档内的 Source Register 表格，或显式的“无来源”说明。

## 边界

- 只整理和标注来源，不替用户确认需求、不推进阶段。
