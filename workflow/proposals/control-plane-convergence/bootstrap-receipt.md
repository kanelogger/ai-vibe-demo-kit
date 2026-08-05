---
status: passed
activity: bootstrap-execution-evidence
initiativeId: control-plane-convergence
selectedOptionId: rehearsed-guarded-bootstrap
planSha256: 7c802adb38fa81c6a719a42c11c774a3e223ad94bebd286ecf68edc651890b3c
rehearsalSha256: eb67b3d3b8c82e36b1a8684bf75efc294f47d603a35d5bf96a82e8ce4eec712b
stateCommit: 1b3976b13ab143e7c4bdf5264941e78f807ce1e0
transactionId: tx-80730e45-5882-4d20-a975-689aef966b10
executedAt: 2026-08-05T14:49:42.816Z
recordedAt: 2026-08-05T14:50:46Z
rollbackWindow: open
receiptSha256: b34d8081d77259526a2da233b861746248de58df669efd6cbab55a028680cbc4
digestAlgorithm: SHA-256 of this file with receiptSha256 replaced by 64 ASCII zeroes
---
# State Bootstrap Receipt

## Result

`passed`. The authorized live invocation of the repository-owned migrator created the v2 stateRef and migration backup ref. All Plan identities and expected mappings matched. The target ref, planning commit, v1 file, config and worktree content were not modified by the migration.

The State Bootstrap rollback window remains `open`. No P0 Work Item has been started.

## Authorization

| Field | Value |
| --- | --- |
| User quote | `批准 State Bootstrap plan 7c802adb38fa81c6a719a42c11c774a3e223ad94bebd286ecf68edc651890b3c，使用 rehearsed-guarded-bootstrap` |
| Authorized at | `2026-08-05T14:48:45Z` |
| Plan SHA-256 | `7c802adb38fa81c6a719a42c11c774a3e223ad94bebd286ecf68edc651890b3c` |
| Rehearsal SHA-256 | `eb67b3d3b8c82e36b1a8684bf75efc294f47d603a35d5bf96a82e8ce4eec712b` |
| Selected option | `rehearsed-guarded-bootstrap` |

Immediately before execution, Plan/Rehearsal digests, planning/target commit/tree, v1/config/source bytes, stateRef/backup absence and authorization text were re-read and matched. `context` and `gates` passed; `evidence` retained only the two Plan-recorded historical TTL/workspace failures.

## Live Mutation

The only live mutation command was:

```sh
node scripts/harness/cli.mjs migrate-state --json
```

Observed output identity:

| Field | Value |
| --- | --- |
| migrated | `true` |
| mode | `migrate-item` |
| state commit | `1b3976b13ab143e7c4bdf5264941e78f807ce1e0` |
| transaction ID | `tx-80730e45-5882-4d20-a975-689aef966b10` |
| backup ref | `refs/heads/harness/state-migration-backup` |
| workItemId | `wi-legacy-v1` |
| status | `closed` |

A second invocation returned `migrated:false`, reason `already-migrated`, and the same state commit.

## Post-Migration Identity

| Identity | Observed |
| --- | --- |
| Planning branch | `harness/control-plane-convergence-planning` |
| Planning HEAD | unchanged at `7bcb9de05a1c7575ce30ab7eb65faa54f39529d4` before evidence commit |
| targetRef | unchanged at `4173b4ac0639eb8db0623659798363854cde8d25` |
| target tree | `193cdd7cd5bf0d013b0775d75004e56a8aa54eb2` |
| stateRef | `1b3976b13ab143e7c4bdf5264941e78f807ce1e0` |
| backup ref | `4173b4ac0639eb8db0623659798363854cde8d25` |
| v1 SHA-256 | unchanged `56a42ff5e2771681d91d4df8a16cae94a940afa915df284969b5f469dcf8c59c` |
| Config SHA-256 | unchanged `2ed34231cca148f0fa201af8d5b48fe559f472f3a10134f8d32ff146fefe1470` |
| Worktree after mutation | only Plan, Rehearsal and Authorization evidence were untracked; no migration-created worktree file |

## Registry

| Field | Value |
| --- | --- |
| version | `2` |
| targetRef/stateRef | `refs/heads/main` / `refs/heads/harness/state` |
| activeWorkItemId | `null` |
| suspendedWorkItemIds | `[]` |
| lastAcceptedBaseline commit/tree | `4173b4ac...` / `193cdd7c...` |
| sequence | `1` |
| lastTransactionId | `tx-80730e45-5882-4d20-a975-689aef966b10` |
| migration source | `workflow-state.json` |
| migration source digest | `56a42ff5e2771681d91d4df8a16cae94a940afa915df284969b5f469dcf8c59c` |
| migration rollback ref | `refs/heads/harness/state-migration-backup` |

## Legacy Work Item

| Field | Value |
| --- | --- |
| workItemId/type | `wi-legacy-v1 / feature` |
| status/stage | `closed / acceptance-ready` |
| outcome/result | `accepted / changed` |
| baseAcceptance | target commit/tree above |
| request quote | `验收通过` |
| legacy v1 stage/history count | `accepted / 6` |
| legacy confirmation | exact user quote, timestamp and `workflow/acceptance.md` |
| legacy selection | exact `unified-guard` quote, timestamp and `workflow/solution-selected.md` |

The root audit contains `migrate-v1` and `migrate-v1-item`; the per-item audit contains the matching item event. Both use sequence `1` and transaction `tx-80730e45-5882-4d20-a975-689aef966b10`.

## Post-Check

| Check | Result |
| --- | --- |
| stateRef direct read | matched migration output |
| backup/target refs | both matched authorized target commit |
| registry/item/audit | matched Plan and internally consistent |
| v1/config bytes | unchanged |
| migration idempotence | passed |
| `harness-check context` | passed |
| `harness-check gates` | passed |
| Full evidence health | unchanged historical stale/workspace divergence; not refreshed |
| active/suspended Work Items | none |

## Rollback Window

Current state: `open`.

A rollback is permitted only before any new Work Item starts and only with a new user quote bound to these exact OIDs:

| Ref | Expected OID before rollback |
| --- | --- |
| `refs/heads/harness/state` | `1b3976b13ab143e7c4bdf5264941e78f807ce1e0` |
| `refs/heads/harness/state-migration-backup` | `4173b4ac0639eb8db0623659798363854cde8d25` |
| `refs/heads/main` | must remain `4173b4ac0639eb8db0623659798363854cde8d25` and is never deleted or moved by rollback |

Closing this window and starting P0-WI-01 require a separate user release. Until then:

- do not run `harness start`;
- do not delete or mutate stateRef;
- do not move targetRef as part of State Bootstrap;
- preserve Plan, Rehearsal, Authorization and this Receipt.

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/bootstrap-plan.md` | Authorized live identities and expected result |
| `workflow/proposals/control-plane-convergence/bootstrap-rehearsal.md` | Clone migration, compensation and rollback proof |
| `workflow/proposals/control-plane-convergence/bootstrap-authorization.md` | Exact user execution authorization |
| live migrator JSON output | State commit and transaction identity |
| live stateRef registry/item/audit objects | Observable post-migration truth |
| post-migration CLI status and idempotent rerun | Canonical state and no-op evidence |
