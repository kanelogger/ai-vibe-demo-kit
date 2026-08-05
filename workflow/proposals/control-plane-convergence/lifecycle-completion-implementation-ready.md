---
status: draft
activity: active-work-item-release-candidate
initiativeId: control-plane-convergence
workItemId: wi-20260805-31b819fc
workItemStage: solution-selected
selectedOptionId: state-parent-anchor
implementationAuthorized: false
confirmedBy: null
confirmedAt: null
confirmationQuote: null
---
# P0-WI-01 Lifecycle Completion 实现就绪候选

> 本文是 implementation-ready 放行候选，不是已生效授权。只有用户提供新的明确原话并由 Canonical Control Plane 成功推进到 `implementation-ready` 后，才能创建 Sprint、Work Item implementation worktree 和首个 Slice。

## 首个可运行 Slice

- Slice ID：`human-review-evidence`
- 产出：当前证据绑定的 Human Review，以及只接受 `current candidate == integration base` 的 exact-base integration kernel；首 Slice 必须用新 interface 自审查、自验证、自集成并真实进入 `done`。
- 首要不确定性：Review 事务和最窄 state-parent anchor 能否闭合自举路径，不依赖旧 generic done 或尚未实现的通用 three-way merge。
- 非目标：candidate 已推进时的 three-way merge、Work Item Full、Promotion seal、stage Hook、targetRef 更新。

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | Confirmed P0-WI-01 requirements and current lifecycle facts |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-design.md` | Confirmed Promotion Pipeline design |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-solution-selected.md` | User-selected state-parent-anchor implementation bundle |
| `SPECS/FEATURES/lifecycle-completion/spec.md` | Persistent observable contract |
| `SPECS/FEATURES/lifecycle-completion/tasks.md` | Five sequential Slice plan, Write Scopes, Quick and rollback |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-implementation-amendment.md` | Self-hosting and frozen expected-Slice closure pending this release |
| `.harness/config.json` | Registered quick/full commands, critical user paths, cleanup and rollback |
| `SPECS/architecture.md` | Runtime, module, state and risk facts |
| Canonical stateRef `c4bb8e2ea8fa2f9c9ced6b8d68e62f1e2812d85b` | Current solution-selected Work Item identity |

## Implementation Workspace

After release only:

1. After release, update this document with the authorization/state transaction and commit it; record that resulting planning evidence commit/tree in a separate implementation receipt.
2. Create local branch `harness/wi/wi-20260805-31b819fc` from exact main/base `4173b4ac0639eb8db0623659798363854cde8d25`.
3. Create a linked implementation worktree; do not switch or move main.
4. Materialize confirmed planning evidence from the receipt-bound planning commit into that worktree. The first Slice owns and commits the persistent documents so candidate Source Register paths exist.
5. Run Context Guard for every managed `scripts/` write using one stable Work Item/Slice session. Honor first refusal and use only the same-session retry receipt.
6. Compute pinned raw-byte digests for the Feature Spec, Slice tasks, confirmed design and selected solution in the implementation worktree.
7. Create only `human-review-evidence` through `harness slice create`.
8. Once Slice 1 code provides `promotion plan`, freeze the five IDs, task/spec digests and this release transaction before Review/integration; later Slices wait for predecessor `done`.

## First Slice Write Boundary

Subtrees:

- `workflow/proposals/control-plane-convergence`
- `SPECS/FEATURES/lifecycle-completion`
- `memory/adr`

Exact governance files:

- `CONTEXT.md`
- `HARNESS.md`
- `.harness/manifest.json`
- `SPECS/architecture.md`
- `workflow/README.md`

Exact code/test files are listed under Slice 1 in `SPECS/FEATURES/lifecycle-completion/tasks.md`; the stateRef Slice spec must reproduce that scope exactly.

## Verification Plan

- Slice Quick：使用 `tasks.md` 中 Slice 1 的 exact `verification.quick`。
- Work Item Full：实现 Slice 3 后只走 Canonical `harness verify full`，不刷新 v1 historical report。
- Static/test/contracts/user paths/cleanup：从 candidate `.harness/config.json` 解析并执行。
- Context path：实际调用 Context Guard block/retry。
- Review path：实际提交 changes-requested、approved、idempotent replay 和 stale refusal。
- Plan path：实际验证 task/spec pin、release transaction、exact replay、prefix mismatch，以及 Slice 4 不能在 Slice 5 缺失时提前 seal。
- Integration path：Slice 1 实际 dogfood exact-base state-parent anchor 并自身进入 `done`；Slice 2 扩展并验证 scope-outside candidate progress、native three-way merge 与冲突矩阵。
- Final user path：通过 Stage Hook Adapter 与直接 CLI 对照同一 event。

## Commit And Recovery

- Planning evidence、每个 Slice source commit、candidate commit、state commit 和 transaction ID 分别记录。
- 每个 Slice 一次聚焦 code commit；不把五个 Slice压成一次提交。
- stateRef/candidate recovery 使用 first-parent + Canonical suspend/rollback；禁止直接删除 stateRef。
- targetRef/main 在 WI-01 全程不得移动。
- 临时 index、clone、worktree 测试资源必须在验证后清理。

## Release Gate

建议实现放行原话：

```text
批准 P0-WI-01 implementation-ready（含 self-hosting 与 frozen Slice Plan）
```

该原话同时批准 `lifecycle-completion-implementation-amendment.md` 的两个规划增量，只放行五 Slice WI-01 路径；不放行 targetRef Promotion、Acceptance、P0-WI-02 或 Control Plane Cutover。
