# Quick Evidence

## Current focused checks

| Command | Result |
| --- | --- |
| `node --test scripts/harness/test/lifecycle.test.mjs` | passed, 13/13 |
| Node 22.23.1 with Node 22 first in `PATH`: `node --test scripts/harness/test/lifecycle.test.mjs` | passed, 13/13 |
| `node --test scripts/harness/test/cli.test.mjs scripts/harness/test/validator.test.mjs scripts/harness/test/package.test.mjs` | passed, 47/47 |
| Same focused command under Node 22.23.1 with Node 22 first in `PATH` | passed, 47/47 |
| `python3 .../skill-creator/scripts/quick_validate.py .agents/skills/ai-vibe-demo-kit` | passed, `Skill is valid!` |
| `node scripts/validate-bundled-skill.mjs` | passed |
| `node scripts/check-distribution.mjs` | passed; includes isolated-cache `npm pack --dry-run --json --ignore-scripts` and cleanup |
| Isolated-cache `npm pack --dry-run --json` | passed; `ai-vibe-demo-kit@0.4.0`, 34 entries, cache removed |
| `node --test scripts/harness/test/distribution-cli.test.mjs scripts/harness/test/lifecycle.test.mjs` | passed, 19/19 |
| `./harness check --json` | valid at revision 24, no warning/error |
| `git diff --check` | passed |

## Full regression

- Node 24.18.0: current full suite passed, 98/98.
- Node 22.23.1 with Node 22 first in `PATH`: current full suite passed, 98/98.
- The local tarball integration test creates a real `.tgz`, installs it with npm, initializes a
  temporary Git repository, and verifies doctor, Runtime version/check/status, upgrade plan and
  uninstall plan.

The first direct `npm pack --dry-run --json` attempt used the maintainer's default npm cache and
failed because that external cache contains root-owned entries. The same command passed with a
fresh isolated cache, and the repository-owned `check-distribution` command always uses and removes
an isolated cache. The remaining `.npmrc` `allow-remote` warning is outside the repository and does
not affect the tarball result.

All test helpers removed their temporary repositories and npm caches. No canonical maintenance,
tmp/gc transaction, child process or tarball remains in the source repository.
