---
name: ai-vibe-demo-kit
description: "Guide agents through an installed AI Vibe Demo Kit Harness: inspect environment and readiness, follow Workflow and Gate state, produce Stage Results and verification evidence, and use lifecycle commands safely. Use when a repository contains ./harness, .harness/manifest.json, or source/workflows/workflow-template.json, or when the user asks to operate, diagnose, upgrade, recover, or uninstall AI Vibe Demo Kit."
---

# AI Vibe Demo Kit

Treat Harness as a deterministic control layer. Execute project work and verification yourself;
Harness validates Workflow, Evidence and state transitions but never runs Skills, tests, Git or
external writes.

## Cold start

1. Read `AGENTS.md`, `project.yml`, `ARCHITECTURE.md` and the minimum context routed by
   `source/knowledge/ROUTING.md` when those files exist.
2. Run every required command in `project.yml#environment.probes`. Stop before implementation
   when a required probe is incompatible; record actual values and deviations in alignment Evidence.
3. Run `./harness check --json` and `./harness status --json`.
4. When installation readiness or file ownership is in question, read
   `.harness/install-lock.json` and run the Distribution CLI version pinned by its package version:

   ```sh
   npx --yes ai-vibe-demo-kit@<installed-version> doctor --target "<git-root>" --json
   ```

5. Follow only `allowedActions` and copy the exact command from `nextActions` when recovery is
   pending.

## Work through a Stage

1. Read the active Workflow Stage goal, exit conditions, Required Skill Call and required
   Artifact IDs.
2. Perform the work outside Harness. Save repository-local Evidence under the configured Evidence
   root and avoid Symlink paths.
3. Build a Stage Result from `source/workflows/stage-result-template.json`.
4. For a succeeded Skill receipt, include every `skillCall.artifactIds` entry in
   `skills[].artifactRefs`; ensure every reference resolves to `artifacts[].id`.
5. For acceptance, build `verification-report/v1` from
   `source/workflows/verification-report-template.json`. Record actual commands, exit codes, evidence,
   skipped checks, cleanup and residual risks.
6. Validate completion candidates before signaling:

   ```sh
   ./harness check-result --workflow <workflow.json> --stage acceptance \
     --file <acceptance-result.json> --require-complete --json
   ```

7. Submit with the current revision:

   ```sh
   ./harness signal --revision <revision> --file <stage-result.json> --json
   ```

Treat exit code `1` from `signal` as a persisted Gate or Policy result; inspect JSON before retrying.

## Permission boundaries

- Read repository manifests, Workflow, Evidence and Harness status without additional authority.
- Write only task-scoped source or Evidence that the user requested; Harness validation never grants
  permission to modify unrelated files, credentials or external systems.
- Run Runtime mutation commands only for the active user-authorized task. Run lifecycle `--apply`
  only when the user requested that lifecycle operation and Runtime reports no active Work Item.
- Require an explicit user instruction for destructive cleanup, Human Gate decisions, publish, tag,
  push, production writes and any action that transmits secrets or private data.
- Treat `nextActions` as generated command data. Execute a recovery command only after the Runtime
  has validated the canonical journal and emitted its pinned package version.

## Human control and lifecycle safety

- Never approve, reject, override, redirect, abort, publish, tag, push or make another Human Gate
  decision without an explicit user instruction for that exact action.
- Never remove `.git/harness`, Evidence, effective governance files, user Workflow files or
  unregistered content during lifecycle work.
- Do not run `upgrade`, `uninstall` or `recover` with `--apply` while a Work Item is active.
- Plan lifecycle changes first. Use the exact pinned recovery command when a canonical transaction
  exists; never interpret a journal with a different package version.
