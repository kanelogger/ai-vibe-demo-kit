# 迭代 01：Unified Context Guard CLI

## 目标

- 交付一个可独立运行的切片：`context-guard-cli`，通过统一 CLI 完成首次阻断、上下文交付、当前回执重试放行和漂移失效。
- 首要不确定性：递归索引闭包、路径安全与 Git 私有回执能否隐藏在单一 Context Guard Interface 后。
- 明确的非目标：静态项目检查、平台 Hook、仓库 dogfood 索引、stateRef/Slice 绑定。

## 任务

- [x] 确认 `unified-guard` 与 Feature Spec。
- [x] 实现 Context Guard schema、闭包、摘要和回执。
- [x] 接入统一 `harness context guard` CLI 与稳定错误契约。
- [x] 覆盖继承、传递依赖、非法引用、首次阻断/重试和漂移行为。
- [x] 运行 Slice quick 与 Harness quick 验证。
- [x] 确认回执不污染工作树并记录回退步骤。
- [x] 提交只含 Slice 1 的聚焦改动并记录提交哈希。

## Verification Report

- Machine report: .harness/verification-report.json#verify-20260803161044709
- Commands: node --check scripts/harness/lib/skill-routing.mjs && node --check scripts/harness/lib/context.mjs && node --check scripts/harness/lib/context-guard.mjs && node --check scripts/harness/cli.mjs && node --check scripts/harness-check.mjs; node --test scripts/harness/test/skill-routing.test.mjs scripts/harness/test/context-guard.test.mjs
- Results: passed
- Executed at: 2026-08-03T16:10:44.709Z
- User-path evidence: unified Context Guard CLI block/retry, drift and linked-worktree paths passed in `context-guard.test.mjs`
- Uncovered risks: none; five standards findings and three spec findings were fixed and re-reviewed as resolved
- Cleanup performed: none: Harness tests run in isolated temporary Git repositories and create no shared test data.
- Rollback steps: Use git revert on the focused implementation commit recorded in the Sprint verification report.
- 提交哈希: 05df973
