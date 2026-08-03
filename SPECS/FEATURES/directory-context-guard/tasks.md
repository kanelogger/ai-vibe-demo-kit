# Directory Context Guard Slice DAG

## Slice 1 — Unified Context Guard CLI

**Slice ID:** `context-guard-cli`

**Depends on:** none

**What it delivers:** A project can configure a Code Root and run the unified Context Guard CLI. The first call for a managed target returns the complete Context Bundle and blocks; a same-session retry is allowed while all index and prerequisite bytes remain current.

**Primary uncertainty:** Whether one deep Interface can keep recursive index resolution, path safety, deterministic bundle output and private receipt drift behind a stable CLI contract.

**Non-goals:** Static project-wide index checking, platform Hook registration, repository dogfood indexes and Slice/stateRef audit coupling.

**Write Scope:**

- `.harness/config.json`
- `scripts/harness/cli.mjs`
- `scripts/harness/lib/context-guard.mjs`
- `scripts/harness/lib/context.mjs`
- `scripts/harness/lib/errors.mjs`
- `scripts/harness/test/context-guard.test.mjs`

**Acceptance criteria:**

- Disabled and unmanaged targets preserve existing behavior.
- Valid ancestor/default/exact/transitive dependencies produce stable provenance and full text.
- Invalid paths, files, encoding and cycles are rejected with stable errors.
- First call blocks and creates a Git-private receipt; current same-session retry allows.
- Index or dependency drift forces a fresh block; worktree status is unchanged by receipts.

**Revision 2:** Runnable review found that malformed effective config could silently disable the guard. `context.mjs` is added to Write Scope so config read/parse failures fail closed; the same review also requires output-before-receipt ordering, all-component symlink rejection, Git-private exclusions and bounded context bytes. Source: Slice 1 standards/spec review after the first passing Quick report.

**verification.quick:**

```text
node --check scripts/harness/lib/context.mjs && node --check scripts/harness/lib/context-guard.mjs && node --check scripts/harness/cli.mjs && node --test scripts/harness/test/context-guard.test.mjs
```

## Slice 2 — Project Write Enforcement

**Slice ID:** `context-guard-enforcement`

**Depends on:** `context-guard-cli`

**What it delivers:** The project checker validates all configured indexes, the platform-neutral Hook Adapter enforces Context Guard decisions, and this repository carries working indexes for its own code roots with a demonstrated block/retry path.

**Primary uncertainty:** Whether static checking and write-event adaptation can reuse Context Guard without creating a second interpretation of index or receipt rules.

**Non-goals:** Platform-specific registration files, stateRef audit events, active Slice/Write Scope binding and automatic import discovery.

**Write Scope:**

- `.harness/config.json`
- `.harness/manifest.json`
- `.agents/hooks/.harness-index.json`
- `.agents/hooks/README.md`
- `.agents/hooks/guard-write-context.mjs`
- `AGENTS.md`
- `HARNESS.md`
- `SPECS/architecture.md`
- `rules/ai-implementation.md`
- `scripts/.harness-index.json`
- `scripts/harness/.harness-index.json`
- `scripts/harness-check.mjs`
- `scripts/harness/README.md`
- `scripts/harness/test/context-guard.test.mjs`
- `scripts/harness/test/context-index-check.test.mjs`

**Acceptance criteria:**

- `harness-check context` reports invalid config, coverage, schema, reference and cycle failures through static validation.
- Hook Adapter and unified CLI return identical decisions, context and stable error IDs.
- This repository's `scripts` and `.agents/hooks` Code Roots resolve through colocated indexes and pass the checker.
- A real Hook Adapter invocation blocks first, returns current prerequisites and allows the same-session retry.
- Full existing Harness tests continue to pass.

**verification.quick:**

```text
node --check scripts/harness-check.mjs && node --check .agents/hooks/guard-write-context.mjs && node --test scripts/harness/test/context-guard.test.mjs scripts/harness/test/context-index-check.test.mjs
```
