# Alignment Spec: npm latest safe sync

## Intent

Add `ai-vibe-demo-kit sync [--target <path>] [--apply] [--json]`. Resolve npm `latest`, pin that exact version, and delegate to its `upgrade` command. The sync parent performs no repository writes and holds no RepositoryGuard lock.

## Acceptance criteria

1. Resolve one valid SemVer from npm within 30 seconds and expose it as `update.resolvedVersion`.
2. Compare with SemVer 2.0 section 11 precedence, including prerelease ordering and excluding build metadata; never delegate a downgrade.
3. Distinguish a missing ledger (`not-installed`, pinned init action) from an invalid ledger (`invalid-ledger`, `E_LEDGER_INVALID`).
4. Resolve `--target` to the canonical Git root. Delegate with argument arrays, exact-version `npx`, and explicit `--json`; require the complete trimmed stdout to be one matching upgrade Envelope.
5. Default sync returns a read-only upgrade plan and pinned apply action. `--apply` delegates atomic apply while preserving active-work, maintenance, ownership, and recovery protections.
6. Add no forced delegation timeout. Forward SIGINT/SIGTERM to the child process group and wait for exit.
7. Update versioned package metadata, explicit package file lists, architecture, help, docs, tests, and changelog for 0.5.0 without publish, tag, push, or Human Gate decisions.

## Risk and rollback

- Unintended downgrade or untrusted registry output is mitigated with full SemVer precedence, exact pinning, strict protocol validation, and shell-free arguments.
- Parent sync never writes the target. Existing canonical transactions own every apply write and recovery path.
- Rollback is code reversion before release; no external publication or production mutation is in scope.

## Environment alignment

- Darwin arm64; Node v24.18.0; Git 2.55.0; npm 11.16.0; Docker 29.4.0.
- All required probes match `project.yml`; Docker is optional and available.
- Initial Harness state was valid, revision 62, idle, with no pending Gate. Work Item started at revision 63.
