---
status: passed
activity: non-active-proposal
initiativeId: control-plane-convergence
selectedOptionId: rehearsed-guarded-bootstrap
completedAt: 2026-08-05T14:43:33Z
inputPlanSha256: e8df81897b47009c3a616542d9a73219d6ca7723056a92cef608716a173d43bf
rehearsalSha256: eb67b3d3b8c82e36b1a8684bf75efc294f47d603a35d5bf96a82e8ce4eec712b
digestAlgorithm: SHA-256 of this file with rehearsalSha256 replaced by 64 ASCII zeroes
---
# State Bootstrap Rehearsal Report

## Result

`passed`. The current migrator successfully mapped the accepted v1 state in an independent clone, produced the expected registry, closed legacy Work Item, audit ledger, Accepted Baseline and backup ref, remained idempotent, compensated a forced backup-ref creation failure, and restored the primary clone to its exact pre-migration identity during rollback rehearsal.

No live repository migration ref was created or changed.

## Rehearsal Environments

| Purpose | Local path | Ref isolation |
| --- | --- | --- |
| Primary migration and rollback | `/tmp/kit-test-bootstrap-rehearsal.waJ4KK/repo` | `git clone --no-local`; does not share refs with live repository |
| Backup failure compensation | `/tmp/kit-test-bootstrap-rehearsal.waJ4KK/backup-failure` | separate `git clone --no-local` |

The paths are ephemeral evidence locations, not durable sources. All durable observations are recorded below.

## Input Identity Verification

| Identity | Expected and observed |
| --- | --- |
| Planning commit | `7bcb9de05a1c7575ce30ab7eb65faa54f39529d4` |
| Planning tree | `efa78011b774ee9e39751bdda7a9905707fe0286` |
| Target commit | `4173b4ac0639eb8db0623659798363854cde8d25` |
| Target tree | `193cdd7cd5bf0d013b0775d75004e56a8aa54eb2` |
| v1 SHA-256 | `56a42ff5e2771681d91d4df8a16cae94a940afa915df284969b5f469dcf8c59c` |
| Config SHA-256 | `2ed34231cca148f0fa201af8d5b48fe559f472f3a10134f8d32ff146fefe1470` |
| Requirements SHA-256 | `235345aaad29bf35a0f6db58ea6ee9a006163a3b1e81c2b2ce3115cd931c9674` |
| Selected solution SHA-256 | `9db3bdc90bd15deb7dcc387a528774d8baedc7b29561f5736ab7c7363f18e04c` |
| Runbook SHA-256 | `2eea85a8464a4933396d8cfcb1a2fa01bb651a54314e9b6d63907ef213490f31` |
| stateRef before migration | absent |
| backup ref before migration | absent |
| clone worktree before migration | clean |

All identities matched the input Plan.

## Clone Environment Preparation

The clone initially lacked `.agents/skills/` because managed Skills are gitignored materialized data. The first `harness-check context` correctly failed with missing Skill and generated `.gitignore` errors. Running the repository-owned locked restore command resolved the environment without tracked worktree changes:

```sh
node scripts/skills-sync.mjs
```

Result: 31 Skills restored from four locked sources; subsequent `harness-check context` passed. This preparation step must be repeated in the live-independent rehearsal if the clone is recreated.

A local `refs/heads/main` was created in each clone at the exact `origin/main` OID because the config references a local target ref. This changed clone refs only.

## Pre-Migration Verification

| Check | Result |
| --- | --- |
| migrate/state-store/git/CLI syntax | passed |
| `migrate.test.mjs` + `state-store.test.mjs` | 10 tests passed, 0 failed |
| `harness-check context` after Skills restore | passed |
| `harness-check gates` | passed |
| `harness-check evidence` | expected failures only: report stale and workspace drift |
| v1 status | `accepted` |
| v2 status | `migrated:false` |

The historical evidence failures were recorded and were not repaired or treated as success.

## Migration Execution

Command executed only in the primary independent clone:

```sh
node scripts/harness/cli.mjs migrate-state --json
```

Observed result:

| Field | Value |
| --- | --- |
| migrated | `true` |
| mode | `migrate-item` |
| state commit | `ea4ec7514d311e062ec277e12c5ada6efa5a3a10` |
| transaction ID | `tx-32766535-268c-4930-a70f-86e34d3f9643` |
| backup ref | `refs/heads/harness/state-migration-backup` |
| workItemId | `wi-legacy-v1` |
| status | `closed` |

## Post-Migration Verification

| Contract | Observed |
| --- | --- |
| stateRef | `ea4ec7514d311e062ec277e12c5ada6efa5a3a10` |
| backup ref target | `4173b4ac0639eb8db0623659798363854cde8d25` |
| targetRef | unchanged at `4173b4ac0639eb8db0623659798363854cde8d25` |
| v1 bytes | unchanged SHA-256 `56a42ff5e2771681d91d4df8a16cae94a940afa915df284969b5f469dcf8c59c` |
| worktree | clean |
| registry active/suspended | `null / []` |
| registry sequence | `1` |
| registry migration source | `workflow-state.json` and expected SHA-256 |
| Accepted Baseline | expected Target commit/tree |
| legacy status/stage | `closed / acceptance-ready` |
| legacy outcome/result | `accepted / changed` |
| legacy v1 history count | `6` |
| legacy confirmation | user / `验收通过` / expected timestamp and document |
| legacy selection | user / `unified-guard` / expected timestamp and document |
| root audit | one migration event and one legacy item event, same sequence/transaction |
| per-item audit | matching legacy item event |

The root registry and audit ledger were internally consistent. A second migration invocation returned `migrated:false`, reason `already-migrated`, with the same state commit.

## Backup Creation Failure Compensation

A second isolated clone created the namespace-conflicting ref:

```text
refs/heads/harness/state-migration-backup/blocked
  -> 4173b4ac0639eb8db0623659798363854cde8d25
```

This forced creation of `refs/heads/harness/state-migration-backup` to fail after the stateRef transaction. The migrator returned `E_MIGRATION_FAILED` with the documented repair action.

Post-failure observations:

| Identity | Result |
| --- | --- |
| stateRef | absent; expected state commit was compensated away |
| exact backup ref | absent |
| injected child ref | unchanged at Target commit |
| targetRef | unchanged |
| v1 bytes | unchanged |
| worktree | clean |

This closes the previously uncovered backup-ref compensation branch for the selected Bootstrap Plan.

## Rollback Rehearsal

Precondition: primary clone registry was idle with no active or suspended Work Item, and refs matched the observed migration identities.

The clone-only rollback used expected OIDs:

```sh
git update-ref -d refs/heads/harness/state ea4ec7514d311e062ec277e12c5ada6efa5a3a10
git update-ref -d refs/heads/harness/state-migration-backup 4173b4ac0639eb8db0623659798363854cde8d25
```

Post-rollback observations:

| Identity | Restored value |
| --- | --- |
| stateRef | absent |
| backup ref | absent |
| target commit/tree | `4173b4ac...` / `193cdd7c...` |
| Planning commit | `7bcb9de05a1c7575ce30ab7eb65faa54f39529d4` |
| v1/config SHA-256 | exact pre-migration values |
| v1 status | `accepted` |
| v2 status | `migrated:false` |
| worktree | clean |

Rollback rehearsal passed.

## Residual Risks And Live Gates

- Live migration still uses stateRef CAS followed by backup creation and compensation, rather than a multi-ref transaction. The forced failure experiment proves the documented compensation for the tested namespace-conflict failure.
- A recreated clone must restore locked Skills before context validation.
- The historical Full binds workspace head `b0ad93a`, while migrator Accepted Baseline will be current target `4173b4a`; the final Plan records this as historical target/report divergence and does not claim current verification.
- Live execution remains blocked until final Plan identities are re-read, the final Plan digest is authorized verbatim, and no new context/gates/config/Git identity error appears.
- The live rollback window closes permanently when P0-WI-01 starts.

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/bootstrap-plan.md` | Rehearsal input identities and expected results |
| `workflow/proposals/control-plane-convergence/bootstrap-runbook.md` | Required commands, failure paths and rollback contract |
| clone migrator JSON output | State commit, transaction, mode and Work Item identity |
| clone stateRef registry/item/audit objects | Observable mapping and consistency evidence |
| backup-failure clone | Compensation behavior evidence |
| primary clone post-rollback refs/files | Exact restoration evidence |
