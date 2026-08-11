# npm Publish Script Quick Evidence

## Static and failure-path checks

- `bash -n publish-npm.sh`: exit 0.
- `./publish-npm.sh --help`: exit 0; documents current-version publishing, `--dry-run`, `--yes` and absence of Git/version mutations.
- `./publish-npm.sh --unknown`: exit 1 with `Publish failed: Unknown option: --unknown`.
- `git diff --check`: exit 0.

## Isolated end-to-end dry run

Command shape:

```sh
verify_root="$(mktemp -d /tmp/npm-publish-script-verify.XXXXXX)"
cp -R . "$verify_root/work"
git -C "$verify_root/work" add publish-npm.sh work/requirements/npm-publish-script
git -C "$verify_root/work" commit ...
git clone --bare "$verify_root/work" "$verify_root/origin.git"
git -C "$verify_root/work" remote set-url origin "$verify_root/origin.git"
"$verify_root/work/publish-npm.sh" --dry-run
```

Result: exit 0.

- Candidate: `ai-vibe-demo-kit@0.4.0`.
- Bundled Skill validation: passed.
- Distribution validation: passed.
- Full Runtime and Distribution suite: 141 passed, 0 failed, 0 skipped.
- `npm pack --dry-run --json`: passed; 72 package entries.
- Terminal result: `Dry run passed; no registry write was attempted.`

## Cleanup and residual risk

- The successful verification command removed its temporary working copy, bare origin and npm cache through exit traps.
- A failed diagnostic copy at `/tmp/npm-publish-script-debug.q2YFoK` was explicitly removed after diagnosis.
- No npm publication, Git push, Git tag or external repository mutation occurred.
- The user-level `.npmrc` emits an invalid `allow-remote=true` warning. npm 11.16.0 continued successfully; release operators should remove that obsolete configuration separately.
