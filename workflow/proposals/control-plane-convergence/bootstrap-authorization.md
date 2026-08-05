---
status: consumed
activity: bootstrap-execution-evidence
initiativeId: control-plane-convergence
selectedOptionId: rehearsed-guarded-bootstrap
planSha256: 7c802adb38fa81c6a719a42c11c774a3e223ad94bebd286ecf68edc651890b3c
rehearsalSha256: eb67b3d3b8c82e36b1a8684bf75efc294f47d603a35d5bf96a82e8ce4eec712b
authorizedBy: user
authorizedAt: 2026-08-05T14:48:45Z
executionConsumed: true
consumedAt: 2026-08-05T14:49:42.816Z
stateCommit: 1b3976b13ab143e7c4bdf5264941e78f807ce1e0
transactionId: tx-80730e45-5882-4d20-a975-689aef966b10
---
# State Bootstrap Authorization

## User Authorization

> 批准 State Bootstrap plan 7c802adb38fa81c6a719a42c11c774a3e223ad94bebd286ecf68edc651890b3c，使用 rehearsed-guarded-bootstrap

## Authorized Scope

This authorization permits one live invocation of the repository-owned command:

```sh
node scripts/harness/cli.mjs migrate-state --json
```

It is valid only while all identities below match the final Plan:

| Identity | Authorized value |
| --- | --- |
| Planning commit | `7bcb9de05a1c7575ce30ab7eb65faa54f39529d4` |
| Planning tree | `efa78011b774ee9e39751bdda7a9905707fe0286` |
| Target ref/commit/tree | `refs/heads/main` / `4173b4ac0639eb8db0623659798363854cde8d25` / `193cdd7cd5bf0d013b0775d75004e56a8aa54eb2` |
| v1 SHA-256 | `56a42ff5e2771681d91d4df8a16cae94a940afa915df284969b5f469dcf8c59c` |
| Config SHA-256 | `2ed34231cca148f0fa201af8d5b48fe559f472f3a10134f8d32ff146fefe1470` |
| stateRef before execution | absent |
| migration backup ref before execution | absent |
| Expected health exceptions | historical report TTL and workspace drift only |

## Not Authorized

- Moving or rewriting `refs/heads/main`.
- Modifying `workflow-state.json` or application/workflow files.
- Starting P0-WI-01 or any other Work Item.
- Closing the State Bootstrap rollback window.
- Running Full to refresh historical acceptance.
- Directly editing stateRef contents or substituting another migrator.

## Prior Invalid Message

The earlier message containing literal `<plan-sha256>` did not match a real Plan digest and was not authorization. This document records only the exact final digest authorization above.

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/bootstrap-plan.md` | Final authorization-eligible Plan and identities |
| `workflow/proposals/control-plane-convergence/bootstrap-rehearsal.md` | Passed clone migration, compensation and rollback evidence |
| `workflow/proposals/control-plane-convergence/solution-selected.md` | Selected option |
| User message at `2026-08-05T14:48:45Z` | Exact execution authorization |
