---
status: confirmed
activity: active-work-item-design
initiativeId: control-plane-convergence
workItemId: wi-20260805-31b819fc
workItemStage: design-confirmed
requirementsRef: workflow/proposals/control-plane-convergence/requirements.md#lifecycle-completion
requirementsConfirmedBy: user
requirementsConfirmedAt: 2026-08-05T15:10:42.981Z
requirementsConfirmationQuote: 确认 P0-WI-01 需求基线
designVersion: 1
designConfirmed: true
designConfirmedBy: user
designConfirmedAt: 2026-08-05T15:20:34.102Z
designConfirmationQuote: 确认 P0-WI-01 技术设计
designStateCommit: f2bb5e29645719104ce0d2808c0947f4e8aaffd8
designTransactionId: tx-ba0801f6-57e4-4166-b178-2f02a9baab6f
---
# P0-WI-01 Lifecycle Completion 技术设计

> 本文定义并记录已确认的 Lifecycle Completion 领域模型、module interface、状态绑定和事务边界。确认不选择候选持久化方案，不创建 Slice，也不授权实现。

## 目标

Canonical Control Plane 必须把一组 Slice 从实现推进到一个精确、当前且已 Full 验证的 Promotion Candidate，同时保持 `refs/heads/main` 不变。状态标签只能表达已经由证据证明的事实：

- `human-reviewed` 表示当前 Slice revision、当前 Quick、审查基线和 reviewer 已绑定；
- `done` 表示当前 revision 已实际集成到唯一 Integration Candidate；
- Work Item Full 表示登记的静态检查、测试、契约、关键用户路径和清理已在精确候选上实际执行；
- Promotion Candidate 表示 Integration Candidate commit/tree 与 current Full evidence 已一起封存；
- 阶段 Hook 与 CLI 对相同 state identity 使用同一领域门禁。

## 非目标

- 不更新 targetRef，不建立 Acceptance Outcome 或 Accepted Baseline；这些属于 P0-WI-02。
- 不切换公共 CLI、legacy Hook、检查器或文档入口；这些属于 P0-WI-03。
- 不实现 reopen 级联、Profile、Skill Run、Baseline Health 或 Workspace State。
- 不复用 v1 `workflow-state.json`、`.harness/verification-report.json` 或 `harness-verify.mjs` 作为 Canonical Work Item 的可变事实源。
- 不在设计阶段决定候选 Git 对象如何持久可达、Full 使用 clone 还是 worktree、或最终 CLI JSON 字段命名。

## 当前模块与缺口

| Module | 当前 leverage | Lifecycle Completion 缺口 |
| --- | --- | --- |
| `lifecycle.mjs` | 六类型阶段表与合法转移 | 不判断 Promotion evidence |
| `state-store.mjs` | stateRef snapshot、单 commit、CAS、统一 audit | 不保证候选代码对象随 stateRef 原子可达 |
| `slice.mjs` | Slice DAG、scope、revision、六态；已有 review/integration 字段 | review/integration 字段尚无生成与 current 判定 |
| `quick.mjs` | 当前 revision 的内容/config/contract/dependency/Quick 绑定 | base 只取 targetRef，不能表达演进的 Integration Candidate |
| `ops.mjs` | Work Item/Slice mutation 编排 | `human-reviewed`、`verified`、`done` 仍可由状态推进冒充证据 |
| `cli.mjs` | 统一命令 Adapter 与稳定退出码 | 没有 review、integration、Work Item Full、promotion、stage gate 命令 |
| `.agents/hooks/` | 平台事件到统一检查入口的薄 Adapter | 没有 v2 stage-evidence Adapter |
| `harness-verify.mjs` | v1 Full 命令、用户路径、清理执行 | 绑定 legacy stage、Sprint 和工作区文件，不能背书 v2 candidate |

结论：现有 `state-store.mjs` 继续拥有状态事务；新增 Promotion Pipeline module 统一拥有 lifecycle evidence 规则。不得把同一规则分别写进 CLI、Hook、Slice module 和 Full runner。

## 领域模型

### Human Review Attempt

一次不可变审查提交。调用方提供 `reviewId`、reviewer、disposition、summary 和 evidence refs；Promotion Pipeline 从 stateRef 派生并绑定：

- Work Item ID；
- Slice ID 与 revision；
- Slice integration base commit；
- current Quick report digest；
- content/config/contract/dependency digests；
- review path；
- 提交时间和 transaction ID。

`changes-requested` 只追加 attempt 与 feedback，Slice 保持 `runnable`。`approved` 同事务更新 `currentHumanReview` 并执行 `runnable → human-reviewed`。同一 `reviewId` 的精确重放是幂等 no-op；内容不同的重放硬拒绝。

### Current Human Review

Slice 上的轻量不可变指针，至少包含 `reviewId`、attempt digest、revision、Quick digest 和 integration base。以下任一变化使它不再 current：revision、Quick binding、scope content、config、contract/dependency 或 integration base。

### Integration Candidate

Work Item 内唯一、线性演进的候选 commit/tree。初始 identity 等于 Work Item `baseAcceptance`；每个成功集成的 Slice 产生一个新的 candidate commit/tree。targetRef 全程保持 Work Item base commit。

### Slice Integration

一次不可变集成记录，绑定：

- Slice ID/revision；
- source commit；
- integration base commit；
- current Human Review 与 Quick digest；
- 集成前 candidate commit/tree；
- 集成后 candidate commit/tree；
- transaction ID 与时间。

`done` 只由成功的 integration operation 产生。调用方不能用通用 `slice advance` 直接进入 `done`。

### Work Item Full Report

在精确 Integration Candidate 上执行的不可变报告。它绑定 candidate commit/tree、配置、聚合 contract/dependency identities、命令与结果、关键用户路径、清理、执行环境和时间。失败报告可以审计，但不能成为 current Full。

### Promotion Candidate

当全部 Slice `done`、Integration Candidate 唯一且 latest Full passed/current 时封存的不可变记录：

- Work Item ID；
- candidate commit/tree；
- base accepted commit/tree；
- Full report ID/digest；
- config 与聚合 contract/dependency digest；
- integrated Slice revision/digest 清单；
- seal transaction ID/time。

P0-WI-01 只建立该记录，不更新 targetRef。

### Stage Evidence Decision

针对 `{workItemId, fromStage, toStage, stateCommit}` 的只读决定。它组合唯一 lifecycle transition table 与 Promotion Pipeline evidence；输出 `allowed` 或稳定错误。Hook Adapter 和 CLI 使用同一 interface，mutation 在 CAS 前再次判断，避免 read-check/write 的 TOCTOU。

## Slice 状态语义

```text
ready
  -> implementing       capture slice integration base
  -> runnable           require current passing Quick
  -> human-reviewed     only submitHumanReview(approved)
  -> verified           re-check current Quick + current Human Review
  -> done               only integrateSlice(success)
```

附加约束：

1. `ready → implementing` 固定当前 Integration Candidate 为该 Slice 的 integration base。
2. Quick 绑定 Slice integration base，而不是每次查询时的全局 targetRef tip。
3. 其他非重叠 Slice 推进全局 candidate 时，已绑定 Slice 的证据仍按其固定 integration base 判断；integration 必须验证当前 candidate 在该 Slice scope 内未从该 base 漂移。
4. scope 内漂移、merge conflict 或 reviewed content 不匹配时，integration fail closed。
5. scope revision 清除 integration base、Quick 和 current review，并回 `ready`；`done` Slice 仍不可修订。
6. `verified` 是“证据当前且可集成”，`done` 是“已集成”；两者不可合并为一个状态标签。

## stateRef 布局

```text
work-items/<work-item-id>/
  state.json
  slices/<slice-id>.json
  reviews/<slice-id>/r<revision>/<review-id>.json
  promotion/pipeline.json
  reports/full/<report-id>.json
  audit.ndjson
```

`promotion/pipeline.json` 是 Work Item Promotion Pipeline 的单一状态记录：

```json
{
  "version": 1,
  "workItemId": "wi-...",
  "baseAcceptance": { "commit": "...", "tree": "..." },
  "integrationCandidate": { "commit": "...", "tree": "..." },
  "integrations": [],
  "latestFullReport": null,
  "promotionCandidate": null
}
```

历史 review/full records 不覆盖；Slice 与 pipeline 只保存 current pointer 和 immutable record digest。根 audit 仍是唯一权威账本，per-item audit 仍是同事务派生视图。

## Deep Module

新增 `scripts/harness/lib/promotion-pipeline.mjs`。它是外部 seam，callers/tests 只学习下列 interface 与错误模式：

```js
submitHumanReview(root, ctx, { sliceId, review })
integrateSlice(root, ctx, { sliceId, sourceCommit })
runWorkItemFull(root, ctx)
sealPromotionCandidate(root, ctx)
evaluateStageEvidence(root, ctx, event)
```

Module implementation 内部拥有：

- evidence canonicalization 与 digest；
- Quick/Review/current candidate 的一致性判断；
- Git diff/scope/merge 检查；
- Full 执行计划、隔离、清理和报告；
- Promotion seal 前置；
- 稳定错误选择；
- stateRef writes 与 audit events。

不新增 `review.mjs`、`integration.mjs`、`full.mjs` 等只做透传的浅 modules。内部纯 helper 可以拆分，但不扩大外部 interface。Git 是本项目固有 local dependency，隔离临时仓库就是测试 stand-in，不引入假想 Git port。

## Adapter Interfaces

拟议 CLI Adapter：

```text
harness slice review --slice <id> --spec '<json>'
harness slice integrate --slice <id> --commit <oid>
harness verify full [--json]
harness promotion seal [--json]
harness gate stage --event '<json>' [--json]
```

`slice review` spec 只允许调用方提供人类事实：`reviewId`、`reviewer`、`disposition`、`summary`、`evidenceRefs`。revision、Quick、baseline、content/config/contract digests 全部由 module 派生，禁止由 Adapter 传入并冒充 current。

Stage Hook Adapter 只把平台事件规范化为 `harness gate stage` 输入，并透传 stdout/stderr/exit code；不得包含 lifecycle、review、Full 或 Promotion 规则。直接 CLI advance 在 mutation 内调用同一 evidence decision，Hook 不能成为绕过或第二事实源。

## 事务边界

### Human Review

一个 stateRef transaction 同时追加 immutable attempt、更新 Slice pointer/status、写 root/per-item audit。任何 binding 漂移都发生在 write 前并拒绝整个事务。

### Slice Integration

1. 读取并固定 stateRef commit、Slice revision、Quick、Review、integration base 和 current candidate。
2. 验证 source commit 的变化全部位于 Write Scope，内容与 reviewed digest 一致。
3. 以 Git 原生三方语义把 Slice 变化应用到 current candidate；冲突或 scope 内 candidate drift 失败。
4. 创建新的 candidate commit/tree，但不移动 targetRef。
5. 用一个可恢复原子机制同时保证 candidate 可达、Slice=`done`、pipeline pointer、integration record 与 audit 可见。
6. stateRef CAS 漂移时，不留下可见 ref 或部分状态；未引用 Git objects 可由 GC 清理。

“可达 + stateRef 原子机制”的具体实现是方案选择项，技术设计只固定其效果。

### Work Item Full

Full 是 execute-then-record：

1. 固定 stateRef/candidate/config/contracts/dependencies identity；
2. 在与调用者工作区隔离的 candidate checkout 中执行登记的 static/test/contracts/user paths/cleanup；
3. 执行后复核 candidate checkout 与输入 identity；
4. 重新加载 live stateRef，在 CAS transaction 内逐项复核；
5. identity 未漂移时写 immutable report/current pointer/audit；漂移则报告不得背书当前候选。

同 identity 的 current passing Full 可幂等复用；超过 freshness policy 或任一 binding 漂移必须实际重跑。失败且 identity current 的报告仍落账，但 `promotion seal` 拒绝。

### Promotion Seal

一个 stateRef transaction 重新验证 all-done、唯一 candidate、targetRef 仍为 base、latest Full passed/current 和所有聚合 digest，然后写 immutable Promotion Candidate 与 audit。重复 seal 同一 identity 是幂等 no-op；不同 identity 已存在时硬拒绝。

### Stage Gate

Hook 只读检查返回 decision；真正 `advance` 在同一 stateRef transaction 内重新检查。`implementation-ready → acceptance-ready` 必须存在 current Promotion Candidate。P0-WI-01 之前的需求、设计和方案人工门禁继续使用现有 lifecycle quote/history，不由 Promotion Pipeline 自动确认。

## Stable Error Interface

| Code | 语义 |
| --- | --- |
| `E_REVIEW_REQUIRED` | 试图用通用 advance 冒充 Human Review |
| `E_REVIEW_STALE` | revision、Quick、baseline 或 digest 已漂移 |
| `E_REVIEW_ID_CONFLICT` | 同一 reviewId 对应不同内容 |
| `E_INTEGRATION_SCOPE` | source commit 变化越出 Write Scope |
| `E_INTEGRATION_CONFLICT` | current candidate 无法无冲突集成 |
| `E_INTEGRATION_STALE` | source/review/Quick/candidate binding 已漂移 |
| `E_FULL_REQUIRED` | 没有 current passing Work Item Full |
| `E_FULL_FAILED` | Full 实际执行失败 |
| `E_FULL_STALE` | Full binding 或 freshness 已失效 |
| `E_PROMOTION_NOT_READY` | all-done/candidate/Full/target 前置不满足 |
| `E_PROMOTION_EXISTS` | 已封存不同 identity 的 candidate |
| `E_STAGE_EVIDENCE` | 阶段事件缺失或与 active state 不一致 |

转移表错误仍优先返回既有 `E_ILLEGAL_SLICE_TRANSITION` / `E_ILLEGAL_TRANSITION`；证据门禁不得掩盖跳状态错误。

## 漂移与失败矩阵

| 情形 | 决定 | 可见状态 |
| --- | --- | --- |
| Quick/content/config/contract drift | review/verified/integration 拒绝 | 原状态不变 |
| reviewId 精确重放 | 幂等 no-op | 无新 attempt/audit sequence |
| reviewId 内容冲突 | 拒绝 | 原状态不变 |
| candidate 只在 scope 外推进 | integration 可在原生 merge 校验后继续 | 新 candidate + done 同事务 |
| candidate 在 scope 内推进 | 拒绝并要求新 revision/evidence | 原状态不变 |
| integration merge conflict | 拒绝 | target/state refs 不变；临时对象可 GC |
| Full command/user path/cleanup 失败 | 记录 failed report | candidate 不变，不能 seal |
| Full 执行期间 stateRef/candidate 漂移 | 报告不成为 current | live state 不变 |
| seal 前 targetRef 漂移 | 拒绝 | target/state refs 不变 |
| Hook 与 CLI 输入相同 | 相同 decision/error | Hook 无自有规则 |

## 验证策略

外部 module interface 与 CLI 是主要 test surface：

1. 表驱动 fixtures 覆盖每个正常路径与稳定拒绝码；真实 stateRef tree/audit 为断言对象。
2. Git 临时仓库覆盖 source diff scope、mode/symlink、non-overlap merge、scope conflict、candidate reachability 和 CAS drift。
3. Human Review 覆盖 missing/stale Quick、错 revision、reviewId 重放/冲突、changes-requested、approved 与 scope revision 失效。
4. Integration 覆盖未 reviewed、未 verified、越界 diff、candidate scope drift、merge conflict、重复 integrate 和 targetRef 不动。
5. Full 覆盖 static/test/contracts/user paths/cleanup 各自失败、执行后漂移、失败报告、current reuse 和 freshness 重跑。
6. Promotion seal 覆盖 not-all-done、Full missing/failed/stale、target drift、重复/冲突 seal。
7. Hook parity 用同一 fixture event 比较直接 CLI 与 Adapter 的 JSON、stderr 和 exit code。
8. 最后用当前仓库 dogfood Work Item 形成真实 Promotion Candidate；验证 targetRef 仍为 `4173b4ac...`。

## 交付 Slice 顺序

共享 module 与 CLI 文件会重复修改，现有 Write Scope 规则要求前一个 Slice `done` 释放 scope 后再创建后一个 Slice；因此按下列顺序逐个声明和集成：

1. `human-review-evidence`：建立 module seam、review records/current 判定和 review transition。
2. `slice-integration-done`：加入 integration base、Git merge、candidate chain 和 done 语义。
3. `work-item-full-verification`：加入隔离 Full runner、report/current 判定。
4. `promotion-candidate`：加入 seal、Promotion Candidate 与 acceptance-ready gate。
5. `stage-evidence-hook`：加入通用 stage event interface 和薄 Hook Adapter，复用前四步规则。

每个 Slice 都必须独立可运行、可验证、可回退；不得提前提交空 method、placeholder command 或只写 schema 的 scaffold。

## 留给 Solution Options 的实现选择

设计确认后至少比较：

1. candidate reachability：state commit graph anchor、atomic candidateRef + stateRef、或 state-owned tree；
2. candidate merge implementation：临时 index 三方 merge或等价 plumbing；
3. Full isolation：独立 clone 或受控 worktree；
4. review/full immutable records 的 path 与 ID 编码；
5. Stage Hook event 的最小稳定 JSON schema。

方案必须满足本设计全部 invariants；不能用“先写状态、后补 ref”“依赖当前工作区 HEAD”或 Hook 内规则复制降低实现难度。

## Design Confirmation

用户以原话 `确认 P0-WI-01 技术设计` 确认本设计。Canonical Control Plane 已通过 state commit `f2bb5e29645719104ce0d2808c0947f4e8aaffd8`、transaction `tx-ba0801f6-57e4-4166-b178-2f02a9baab6f` 推进到 `design-confirmed`。

该确认只认可领域模型、module seam、状态语义与事务边界；不等于选择 solution option 或授权实现。

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | REQ-P0-006 至 REQ-P0-010 与确认原话 |
| `workflow/proposals/control-plane-convergence/roadmap.md` | 五个有序 Slice、Outcome 与退出标准 |
| `CONTEXT.md` | Canonical Control Plane、Promotion Candidate 等领域语言 |
| `scripts/harness/lib/state-store.mjs`、`audit.mjs` | 当前 CAS、transaction 与 ledger invariants |
| `scripts/harness/lib/slice.mjs`、`quick.mjs` | 当前 Slice/Quick 状态、bindings 与占位字段 |
| `scripts/harness/lib/ops.mjs`、`cli.mjs` | 当前 mutation/Adapter seam 与绕过缺口 |
| `scripts/harness-verify.mjs`、`.harness/config.json` | v1 Full 能力与 v2 隔离需求 |
| `.agents/hooks/README.md`、`check-harness.mjs` | 薄 Adapter 约束 |
| `memory/adr/0001-canonical-control-plane-cutover.md` | Bootstrap 与 Cutover 分离 |
| `memory/adr/0002-acceptance-baseline-health.md` | Acceptance/Promotion 留给 P0-WI-02 的边界 |
| stateRef transaction `tx-7fd30187-0c4c-4bf4-9f82-da9ff7821f29` | P0-WI-01 requirements confirmation identity |
| stateRef transaction `tx-ba0801f6-57e4-4166-b178-2f02a9baab6f` | P0-WI-01 design confirmation identity |
