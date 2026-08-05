---
status: authorization-ready
activity: non-active-proposal
planVersion: 1
initiativeId: control-plane-convergence
selectedOptionId: rehearsed-guarded-bootstrap
generatedAt: 2026-08-05T14:37:55Z
finalizedAt: 2026-08-05T14:43:33Z
preRehearsalPlanSha256: e8df81897b47009c3a616542d9a73219d6ca7723056a92cef608716a173d43bf
rehearsalSha256: eb67b3d3b8c82e36b1a8684bf75efc294f47d603a35d5bf96a82e8ce4eec712b
planSha256: 7c802adb38fa81c6a719a42c11c774a3e223ad94bebd286ecf68edc651890b3c
digestAlgorithm: SHA-256 of this file with planSha256 replaced by 64 ASCII zeroes
authorizationEligible: true
executionAuthorized: false
---
# State Bootstrap Plan

> 这是绑定当前仓库 identities 的实际 Plan，但 clone migration 与 rollback rehearsal 尚未执行。当前 Plan 不具备执行授权资格，任何 Git ref mutation 都被禁止。

## Plan Identity

| Field | Value |
| --- | --- |
| Plan version | `1` |
| Initiative | `control-plane-convergence` |
| Selected option | `rehearsed-guarded-bootstrap` |
| Repository root | `/Users/kanehua/project/kit-test`，仅用于本地核对 |
| Planning branch | `harness/control-plane-convergence-planning` |
| Planning commit | `7bcb9de05a1c7575ce30ab7eb65faa54f39529d4` |
| Planning tree | `efa78011b774ee9e39751bdda7a9905707fe0286` |
| Target ref | `refs/heads/main` |
| Target commit | `4173b4ac0639eb8db0623659798363854cde8d25` |
| Target tree | `193cdd7cd5bf0d013b0775d75004e56a8aa54eb2` |
| Effective config | `.harness/config.json` |
| Config SHA-256 | `2ed34231cca148f0fa201af8d5b48fe559f472f3a10134f8d32ff146fefe1470` |
| State ref | `refs/heads/harness/state`，必须不存在；preflight 已确认不存在 |
| Migration backup ref | `refs/heads/harness/state-migration-backup`，必须不存在；preflight 已确认不存在 |

## Confirmed Planning Sources

| Source | SHA-256 |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | `235345aaad29bf35a0f6db58ea6ee9a006163a3b1e81c2b2ce3115cd931c9674` |
| `workflow/proposals/control-plane-convergence/solution-selected.md` | `9db3bdc90bd15deb7dcc387a528774d8baedc7b29561f5736ab7c7363f18e04c` |
| `workflow/proposals/control-plane-convergence/bootstrap-runbook.md` | `2eea85a8464a4933396d8cfcb1a2fa01bb651a54314e9b6d63907ef213490f31` |

These files are contained in the Planning commit and must match these bytes in the independent clone. Changes require a new Planning commit and invalidate this Plan.

## Legacy Input Identity

| Field | Value |
| --- | --- |
| v1 source path | `workflow-state.json` |
| v1 raw SHA-256 | `56a42ff5e2771681d91d4df8a16cae94a940afa915df284969b5f469dcf8c59c` |
| v1 stage | `accepted` |
| History entries | `6` |
| Last transition | `implementation-ready → accepted` |
| Last transition at | `2026-08-03T16:39:20.909Z` |
| Last user quote | `验收通过` |
| Confirmation | user / `2026-08-03T16:39:20.909Z` / `验收通过` / `workflow/acceptance.md` |
| Selection | user / `2026-08-03T15:35:10.332Z` / `unified-guard` / `workflow/solution-selected.md` |

## Historical Acceptance Evidence

| Evidence | Identity |
| --- | --- |
| Acceptance document | `workflow/acceptance.md`, SHA-256 `05579ac0e448571eb4b4a34e821fca02053b5e17a069ffbbfeae7e63819843e4` |
| Historical Full report | `.harness/verification-report.json`, SHA-256 `3277cf05b74c7486bb858f2f0b5a09f940fc947e65503262ef0848346b3e133f` |
| Report ID | `verify-20260803163758110` |
| Report generated | `2026-08-03T16:37:58.110Z` |
| Report profile/status | `full / passed` |
| Report workspace head | `b0ad93a84054efed9458dc0ecbc425f4c51f0ec7` |
| Report workspace digest | `ce30e64b89d6799ba81c70c426402265e4f647b8fdea5d27b4589a7e9a182860` |
| Sprint evidence | `tasks/sprint-02.md`, SHA-256 `763e8b77fffbd92df1da39a0e41c2511323a355fdb5e07ed957142cad03367ab` |
| Critical user path | `context-guard-hook-block-retry=passed` |

The migrator will pin the current Target commit/tree, not the historical report workspace head. The Target is five commits after the report head. The changed paths are limited to workflow state, acceptance/report/Sprint evidence, documentation, Skill catalog metadata, `.gitignore`, README, and decision records:

```text
.agents/skills-list.md
.gitignore
.harness/verification-report.json
README.md
docs/architecture.html
docs/todo.md
docs/理论基础.md
memory/decisions.md
tasks/sprint-02.md
workflow-state.json
workflow/acceptance.md
```

No `scripts/` or `.agents/hooks/` implementation path changed in that range. This is recorded as historical report/target divergence; State Bootstrap does not claim that the historical Full verified Target commit `4173b4a`.

## Current Health Facts

| Check | Result |
| --- | --- |
| `harness-check context` | passed |
| `harness-check gates` | passed |
| `harness-check evidence` | failed: `evidence.verification-report-stale` |
| `harness-check evidence` | failed: `evidence.verification-report-stale-workspace` |
| v2 status | `migrated:false` |
| Planning worktree before Plan creation | clean |

The two evidence failures are expected inputs, not waived success. Any additional context, gates, config, Git identity, or state consistency error blocks rehearsal and live apply.

## Expected Migration Result

| Field | Expected value |
| --- | --- |
| CLI | `node scripts/harness/cli.mjs migrate-state --json` |
| `migrated` | `true` |
| `mode` | `migrate-item` |
| `workItemId` | `wi-legacy-v1` |
| State commit | newly created; captured by rehearsal/live receipt |
| Legacy status | `closed` |
| Legacy stage | `acceptance-ready` |
| Legacy outcome/result | `accepted / changed` |
| Registry active item | `null` |
| Registry suspended items | empty |
| Registry migration source path | `workflow-state.json` |
| Registry migration source digest | equal to v1 raw SHA-256 above |
| Registry Accepted Baseline | Target commit/tree above |
| Backup ref target | Target commit above |
| Audit | consistent root ledger plus legacy item view |
| Target ref after migration | unchanged |
| v1 file bytes after migration | unchanged |

## Rehearsal Contract

The independent clone must:

1. Check out Planning commit `7bcb9de05a1c7575ce30ab7eb65faa54f39529d4` without sharing refs with the live repository.
2. Confirm Target ref/commit/tree, v1 bytes, config bytes, source documents, stateRef absence and backup ref absence.
3. Run the migration/state-store syntax and behavior checks declared by `bootstrap-runbook.md`.
4. Run the current migrator once and compare every observable result with this Plan.
5. Prove idempotent rerun is a no-op.
6. Exercise or deterministically simulate backup-ref creation failure and verify expected stateRef compensation; inability to produce this evidence blocks live apply.
7. While no new Work Item exists, delete stateRef and backup ref with expected OIDs and prove exact restoration.
8. Write `bootstrap-rehearsal.md`, then update this Plan with the rehearsal digest and recompute the final Plan digest.

## Rehearsal Result

| Evidence | Result |
| --- | --- |
| Durable report | `bootstrap-rehearsal.md` |
| Rehearsal SHA-256 | `eb67b3d3b8c82e36b1a8684bf75efc294f47d603a35d5bf96a82e8ce4eec712b` |
| Migration/state-store tests | 10 passed, 0 failed |
| Clone context/gates | passed after locked Skill restore |
| Expected evidence health | only report TTL and workspace drift failures |
| Migration state commit | `ea4ec7514d311e062ec277e12c5ada6efa5a3a10` |
| Migration transaction | `tx-32766535-268c-4930-a70f-86e34d3f9643` |
| Mapping/audit/idempotence | matched this Plan |
| Backup creation failure | forced by ref namespace conflict; expected stateRef compensation passed |
| Rollback rehearsal | stateRef/backup removed with expected OIDs; target/planning/v1/config/worktree exactly restored |

The rehearsal is complete. Its clone-only state commit and transaction ID are evidence, not identities expected from a future live migration; live execution will generate new values.

## Rollback Window

The live rollback window opens only after a successful migration and closes before P0-WI-01 starts. Within the window, rollback requires:

- stateRef equals the migration state commit;
- backup ref equals Target commit `4173b4ac0639eb8db0623659798363854cde8d25`;
- registry has no active or suspended new Work Item;
- targetRef and v1 bytes still match this Plan;
- a separate user rollback quote bound to expected OIDs.

After P0-WI-01 starts, direct stateRef deletion is prohibited.

## Authorization State

- Clone migration rehearsal: passed; mapping, audit and idempotence matched.
- Clone rollback rehearsal: passed; all pre-migration identities restored.
- Backup compensation evidence: passed via deterministic ref namespace conflict.
- Final Plan digest: computed by the frontmatter zero-field algorithm after rehearsal evidence was bound.
- Live execution authorization: absent.
- Git ref mutation in the live repository: prohibited until exact final digest authorization.

The earlier user message containing literal `<plan-sha256>` is invalid and is not recorded as authorization.

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | Confirmed State Bootstrap requirements |
| `workflow/proposals/control-plane-convergence/solution-selected.md` | Selected option and user selection quote |
| `workflow/proposals/control-plane-convergence/bootstrap-runbook.md` | Plan, rehearsal, authorization and rollback contract |
| `workflow-state.json` | Legacy state bytes and user history |
| `.harness/config.json` | Target/state refs and verification settings |
| `.harness/verification-report.json` | Historical Full identity and current stale evidence |
| `scripts/harness/lib/migrate-v1.mjs` | Sole migration implementation |
| `scripts/harness/lib/state-store.mjs` | stateRef transaction implementation |
| `scripts/harness/test/migrate.test.mjs` | Migration behavior baseline |
