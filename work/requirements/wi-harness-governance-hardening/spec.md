# Harness Governance Hardening v0.2.0

## Goal

Make the repository Governance-ready and Completion-evidence-ready while preserving the zero-dependency, deterministic Harness boundary.

## Acceptance Criteria

- The repository has concrete Agent, environment, architecture and knowledge entrypoints.
- `verification-report/v1` rejects structural contradictions and turns real failed checks or retained resources into policy failures.
- `check-result` validates explicit completion evidence without reading control state.
- Current-repository CI requires changed acceptance evidence for governed changes.
- The Runtime remains dependency-free and does not execute tests, delete external resources or install platform Hooks.

