# AI Vibe Demo Kit CLI v0.4.0 Implementation Notes

## Delivered Modules

- Added the single-bin npm Distribution CLI `ai-vibe-demo-kit` with the frozen schemaVersion 1
  envelope and lifecycle status/exit mappings. Removed `init` from the installed Runtime CLI.
- Replaced the hard-coded Installer with a Distribution Manifest and ledger-driven Lifecycle
  Module. Init, upgrade and uninstall implement the reviewed managed/seed ownership rules and
  refuse unregistered or third-state targets.
- Extracted the existing PID lock into RepositoryGuard. Runtime Mutation and lifecycle apply use
  the same `withRepositoryMutation` Interface; Runtime start reloads its Workflow while holding
  that lock to prevent upgrade/start digest races.
- Added durable transaction staging, atomic canonical publication, cursor recovery, rollback,
  committed-only resume and canonical-to-gc cleanup. Transactions bind schema, creating package
  version and Distribution Manifest Digest.
- Added doctor readiness truth-table behavior and stable goldens for healthy, governance
  incomplete, Runtime conflict and completion-tooling conflict states.
- Created the bundled `ai-vibe-demo-kit` Skill with `agents/openai.yaml`. Default Workflow stages
  use distinct Skill Call IDs and exact `artifactIds ⊆ artifactRefs ⊆ artifacts` validation.
- Rebranded public project/runtime/package identity to AI Vibe Demo Kit 0.4.0, added source/release
  npm profiles and retained Harness only as the internal control Module name.

## Deep Module Seams

- `runDistributionCommand` is the lifecycle test and caller Interface. Planning, ownership,
  transaction and doctor rules remain local to its implementation.
- `withRepositoryMutation` is the only repository mutation lock Interface. FileStore and
  Lifecycle are adapters at the same seam; no second lock exists.
- `validateWorkflow` remains the single validation path used by check/start/doctor for Required
  Skill entity and Artifact contracts.

## Explicitly Not Performed

- No npm publish, registry verification, Git tag, commit, push, MCP implementation, legacy
  adoption or governance-file merge was performed.
- Independent Agent forward tests remain an auxiliary manual observation and were not used as a
  deterministic acceptance or release Gate.
