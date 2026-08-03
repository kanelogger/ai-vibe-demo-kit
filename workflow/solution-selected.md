---
status: selected
selectionType: option
selectedOptionId: unified-guard
selectedBy: user
selectedAt: 2026-08-03T15:34:39Z
selectionQuote: unified-guard
---
# 选定方案

## 决策

选择 `unified-guard`。目录索引解析、传递 Context Closure、摘要与 Context Receipt 由一个深 Context Guard Module 实现；统一 `harness context guard` CLI、静态检查器和平台 Hook Adapter 复用该模块。能力不依赖 v2 stateRef 已迁移或存在 active Slice，回执只写 Git 私有运行目录。

## 理由

- 满足已确认的索引目录硬阻断和首次阻断后重试语义。
- 保持单一 Harness CLI、稳定错误契约和配置解析路径。
- 具体项目接入后无需先迁移 v2 状态即可获得文件上下文门禁。
- Context Guard 是唯一 Interface，CLI 与 Hook 只承担输入输出适配，避免规则分叉。
- 后续可由 Slice Write Scope 调用，不需要本轮反向耦合 Slice 生命周期。

## 被取代的决策

无。

## 风险

- 统一 CLI、检查器和 Hook 均受影响，必须以 Context Guard 外部行为和真实 Hook 两次调用验证。
- 前置闭包可能扩大输出；本轮只允许显式精确文本引用，不引入自动 import 或目录展开。
- 平台必须注册 Hook 才能拦截真实写工具；无 Hook 平台只能使用等价 CLI 节点，适配说明必须明确这个边界。
- Context Receipt 位于 Git 私有目录，必须验证不会污染工作树且依赖漂移会立即失效。

## Source Register

| 来源 | 用途 |
| --- | --- |
| 用户选择 `unified-guard` | 方案放行原话 |
| `workflow/requirements.md` | 已确认需求与验收标准 |
| `workflow/solution-options.md` | 三方案比较、收益、代价和风险 |
| `SPECS/architecture.md` | Node CLI、Hook Adapter、状态与验证模块事实 |
