# Source Distribution Refactor Quick Evidence

Verified on 2026-08-11 Asia/Shanghai with Node.js `v24.18.0` and npm `11.16.0`.

| Check | Exit | Key result |
| --- | ---: | --- |
| `node --test test/runtime/*.test.mjs test/distribution/*.test.mjs` | 0 | 141 passed, 0 failed, 0 skipped, 0 todo |
| `node scripts/check-distribution.mjs` | 0 | `distribution: valid`; Manifest, package and exact Source projection passed |
| `node scripts/validate-bundled-skill.mjs` | 0 | Bundled Skill paths and contract passed |
| `NPM_CONFIG_CACHE=/tmp/ai-vibe-demo-kit-source-refactor-npm npm pack --dry-run --json` | 0 | 72 declared tarball entries; complete `source/` tree present |
| `git diff --check` | 0 | No whitespace errors |
| Source layout diagnostic | 0 | Required Source groups present; `source/.agents` contains only `skills.sources.json`; legacy root Source paths absent |
| Fresh-install checks inside the full suite | 0 | Installed `source/workflows/workflow-template.json` validates and installed `harness check` passes |
| Temporary-repository `init` | 0 | Applied 59 ledger changes; installed 34 Source files and all Runtime assets |
| Installed `./harness check --json` | 0 | Runtime is idle/valid and points to `source/workflows/workflow-template.json` |
| Same-version `upgrade --apply` | 0 | Returned `idempotent` with no transaction or changes |
| Temporary-repository `uninstall --apply` | 0 | Applied 59 removals; removed installed Source/Runtime content and retained `.git/harness` history |

## Focused lifecycle evidence

- Fresh init installs the exact Source tree and does not recreate root `workflows/`.
- An occupied Source target produces an atomic conflict with no writes.
- Upgrade from the previous root projection migrates unchanged content and preserves modified seed/governance content.
- Uninstall preserves a modified managed Source file and effective `AGENTS.md`.

## Control-state note

The repository's pre-existing active revision 35 is still bound to `workflows/workflow-template.json` with placeholder intent `<intent>`. After the canonical Workflow moved to `source/workflows/workflow-template.json`, the default `./harness check --json` reports `E_REFERENCE_INVALID` because the old bound file no longer exists; checking the new explicit Workflow reports `E_WORKFLOW_DRIFT` (both exit 2). `./harness status --json` therefore exposes only `abort`. This is a control-state migration decision, not a candidate validation failure. No abort or Human Gate decision was executed.

## Cleanup evidence

- Test helpers removed their temporary Git repositories, npm installs, tarballs, transactions and child processes.
- The explicit end-to-end repository `/tmp/ai-vibe-source-audit.hnzkK5` was removed after uninstall inspection.
- The isolated direct npm cache `/tmp/ai-vibe-demo-kit-source-refactor-npm` was removed after the dry run.
- No npm publication, Git commit, tag, push or external-system write was attempted.
