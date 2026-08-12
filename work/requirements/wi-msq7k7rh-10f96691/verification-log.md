# Verification Log

Candidate base: `2964ddeb5d39819a369c7e8445e69b7d6755198c` (`origin/main` before governed commits).

Final candidate checks:

| Check | Exit | Key output |
| --- | ---: | --- |
| `node --test test/runtime/*.test.mjs test/distribution/*.test.mjs` on Node.js 24.18.0 | 0 | 167 tests, 167 passed, 0 failed/skipped/cancelled |
| `/Users/kanehua/.volta/tools/image/node/22.23.1/bin/node --test test/runtime/*.test.mjs test/distribution/*.test.mjs` | 0 | 167 tests, 167 passed, 0 failed/skipped/cancelled |
| `node scripts/validate-bundled-skill.mjs` | 0 | `bundled Skill: valid` |
| `node scripts/check-distribution.mjs` | 0 | `distribution: valid` |
| `./harness check-architecture --file project.yml --json` | 0 | `valid: true`, `configurationValid: true`, no errors or warnings |
| `./harness check --json` | 0 | active version 2 Workflow valid without drift |
| Stateless `validateWorkflow` for `source/workflows/workflow-default.json` | 0 | `valid: true`, no errors or warnings |
| `./harness version --json` | 0 | `ai-vibe-demo-kit` version `0.5.1`, minimum Node `22` |
| `npm pack --dry-run --json --ignore-scripts` with isolated npm cache | 0 | `ai-vibe-demo-kit@0.5.1`, 82 entries, no tarball written |
| `git diff --check` | 0 | no whitespace errors |
| `rg` stale version/tool paths outside `work/` | 0 | no `0.5.0` or removed `scripts/check-*` path; legacy Workflow references are documented compatibility fixtures |
| implementation Stage Result against active Workflow version 2 | 0 | valid and policy satisfied |
| implementation Stage Result against default Workflow version 3 | 0 | valid, policy satisfied, `test-impact/v1` accepted |

Development findings retained for traceability:

- The first pre-final full suite found one stale current-version assertion in `test/distribution/lifecycle.test.mjs`; actual Runtime behavior correctly emitted 0.5.1. The assertion was corrected, the focused case passed 1/1, and both frozen-candidate matrix runs passed 167/167.
- Two matrix runs were deliberately interrupted after the candidate changed to require explicit `kind: automated` in `test-impact/v1`; interrupted results were not counted as final Evidence.
- The first pack attempt encountered permissions in the user-global npm cache. Final pack checks used `/private/tmp/ai-vibe-demo-kit-final-pack.P4k5zS`; that exact directory was removed and its absence verified.

Cleanup evidence:

- `/private/tmp/ai-vibe-demo-kit-final-pack.P4k5zS` does not exist after cleanup.
- `ai-vibe-demo-kit-0.5.1.tgz` does not exist because the pack operation was dry-run only.
- The full suite's registered temporary-directory cleanup test passed on both Node versions.
- No registry publish, Git push, background service, OCI container or Orchestrator prototype was started.
