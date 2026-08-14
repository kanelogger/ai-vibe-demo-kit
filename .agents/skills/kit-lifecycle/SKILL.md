---
name: kit-lifecycle
description: "Inspect and safely manage the installation lifecycle of AI Vibe Demo Kit, including doctor, init, versioned upgrade, sync, recover and uninstall. Use when a user asks to install, diagnose, update, repair or remove the Kit itself; do not use for executing Workflow Stages, selecting domain Skills, coding, testing or producing Stage Evidence."
---

# Kit Lifecycle

Manage only the installed AI Vibe Demo Kit files and lifecycle state. Do not execute project Workflow Stages or domain work.

## Inspect

1. Resolve the Git root and read `.harness/manifest.json` and `.harness/install-lock.json` when present.
2. Run `./harness status --json` before any apply operation. Do not apply lifecycle changes while a Work Item is active.
3. Use the package version pinned by the installed ledger for doctor, uninstall and recovery. Never interpret a recovery journal with another version.
4. Run doctor to distinguish Runtime, governance and completion-evidence readiness. Do not inspect consumer domain Skills, remote Skill sources, authentication or external health.

## Plan before apply

Run upgrade, sync or uninstall without `--apply` first. Report the exact managed targets, preserved seeds, conflicts, warnings and recovery requirements. A dry plan does not authorize the apply operation.

Apply only after the user explicitly authorizes that exact lifecycle action and target. Use the command emitted by the plan or Runtime recovery response without rewriting its version or target.

## Recover

When a canonical transaction exists, use the exact pinned `recover --strategy resume|rollback` command emitted by Runtime. Preserve managed files, the installation ledger, Workflow Evidence and unregistered consumer content.

## Permission boundaries

- Never run `init`, `upgrade`, `sync`, `recover` or `uninstall` with mutating effect unless the user explicitly authorized the exact action and target.
- Never apply lifecycle changes while a Work Item is active.
- Never delete modified managed files, preserved seeds, consumer domain Skills, `.git/harness`, Workflow files or Evidence outside the ledger-authorized transaction.
- Never publish, push, change production systems, resolve external Skill sources or manage credentials.
- Do not perform Stage execution, capability selection, coding, testing or Stage Result generation; hand those tasks to `workflow-runner`.
