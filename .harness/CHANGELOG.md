# Harness Changelog

## 0.4.0 - 2026-08-10

- Rebrand the public package and project identity as `ai-vibe-demo-kit`.
- Split npm Distribution lifecycle commands from the installed `./harness` Runtime CLI.
- Add a unique Distribution Manifest, install ledger, shared RepositoryGuard lock and crash-recoverable maintenance journal.
- Bundle and validate the `ai-vibe-demo-kit` Skill with Stage-specific Artifact contracts.

## 0.3.0 - 2026-08-10

- Install an AI environment manifest template that separates project requirements, observed machine facts and effective Agent capabilities.
- Require target repositories to promote and complete the manifest before claiming Governance-ready status.
- Define actionable command, service, verification, constraint and cleanup contracts for Agent use.
- Add `check-environment` to reject missing sections, unresolved placeholders, unchecked alignment items and invalid capability statuses.

## 0.2.0 - 2026-08-09

- Add the `verification-report/v1` Artifact contract with check, condition and cleanup consistency validation.
- Add stateless `check-result` validation for Agent and CI completion evidence.
- Add environment probes, completion-evidence onboarding and repository self-governance templates.

## 0.1.1 - 2026-08-09

- Consolidate repository path containment and symlink inspection in the PathSafety Module.
- Package the shared Module with installed Harness runtimes and verify its Interface directly.
- Remove the unused ControlKernel error re-export and the obsolete workflow visualization.

## 0.1.0 - 2026-08-09

- Recover PID locks whose owner can be proven dead without reclaiming live or unverifiable locks.
- Distinguish persisted Gate signals from idempotent retries in JSON output.
- Test the Harness on supported Node.js LTS releases in CI and enforce semantic commit subjects.
- Define Runtime-ready and Governance-ready onboarding states.
- Expose installed Harness release metadata through a version command and manifest.
