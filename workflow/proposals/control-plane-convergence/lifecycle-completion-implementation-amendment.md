---
status: pending-user-approval
activity: implementation-planning-amendment
initiativeId: control-plane-convergence
workItemId: wi-20260805-31b819fc
workItemStage: solution-selected
selectedOptionId: state-parent-anchor
amendmentVersion: 1
approved: false
approvedBy: null
approvedAt: null
approvalQuote: null
---
# P0-WI-01 Implementation Planning Amendment

## Why This Amendment Exists

Detailed Slice planning exposed two self-hosting gaps that were not explicit in the confirmed design:

1. `human-review-evidence` cannot become a truthful `done` by depending on the general integration capability scheduled for Slice 2. Slice 2 cannot start before Slice 1 is done and needs the same Write Scope.
2. Promotion seal cannot interpret “all currently created Slices are done” as Work Item completion. After Slice 4, Slice 5 has not yet been created, so the set must be frozen independently.

Using the old generic `slice advance ... done` for bootstrap would violate REQ-P0-007. Allowing seal to infer completion from current records would permit an incomplete Promotion Candidate. Both fail closed requirements.

## Amendment A — Exact-Base Self-Integration

Slice 1 additionally delivers a complete, narrow integration kernel:

- accepted only when current Integration Candidate exactly equals Slice integration base;
- source commit must have that base as its single parent;
- reviewed scope content must match source tree;
- candidate commit is anchored as the state commit second parent;
- Slice/pipeline/audit/done become visible in one stateRef CAS;
- any candidate drift rejects; general three-way merge remains Slice 2.

Slice 1 uses the new Review, verified gate and exact-base integration commands on itself. This is a permanent legal path for the first/no-drift candidate, not a placeholder or bootstrap exception.

## Amendment B — Frozen Implementation Plan

Promotion Pipeline adds an immutable Implementation Plan fact before Slice 1 review/integration:

```json
{
  "version": 1,
  "workItemId": "wi-20260805-31b819fc",
  "taskRef": "SPECS/FEATURES/lifecycle-completion/tasks.md",
  "taskDigest": "sha256:<actual-at-registration>",
  "specDigest": "sha256:<actual-at-registration>",
  "sliceIds": [
    "human-review-evidence",
    "slice-integration-done",
    "work-item-full-verification",
    "promotion-candidate",
    "stage-evidence-hook"
  ],
  "implementationReadyTransactionId": "<actual-release-tx>"
}
```

New internal interface and CLI:

```js
registerImplementationPlan(root, ctx, { plan })
```

```text
harness promotion plan --spec '<json>' [--json]
```

The module verifies that:

- active Work Item is `implementation-ready`;
- referenced transaction is that Work Item's exact `solution-selected → implementation-ready` history event with the user release quote;
- task/spec files exist and actual raw-byte SHA-256 equals supplied pins;
- sliceIds are unique, ordered and non-empty;
- any already-created Slices are an exact prefix of the plan (initially only `human-review-evidence`);
- exact replay is idempotent; different content is permanently rejected.

Future `slice create` must match the next expected ID and requires its predecessor done. Work Item Full and Promotion seal require every planned ID to exist at its frozen revision lineage and be done. Thus Slice 4 cannot seal before Slice 5.

## Scope Effect

- Adds `registerImplementationPlan` to the confirmed deep module interface.
- Adds immutable `facts/implementationPlan/r1.json` and a pipeline pointer/digest.
- Adds stable errors `E_IMPLEMENTATION_PLAN_REQUIRED` and `E_IMPLEMENTATION_PLAN_MISMATCH`.
- Expands Slice 1 scope/tests; Slice count, order, selected reachability solution and P0 boundary do not change.
- Does not move targetRef, authorize implementation, create a Slice or change current stateRef stage.

## Approval Gate

Approval of implementation-ready must explicitly include this amendment. Suggested exact quote:

```text
批准 P0-WI-01 implementation-ready（含 self-hosting 与 frozen Slice Plan）
```

This approval authorizes only the selected five-Slice WI-01 implementation path. It does not authorize Acceptance, targetRef Promotion, P0-WI-02 or Cutover.

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | Truthful done and complete Promotion Candidate requirements |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-design.md` | Confirmed evidence and transaction model |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-solution-selected.md` | Selected state-parent-anchor topology |
| `SPECS/FEATURES/lifecycle-completion/spec.md` | Incorporates the pending amendment into implementation contract |
| `SPECS/FEATURES/lifecycle-completion/tasks.md` | Incorporates self-hosting and expected Slice closure into Slice 1 |
