# Quick Evidence

## Current focused checks

| Command | Result |
| --- | --- |
| `node --test scripts/harness/test/lifecycle.test.mjs` | passed, 35/35 including 18 fault/recovery subtests |
| Targeted completion/Distribution/package/store/validator suite | passed, 55/55 |
| `python3 .../skill-creator/scripts/quick_validate.py .agents/skills/ai-vibe-demo-kit` | passed, `Skill is valid!` |
| `node scripts/validate-bundled-skill.mjs` | passed |
| `node scripts/check-distribution.mjs` | passed; includes isolated-cache `npm pack --dry-run --json --ignore-scripts` and cleanup |
| Isolated-cache `npm pack --dry-run --json` | passed; `ai-vibe-demo-kit@0.4.0`, 34 entries, cache removed |
| `node scripts/check-completion-evidence.mjs 1f7a410... e9f56bc...` | passed, `completion evidence: valid (1)` |
| `./harness check --json` | valid at revision 26, no warning/error or Workflow drift |
| `git diff --check` | passed |

## Full regression

- Node 24.18.0 with npm 11.16.0: current full suite passed, 123/123.
- Node 22.23.1 with npm 11.16.0 selected for the main process, child Runtime and npm
  pack/install commands: current full suite passed, 123/123.
- The local tarball integration test creates a real `.tgz`, installs it with npm, initializes a
  temporary Git repository, and verifies doctor, Runtime version/check/status, upgrade plan and
  uninstall plan.

The first direct `npm pack --dry-run --json` attempt used the maintainer's default npm cache and
failed because that external cache contains root-owned entries. The same command passed with a
fresh isolated cache, and the repository-owned `check-distribution` command always uses and removes
an isolated cache. The remaining `.npmrc` `allow-remote` warning is outside the repository and does
not affect the tarball result.

All test helpers removed their temporary repositories and npm caches. The Node 22/npm 11 PATH shim
and direct-pack cache were explicitly removed. No canonical maintenance, tmp/gc transaction,
worktree atomic temporary file, child process or tarball remains in the source repository.
