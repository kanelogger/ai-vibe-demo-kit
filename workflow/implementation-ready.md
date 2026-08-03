---
status: ready
confirmedBy: user
confirmedAt: 2026-08-03T15:41:18Z
confirmationQuote: 批准开始实现
---
# Directory Context Guard 实现就绪草案

## 可运行切片

- 产出：先交付可独立运行的 `context-guard-cli`，再交付依赖它的 `context-guard-enforcement`；完整 DAG 见 Feature tasks。
- 首要不确定性：单一 Context Guard Interface 能否同时保证传递上下文确定性、Git 私有回执漂移和平台 Adapter 一致性。
- 非目标：import 分析、自动 Code Root 发现、stateRef 审计、active Slice/Write Scope 绑定、平台专属配置。

## Source Register

| 来源 | 用途 |
| --- | --- |
| `workflow/requirements.md` | 已确认需求与验收标准 |
| `workflow/solution-options.md` | 方案比较 |
| `workflow/solution-selected.md` | 用户选择 `unified-guard` |
| `SPECS/FEATURES/directory-context-guard/spec.md` | 长期行为和数据契约 |
| `SPECS/FEATURES/directory-context-guard/tasks.md` | 两片 Slice DAG、Write Scope 和 quick 验证 |
| `memory/decisions.md` | 持久决策谱系 |

## Slice DAG

```text
context-guard-cli
  └── context-guard-enforcement
```

用户已批准两个 Slice 及唯一依赖边。前驱必须完成并通过 quick 验证后，后继才开始。

## 实现边界

- Context Guard 是唯一外部 Interface；索引解析、路径安全、闭包、摘要和回执属于其 Implementation。
- CLI、检查器和 Hook 是 Adapter，不复制索引或放行规则。
- 回执只进入 Git 私有运行目录，不进入工作树或 stateRef。
- 每个 Slice 严格限制在 Feature tasks 声明的 Write Scope；新增路径必须先修订计划。
- Slice 1 完成 CLI 首次阻断/重试；Slice 2 完成静态检查、Hook 与仓库 dogfood。
- Slice 1 review revision adds `scripts/harness/lib/context.mjs` to its Write Scope and hardens delivery ordering, symlink/Git-private boundaries and bounded context bytes; the two-Slice DAG is unchanged.

## 验证计划

- Slice 1 quick：执行 `SPECS/FEATURES/directory-context-guard/tasks.md` 中 `context-guard-cli` 的 `verification.quick`。
- Slice 2 quick：执行同文件中 `context-guard-enforcement` 的 `verification.quick`。
- 迭代验证：每片运行 `node scripts/harness-verify.mjs quick --sprint tasks/sprint-0N.md`。
- 验收验证：`node scripts/harness-verify.mjs full --sprint tasks/sprint-02.md`。
- 静态 / 测试 / 契约命令：引用 `.harness/config.json`，实现时同步登记 Context Guard 入口。
- 关键用户路径：真实调用 Hook Adapter 两次，记录首次退出 1 与上下文、第二次退出 0 与允许结果。
- 清理：引用 `recovery.testDataCleanup`；额外删除验证会话的 Git 私有 Context Receipt。
- 回退：引用 `recovery.rollback`；两个 Slice 使用独立聚焦提交，可按逆序 `git revert`。
