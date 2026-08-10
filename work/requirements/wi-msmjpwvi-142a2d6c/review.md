# Acceptance Review

Fixed point: `HEAD` (`4e0e99de84fcb9c6b2330e3df8ec428374fdcbd4`). The candidate was reviewed as an uncommitted worktree diff plus the new `AI_ENVIRONMENT_template.md`.

## Standards

Initial independent findings:

- Hard: `readRepoText` accepted an intermediate Symlink that resolved inside the repository, violating the CLI path invariant.
- Hard, low severity: two architecture files lost unrelated terminal blank lines.
- Judgement call, Duplicated Code: the test-only template completion transform appeared in four call sites.
- Low severity on re-review: the Symlink fix repeated the leaf `lstat` already performed by `firstSymlinkInPath`.

Resolution:

- Routed public text/JSON reads through `firstSymlinkInPath` and added an intermediate-Symlink CLI regression test.
- Restored the unrelated terminal blank lines.
- Extracted `completeEnvironmentTemplate` into the shared test helper.
- Removed the redundant leaf `lstat` and import.

Final Standards result: 0 unresolved findings. The independent re-review confirmed all findings resolved and found no behavioral regression.

## Spec

Initial independent findings:

- P1: observed machine tables lacked per-result Evidence source and freshness.
- P1: canonical command contracts referenced `project.yml` but did not record the resolved command.
- P1: capability rows could use arbitrary status text and still pass structural validation.
- P2: classifying all AI environment files as completion-evidence-governed expanded repository policy beyond the approved specification.

Resolution:

- Added `Evidence source` and `Verified at` to observed machine/tool tables.
- Added resolved `run` beside the authoritative `command_ref`.
- Added the declared capability-status vocabulary to `validateEnvironmentManifest` and a regression test for invalid status text.
- Removed the completion-evidence classification and its test.

Final Spec result: 0 unresolved findings. The independent re-review confirmed all four remediation points.

Review summary: Standards 0 unresolved; Spec 0 unresolved.
