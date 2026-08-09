# Harness Changelog

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
