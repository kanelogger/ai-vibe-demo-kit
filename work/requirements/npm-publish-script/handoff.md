# npm Publish Script Handoff

## Artifact

`publish-npm.sh` is executable at the project root.

## Usage

```sh
./publish-npm.sh --dry-run
./publish-npm.sh
```

The first command validates a clean synchronized `main`, the pinned release toolchain and every canonical pre-publish check. The second additionally checks npm authentication and version availability, requires the exact confirmation word `publish`, publishes publicly and verifies the registry result.

Use `./publish-npm.sh --yes` only in an already human-approved non-interactive release. The script publishes the version already present in `package.json`; version changes, commits, tags and pushes remain separate manual operations.

## Residual environment note

The current user `.npmrc` contains obsolete `allow-remote=true` configuration. npm reports a warning but all npm 11.16.0 dry-run operations pass. This repository task did not modify user-level configuration.
