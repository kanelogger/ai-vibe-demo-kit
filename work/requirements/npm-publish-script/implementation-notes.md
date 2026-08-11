# npm Publish Script Implementation Notes

## Added

- Root executable `publish-npm.sh` for publishing the current `package.json` version.
- Exact Node.js 24.18.0 and npm 11.16.0 release-toolchain checks.
- `main`, clean-worktree and synchronized `origin/main` checks.
- Isolated temporary npm cache with exit cleanup.
- Canonical bundled Skill, Distribution, full-test and tarball checks.
- npm identity, version-availability, explicit confirmation and post-publish verification guards.
- `--dry-run`, `--yes` and `--help` options.

## Deliberately excluded

- No package version mutation.
- No Git staging, commit, tag or push.
- No npm publication during implementation or verification.
- No changes to package contents or Runtime/Distribution interfaces.

## Reference adaptation

The script reuses the SkillPort CLI release principles of pinned toolchains, clean synchronized Git state, isolated npm cache, registry availability checks, an exact human confirmation phrase and post-publication verification. It follows this repository's shorter canonical sequence and existing manual version policy.
