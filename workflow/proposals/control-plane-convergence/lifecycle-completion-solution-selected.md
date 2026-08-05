---
status: selected
activity: active-work-item-solution
initiativeId: control-plane-convergence
workItemId: wi-20260805-31b819fc
workItemStage: solution-selected
selectedOptionId: state-parent-anchor
selectedBy: user
selectedAt: 2026-08-05T15:30:27.539Z
selectionQuote: state-parent-anchor
selectionStateCommit: c4bb8e2ea8fa2f9c9ced6b8d68e62f1e2812d85b
selectionTransactionId: tx-d6712e1c-e32f-4e1a-816c-f6a20f1a7635
implementationAuthorized: false
---
# P0-WI-01 Lifecycle Completion 选定方案

## Selection

用户选择 `state-parent-anchor`。Canonical Control Plane 已用 state commit `c4bb8e2ea8fa2f9c9ced6b8d68e62f1e2812d85b`、transaction `tx-d6712e1c-e32f-4e1a-816c-f6a20f1a7635` 推进到 `solution-selected`。

该选择固定实现方向；不等于 implementation-ready 放行，不创建 Slice，也不授权修改 `scripts/` 或 `.agents/hooks/`。

## 为什么选择

- 保留现有单 stateRef CAS，不新增 candidate ref lifecycle。
- candidate 仍是普通 Git commit/tree，可直接用于隔离 Full 和未来 target Promotion。
- state rollback 与 candidate reachability 保持同一个 first-parent 恢复边界。
- 不提前实现 P0-WI-02 的 targetRef + stateRef acceptance transaction。
- 额外 parent 的关键可达性已用删除 direct ref 后的 no-local clone 实验验证。

## 固定 Git 拓扑

每次 Slice integration 产生 candidate `C(n)` 与 state commit `S(n)`：

```text
S(n) parents = [S(n-1), C(n)]
C(n) parent  = C(n-1)
```

约束：

1. state commit 第一 parent 永远是 prior state commit。
2. 普通 state mutation 没有额外 parent；integration state mutation 恰好一个 candidate parent。
3. state history、migration 和恢复只沿 first-parent 解释。
4. state commit tree 只保存 registry/Work Item/evidence/audit，不混入 candidate code tree。
5. targetRef 不移动；candidate 不创建 public/dedicated ref。
6. stateRef CAS 失败时 candidate 只是不可达 object，不留下可见部分结果。
7. Full/no-local clone 必须证明 candidate 通过 stateRef parent graph 可达。

## 固定 Candidate Merge

- `ready → implementing` 捕获当前 Integration Candidate 为 Slice integration base。
- source commit 必须是以该 base 为 first parent 的单 parent commit；越界 paths、merge commit 或 reviewed content 不匹配均拒绝。
- 使用独立临时 index 和 Git native three-way merge：base / current candidate / source commit。
- current candidate 在 Slice Write Scope 内相对 base 有变化时 fail closed；scope 外变化可由 Git merge 合并。
- merged tree 生成单 parent candidate commit，parent 为 current candidate。
- mode、symlink、delete 和 rename 由 Git tree/index 语义保留，不手写文件 patcher。
- 临时 index 在成功、拒绝、异常和 signal 路径都清理。

## 固定 State Transaction Extension

`StateTransaction` 增加内部 `anchorCommit(oid)` 能力：

- 只接受完整 commit OID；
- 同一 transaction 最多调用一次；
- 非 integration operation 不可设置；
- `commitState` 按 `[priorState, anchor]` 顺序生成 parents；
- `transact` 仍只 CAS stateRef；
- 返回值显式包含 `anchorCommit` 供测试与 audit 对照。

该能力是 `promotion-pipeline.mjs` implementation 的内部 seam，不暴露为用户通用“任意 parent”命令。

## 固定 Evidence Records

```text
work-items/<work-item-id>/
  reviews/<slice-id>/r<revision>/<review-id>.json
  promotion/pipeline.json
  reports/full/<report-id>.json
```

- `reviewId` 必须是调用方稳定 event ID，满足 lowercase slug；路径直接使用规范化 ID。
- 同 `reviewId` + 同 canonical digest 为幂等 no-op；同 ID 不同 digest 返回 `E_REVIEW_ID_CONFLICT`。
- review/full body 用现有 `canonicalJson` / `digestOf` 计算 digest。
- Full report ID 使用 `full-<UTC compact timestamp>-<transaction suffix>`，历史永不覆盖；pipeline 只保存 current pointer/digest。
- Slice 保存 current review pointer 与 integration identity，不复制完整 record。

## 固定 Full Isolation

Work Item Full 使用独立 `git clone --no-local`：

1. 固定 live state/candidate/config/contracts/dependencies identity；
2. clone 当前 repository，并 checkout 精确 candidate OID；
3. 从 candidate `.harness/config.json` 解析 full static/test/contracts/user paths/cleanup；
4. 执行时 stdin 关闭、统一 timeout、输出 tail 有界；
5. 运行 cleanup 后要求 clone worktree clean；
6. 复核 candidate commit/tree 与所有输入 digest；
7. 删除 clone；
8. live stateRef CAS transaction 重新验证并写 report/audit。

clone 创建失败、命令失败、cleanup 失败或 live identity 漂移都不能产生 current passing Full。identity 相同且 freshness current 的 passing report可幂等复用。

## 固定 Stage Event

最小 event envelope：

```json
{
  "version": 1,
  "eventId": "platform-stable-id",
  "workItemId": "wi-...",
  "fromStage": "implementation-ready",
  "toStage": "acceptance-ready",
  "stateCommit": "<expected stateRef oid>",
  "actor": "developer|user|agent",
  "at": "RFC3339"
}
```

Adapter 只验证基本 JSON shape 并调用 `harness gate stage --event`；workItem、stage、state commit 与 evidence 是否 current 全由 `promotion-pipeline.mjs` 判断。真正 `advance` 在 CAS transaction 内再次判断。

## 固定 External Interface

```js
registerImplementationPlan(root, ctx, { plan })
submitHumanReview(root, ctx, { sliceId, review })
integrateSlice(root, ctx, { sliceId, sourceCommit })
runWorkItemFull(root, ctx)
sealPromotionCandidate(root, ctx)
evaluateStageEvidence(root, ctx, event)
```

CLI：

```text
harness promotion plan --spec '<json>' [--json]
harness slice review --slice <id> --spec '<json>'
harness slice integrate --slice <id> --commit <oid>
harness verify full [--json]
harness promotion seal [--json]
harness gate stage --event '<json>' [--json]
```

CLI 与 Hook 是 Adapter，不拥有第二份领域规则。

## 实现顺序

1. `human-review-evidence`
2. `slice-integration-done`
3. `work-item-full-verification`
4. `promotion-candidate`
5. `stage-evidence-hook`

共享 module/CLI 文件意味着这些 Slice 按序创建；前一 Slice `done` 释放 scope 后再创建后一 Slice。每个 Slice 必须提供实际可运行能力，不提交 placeholder interface。

**Self-hosting closure:** `human-review-evidence` 同时包含一个只支持 `current candidate == integration base` 的完整 integration kernel，并用它把自身真实推进到 `done`。`slice-integration-done` 再加入 candidate 已在 scope 外演进时的 native three-way merge。禁止用现有 generic `slice advance ... done` 作为自举例外。

**Frozen completion set:** Slice 1 code完成后、Review/integration 前，`promotion plan` 必须把 `tasks.md`/`spec.md` digests、implementation-ready transaction 和五个 ordered Slice IDs 冻结进 stateRef。后续 Slice create、Full 和 seal 不得从“当前已有记录”猜测 Work Item 是否完整。

## Rollback

- 每个实现 Slice 一个聚焦 code commit；回退使用记录的 source/integration commit 和 Canonical Control Plane rollback/suspend semantics。
- integration stateRef mutation 的 first-parent 回退会同时移除 candidate anchor；禁止单独删除 candidate object。
- Full clone、临时 index 是临时资源，失败必须清理，不进入 repo 事实源。
- targetRef 在 WI-01 不变，因此任何 Slice 回退不得更新 main。

## 仍未授权

- 未进入 `implementation-ready` 前，不得创建实现 Slice 或修改受管代码。
- 未经 Context Guard，不得写 `scripts/` 或 `.agents/hooks/`。
- 不得把本方案扩展为 P0-WI-02 target/state 原子 acceptance。
- 不得启动 P0-WI-02 或关闭 P0-WI-01。

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-implementation-amendment.md` | Pending implementation-release approval for self-hosting and frozen completion set |
| `workflow/proposals/control-plane-convergence/requirements.md` | 已确认行为与 P0 边界 |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-design.md` | 已确认 domain/module/transaction design |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-solution-options.md` | 三方案比较、推荐和 Git experiment evidence |
| `scripts/harness/lib/state-store.mjs`、`git.mjs` | Selected option 深化的现有 transaction/plumbing |
| stateRef transaction `tx-d6712e1c-e32f-4e1a-816c-f6a20f1a7635` | Exact user selection history |
