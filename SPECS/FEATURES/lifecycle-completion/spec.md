# Lifecycle Completion

## Status

Selected solution: `state-parent-anchor`. Implementation was authorized by user quote `批准 P0-WI-01 implementation-ready（含 self-hosting 与 frozen Slice Plan）`, state commit `97ae02236e36fb84a6ecbd545fbea13c02021f6b`, transaction `tx-e4750135-2f5b-4700-93e2-12d0aa0b3657`.

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | Confirmed REQ-P0-006 through REQ-P0-010 |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-implementation-amendment.md` | Approved self-hosting and frozen Implementation Plan closure |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-design.md` | Confirmed domain model, deep module interface and transaction boundaries |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-solution-options.md` | Compared reachability, merge and Full isolation bundles |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-solution-selected.md` | User-selected `state-parent-anchor` details |
| `CONTEXT.md` | Canonical Control Plane and Promotion Candidate language |
| `scripts/harness/lib/state-store.mjs`、`audit.mjs`、`git.mjs` | Existing state CAS, ledger and Git plumbing contracts |
| `scripts/harness/lib/slice.mjs`、`quick.mjs`、`ops.mjs` | Existing Slice/Quick lifecycle and evidence gaps |
| `scripts/harness-runtime.mjs`、`.harness/config.json` | Shared verification plan and project commands |
| `.agents/hooks/README.md` | Hook Adapter ownership constraint |

## Invariants

1. `refs/heads/harness/state` remains the sole mutable workflow state source; `workflow-state.json` stays frozen legacy evidence.
2. `refs/heads/main` does not move during P0-WI-01.
3. A state label never substitutes for evidence: review produces `human-reviewed`; integration produces `done`; Full plus seal produces Promotion Candidate.
4. Every state mutation remains one state commit and one stateRef CAS with root/per-item audit in the same tree.
5. An integration state commit has prior state as first parent and the new candidate commit as its only additional parent.
6. State history and recovery always follow first-parent. Candidate history follows normal candidate parents.
7. Candidate code trees never appear under the state tree and never require a dedicated candidate ref.
8. CLI and Hook Adapters contain no lifecycle evidence rules; both call `promotion-pipeline.mjs`.
9. Failure before stateRef CAS leaves targetRef/stateRef unchanged. Candidate objects created before a failed CAS may be unreachable and GC-eligible, but never visible through a ref or pipeline pointer.
10. P0-WI-01 may seal a Promotion Candidate but may not accept it, update targetRef or establish a new Accepted Baseline.

## State Topology

### State commit graph

For a non-integration transaction:

```text
S(n) -> S(n-1)
```

For a successful Slice integration:

```text
S(n) parents = [S(n-1), C(n)]
C(n) parent  = C(n-1)
```

`S(n)` has the state tree. `C(n)` has the candidate code tree. `readTreeFiles(S(n))` therefore continues to read only state files. Any operation walking state history must use first-parent semantics.

### Work Item namespace

```text
work-items/<work-item-id>/
  state.json
  audit.ndjson
  slices/<slice-id>.json
  reviews/<slice-id>/r<revision>/<review-id>.json
  facts/implementationPlan/r1.json
  promotion/pipeline.json
  reports/full/<report-id>.json
```

Historical review and Full records are immutable. Slice/pipeline documents hold current pointers and digests.

## Promotion Pipeline Record

`promotion/pipeline.json` version 1:

```json
{
  "version": 1,
  "workItemId": "wi-...",
  "baseAcceptance": {
    "commit": "<oid>",
    "tree": "<oid>"
  },
  "integrationCandidate": {
    "commit": "<oid>",
    "tree": "<oid>"
  },
  "implementationPlan": null,
  "integrations": [],
  "latestFullReport": null,
  "promotionCandidate": null,
  "updatedAt": "RFC3339"
}
```

If absent, the module derives an initial in-memory pipeline whose Integration Candidate equals `item.baseAcceptance`; the first pipeline mutation writes it. `baseAcceptance` never changes.

Each integration entry contains:

```json
{
  "sliceId": "human-review-evidence",
  "revision": 1,
  "sourceCommit": "<oid>",
  "integrationBaseCommit": "<oid>",
  "before": { "commit": "<oid>", "tree": "<oid>" },
  "after": { "commit": "<oid>", "tree": "<oid>" },
  "quickDigest": "<sha256>",
  "reviewDigest": "<sha256>",
  "integratedAt": "RFC3339",
  "transactionId": "tx-..."
}
```

Entries are append-only and ordered. There is at most one entry per Slice revision.

## Frozen Implementation Plan Contract

Before Review or integration of the first Slice, the Promotion Pipeline freezes one `implementationPlan` Fact Revision. Input fields are version, Work Item ID, taskRef/taskDigest, specDigest, ordered unique `sliceIds`, and the implementation-ready transaction ID. The module reads raw task/spec bytes, verifies pins, and proves the referenced state history event is the exact user-authorized `solution-selected → implementation-ready` transition.

Command:

```text
harness promotion plan --spec '<json>' [--json]
```

The existing Slice set must be an exact prefix of the plan; immediately after setup it is `[human-review-evidence]`. Exact replay is a no-op. Different content after freeze returns `E_IMPLEMENTATION_PLAN_MISMATCH` and never creates revision 2 in this Work Item.

After freeze, `slice create` accepts only the next planned ID and requires its planned predecessor done. Work Item Full and Promotion seal require every planned ID to exist and be done. `pipeline.json` stores only `{factRevision,digest}`; the immutable body lives at `facts/implementationPlan/r1.json`.


## Slice Extensions

Slice version remains compatible with existing records; newly created/revised Slices add:

```json
{
  "integrationBase": null,
  "currentHumanReview": null,
  "commit": null,
  "integrationCommit": null,
  "integratedAt": null
}
```

### Capturing integration base

`ready → implementing` writes `integrationBase={commit,tree}` from the current pipeline candidate in the same state transaction. A scope revision clears it with Quick/Review evidence and returns to `ready`.

Quick inputs use this captured commit as `baseIntegrationCommit`. Existing targetRef lookup is used only when the pipeline has not yet been materialized and must equal Work Item `baseAcceptance`.

## Human Review Contract

Command:

```text
harness slice review --slice <slice-id> --spec '<json>' [--json]
```

Input:

```json
{
  "reviewId": "platform-stable-slug",
  "reviewer": "non-empty identity",
  "disposition": "approved",
  "summary": "non-empty review outcome",
  "evidenceRefs": [
    { "ref": "review artifact reference", "digest": "sha256:..." }
  ]
}
```

`disposition` is `approved` or `changes-requested`. `reviewId` matches `[a-z0-9][a-z0-9-]{0,126}`. Unknown input fields fail closed.

The module derives and records Work Item, Slice/revision, integration base, current Quick digest, content/config/contract/dependency digests, reviewPath, timestamp and transaction ID. Callers cannot provide those bindings.

Preconditions:

- active Work Item and Slice status `runnable`;
- current passing Quick for the current revision;
- current content/config/contracts/dependencies equal Quick bindings;
- current pipeline base relevant to the Slice equals its captured integration base in owned scope.

`changes-requested` appends the immutable attempt and feedback, leaving status `runnable`. `approved` appends the attempt, sets a current pointer and atomically advances to `human-reviewed`.

Exact `reviewId` + exact canonical body is an idempotent no-op and creates no audit sequence. Same ID with different body returns `E_REVIEW_ID_CONFLICT`. Generic `slice advance ... human-reviewed` returns `E_REVIEW_REQUIRED`.

Review record version 1 contains `digest=digestOf(body)`. The Slice pointer contains only reviewId, digest, revision, Quick digest and integration base.

## Verified Contract

`human-reviewed → verified` remains a `slice advance` transition, but Promotion Pipeline rechecks current Quick and current Human Review after validating the transition table. Stale/missing evidence returns `E_REVIEW_STALE` or the existing Quick error. No new report is created; `verified` means all current evidence is ready for integration.

## Integration Contract

Command:

```text
harness slice integrate --slice <slice-id> --commit <source-oid> [--json]
```

Preconditions:

- Slice status is `verified` and transition to `done` is legal;
- Quick and approved Review remain current;
- source OID resolves to a single-parent commit whose parent equals Slice integration base;
- source diff paths all belong to normalized Write Scope, including rename source/destination;
- source tree's owned-scope manifest equals Quick content manifest;
- current candidate has not changed owned-scope paths relative to integration base;
- targetRef still equals Work Item baseAcceptance commit.

Implementation uses a unique owner-only temporary Git index. It performs native three-way merge with base=Slice integration base, ours=current candidate, theirs=source commit; unmerged entries or Git errors return `E_INTEGRATION_CONFLICT`. It writes a candidate tree and a Harness-authored single-parent commit whose parent is current candidate.

The state transaction then anchors that candidate, appends the integration record, updates pipeline current candidate, writes Slice `commit`, `integrationCommit`, `integratedAt`, advances `verified → done`, and emits one integration audit event. One stateRef CAS makes all facts visible.

Repeated integration of the same Slice revision/current result returns an idempotent no-op. A different commit for an already integrated revision returns `E_INTEGRATION_STALE`.

## State Anchor Contract

`StateTransaction.anchorCommit(oid)` is internal:

- it validates lowercase 40-hex commit OID shape, then Git verifies object type before commit;
- a second call with another OID is `E_STATE_ANCHOR_CONFLICT`;
- only integration operation calls it;
- `commitState` emits parents in strict order: prior state, then anchor;
- initial state creation cannot have an anchor;
- transaction result and integration audit include the anchor OID;
- `assertConsistent` additionally rejects an integration ledger event whose state commit lacks the recorded second parent when loaded by integrity-aware operations.

Non-integration state commits remain single-parent. State migration behavior remains unchanged.

## Work Item Full Contract

Command:

```text
harness verify full [--json]
```

Preconditions: active Work Item at `implementation-ready`; at least one Slice; every Slice `done`; pipeline current candidate exists; targetRef equals baseAcceptance.

Execution phases:

1. Load stateRef and bind state commit, candidate commit/tree, config digest, aggregated contract/dependency digests and integrated Slice list.
2. Create an owner-only temporary directory and `git clone --no-local` from the live repository.
3. Checkout exact candidate OID detached and verify its tree.
4. Parse candidate `.harness/config.json`; require valid full static/test plan, contract plan when contract sources exist, critical user paths, cleanup, rollback and timeout.
5. Execute each item with stdin closed, bounded output tail and timeout. Do not use the v1 stage/Sprint/report file mutation path.
6. Execute cleanup even after earlier check failures; cleanup failure makes Full fail.
7. Require clone worktree clean after cleanup and re-resolve candidate/config/contracts.
8. Remove clone in `finally`; cleanup inability is an execution failure recorded in the result.
9. Reload live stateRef and transactionally require every bound identity to match before writing the immutable report and pipeline pointer.

Full report version 1 records report ID/path, candidate/base identities, config, aggregate dependencies, Slice integrations, checks, critical paths, cleanup, rollback, status, generatedAt and freshness expiry. A failed report is audit evidence but not current passing evidence. A current passing report with identical bindings and unexpired freshness returns `reused:true` without a new state transaction.

Failures use `E_FULL_FAILED`; binding/freshness drift uses `E_FULL_STALE`; missing all-done preconditions uses `E_FULL_REQUIRED` or `E_PROMOTION_NOT_READY` as appropriate.

## Promotion Candidate Contract

Command:

```text
harness promotion seal [--json]
```

A single state transaction rechecks:

- every Slice is `done` and every pipeline integration matches its current revision;
- pipeline current commit/tree matches latest integration;
- latest Full is passed, current and unexpired;
- config/contract/dependency digests match Full;
- targetRef still equals Work Item baseAcceptance;
- no Promotion Candidate with a different identity exists.

It writes an immutable candidate record inside `pipeline.json` and emits `promotion-seal`. It does not create a new code commit or move any code ref. Exact replay is idempotent; conflict is `E_PROMOTION_EXISTS`.

## Stage Evidence Contract

Read-only command:

```text
harness gate stage --event '<json>' [--json]
```

Event version 1 fields are exactly: `eventId`, `workItemId`, `fromStage`, `toStage`, `stateCommit`, `actor`, `at`. Unknown/missing fields, invalid RFC3339, mismatched active item/stage or stale state OID return `E_STAGE_EVIDENCE`.

The interface first applies the lifecycle transition table. For `implementation-ready → acceptance-ready`, it additionally requires a current Promotion Candidate and targetRef/base identity. Other evidence rules remain in their owning modules. Result:

```json
{
  "allowed": true,
  "eventId": "...",
  "workItemId": "...",
  "fromStage": "implementation-ready",
  "toStage": "acceptance-ready",
  "stateCommit": "...",
  "promotionCandidate": { "commit": "...", "tree": "..." }
}
```

`opAdvance` calls the same evaluator inside its transaction before mutating. The Hook Adapter only serializes the platform event and invokes this command, then passes through output and exit status.

## Deep Module Interface

`promotion-pipeline.mjs` is the external seam:

```js
registerImplementationPlan(root, ctx, { plan })
submitHumanReview(root, ctx, { sliceId, review })
integrateSlice(root, ctx, { sliceId, sourceCommit })
runWorkItemFull(root, ctx)
sealPromotionCandidate(root, ctx)
evaluateStageEvidence(root, ctx, event)
```

It owns record paths/schema, canonical digests, currency decisions, merge checks, Full execution, Promotion seal and stage evidence. CLI/Hook, `ops.mjs`, `slice.mjs` and `quick.mjs` must not duplicate these decisions.

## Error Contract

New stable codes:
- `E_IMPLEMENTATION_PLAN_REQUIRED`
- `E_IMPLEMENTATION_PLAN_MISMATCH`

- `E_REVIEW_REQUIRED`
- `E_REVIEW_STALE`
- `E_REVIEW_ID_CONFLICT`
- `E_INTEGRATION_SCOPE`
- `E_INTEGRATION_CONFLICT`
- `E_INTEGRATION_STALE`
- `E_STATE_ANCHOR_CONFLICT`
- `E_FULL_REQUIRED`
- `E_FULL_FAILED`
- `E_FULL_STALE`
- `E_PROMOTION_NOT_READY`
- `E_PROMOTION_EXISTS`
- `E_STAGE_EVIDENCE`

Existing transition errors retain precedence over evidence errors. Malformed CLI/spec inputs are usage errors (exit 2); domain refusals are exit 1; successful/idempotent decisions are exit 0.

## Implementation Workspace Contract

After implementation-ready release:

1. Create local branch `harness/wi/wi-20260805-31b819fc` from exact base `4173b4ac0639eb8db0623659798363854cde8d25` and a linked implementation worktree.
2. Materialize the planning evidence bound by the implementation-ready document into that worktree without moving main.
3. The first Slice owns the permanent spec/task/process-document scope and includes it in its source commit, so candidate Source Register paths exist.
4. Run Context Guard with one stable session for every managed write in that worktree; first refusal must be honored and same-session retry used.
5. Create only the first Slice from the implementation-ready plan. Once Slice 1 code provides the command, register and freeze the five-Slice Implementation Plan before Review/integration.
6. Create and integrate one Slice at a time. The implementation branch may point to the current candidate for developer ergonomics, but candidate correctness/reachability never depends on that branch ref.
7. Remove the linked worktree only after evidence is durable; do not delete the active Work Item branch while work remains.

### Self-Hosting Closure

五个 Slice 不能依赖尚未实现的 integration 语义来关闭首 Slice。`human-review-evidence` 因此同时交付一个完整但严格受限的 exact-base integration kernel：只在 pipeline candidate 仍等于 Slice integration base 时接受 source commit，生成 candidate、设置 state commit anchor、写 integration evidence 并进入 `done`。本 Slice 必须用该新 interface 自审查、自验证和自集成；不得调用旧 generic advance 冒充 `done`。

`slice-integration-done` 在前一 Slice 已真实 `done` 后创建，并把 kernel 深化为 current candidate 已在 scope 外演进时的 native three-way merge、冲突与 drift 矩阵。该分层没有 placeholder：Slice 1 的 exact-base path 是首个 candidate 和无并发 candidate drift 的长期合法路径，Slice 2 只增加更一般的 merge capability。


## Verification Contract
- Implementation Plan tests cover task/spec digest drift, wrong release transaction, reordered/duplicate/omitted IDs, prefix mismatch, exact replay and early Full/seal refusal.


- Pure decisions are tested through `promotion-pipeline.mjs`; CLI/Hook behavior is tested through their external interfaces.
- Table fixtures replay success, refusal and repair flows in isolated Git repositories.
- State anchor tests inspect parent order, first-parent history, clone reachability, CAS drift and migration compatibility.
- Integration tests cover modes, symlinks, deletes, renames, scope escape, scope-local drift, non-overlap merge, conflicts and exact targetRef preservation.
- Full tests use real no-local clones and cover each registered command kind, user path, cleanup, dirty clone, timeout, output bounding, state drift, failure recording, current reuse and expiry.
- Promotion and stage tests cover missing/failed/stale Full, all-done, target drift, idempotence, event mismatch and CLI/Hook parity.
- Final dogfood forms one current Promotion Candidate for this Work Item while main remains unchanged.

## Out Of Scope

TargetRef Promotion, Acceptance Outcome, Accepted Baseline, Baseline Health, Workspace State, Control Plane Cutover, legacy runtime removal, reopen cascade, Project Profile, Skill Run and public Hook registration outside the repository remain out of scope.
