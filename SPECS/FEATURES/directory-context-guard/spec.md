# Directory Context Guard

## Status

Selected solution: `unified-guard`. Implementation requires the `implementation-ready` user release recorded in `workflow/implementation-ready.md`.

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/requirements.md` | Confirmed behavior, scope and acceptance criteria |
| `workflow/solution-options.md` | Three implementation alternatives and trade-offs |
| `workflow/solution-selected.md` | User-selected `unified-guard` decision |
| `memory/decisions.md` | Persistent decision lineage |
| `SPECS/architecture.md` | Runtime, module and persistence facts |
| `scripts/harness/lib/context.mjs` | Existing root and effective-config resolution |
| `scripts/harness/lib/errors.mjs` | Stable error and exit-code contract |
| `scripts/harness/lib/quick.mjs` | Raw-byte digest and drift precedent |
| `.agents/hooks/README.md` | Hook Adapter ownership constraint |

## Domain Model

- **Code Root**: a safe repository-relative directory explicitly listed in `contextIndex.codeRoots`.
- **Directory Index**: a `.harness-index.json` colocated with code and governed by this specification.
- **Context Closure**: the stable, deduplicated ordered set of prerequisite text files reachable for one target.
- **Context Bundle**: the Directory Index provenance plus full Context Closure text returned to the Agent.
- **Context Receipt**: a session-private record binding one target to the exact index and prerequisite digests delivered by a prior blocked guard call.
- **Context Guard**: the sole write-precondition Interface returning `unmanaged`, `blocked`, or `allowed`.
- **Hook Adapter**: a platform argument adapter that invokes Context Guard and contains no domain decisions.

## Configuration Contract

`contextIndex` is optional. Omission or an empty `codeRoots` array disables the feature without changing existing Harness behavior.

```json
{
  "contextIndex": {
    "codeRoots": ["src", "packages/server/src"]
  }
}
```

Each Code Root must be a normalized, existing repository-relative directory. Absolute paths, empty segments, `.`, `..`, backslashes and glob characters are invalid. Duplicate or overlapping Code Roots are invalid because they make the inheritance origin ambiguous. Each enabled Code Root must contain a valid root Directory Index.

An absent config candidate may fall through to the documented fallback. A present candidate that cannot be read or parsed must fail closed; it must never become an empty config that returns `unmanaged`.

## Directory Index Contract

```json
{
  "version": 1,
  "summary": "Authentication module",
  "readBeforeWrite": ["../../SPECS/api.md", "./types.ts"],
  "files": {
    "handler.ts": {
      "readBeforeWrite": ["../../SPECS/auth-errors.md"]
    }
  }
}
```

- `version` must equal `1`.
- `summary` must be a non-empty string and is included in the Context Bundle.
- `readBeforeWrite` defaults to an empty array; every entry is an exact path resolved relative to the declaring Directory Index.
- `files` defaults to an empty object. Keys are normalized exact relative paths from the declaring index directory; glob syntax is forbidden. A matching entry only appends `readBeforeWrite` references.
- Unknown fields are rejected so misspellings cannot silently weaken a gate.
- A prerequisite must exist, be a regular file, decode as UTF-8 without NUL bytes and resolve inside the repository. Directories, any symlink path component and Git-private paths are rejected before bytes are read. Index files are limited to 64 KiB, each prerequisite to 512 KiB and one Context Closure to 2 MiB; larger inputs fail with stable errors rather than consuming unbounded memory.

## Index And Dependency Resolution

1. Normalize the target, reject any existing symlink path component, then determine whether it lies under exactly one Code Root.
2. Safe targets outside every Code Root return `unmanaged` and do not access receipts.
3. For a managed target, collect existing Directory Indexes from the Code Root through the target directory, shallowest first. Missing the Code Root index is an error.
4. Append each index's directory default references, then the matching exact-file references. Child indexes and file entries cannot remove inherited references.
5. For every prerequisite, include its full text and resolve the indexes and prerequisites applicable to that file when it lies inside a Code Root.
6. Traverse prerequisites depth-first in declaration order, deduplicate by normalized repository path, and retain the first provenance edge. Detect cycles against the active recursion stack and reject with the complete cycle path.
7. Hash raw index and prerequisite bytes with SHA-256. Compute one resolution digest from the ordered path/digest/provenance manifest.

The target's own contents are not part of the Context Closure. This allows multiple edits while the prerequisite facts stay current. Editing any index or prerequisite changes the next resolution digest and invalidates prior receipts.

## Context Guard Interface

Conceptual input:

```text
ContextGuard(targetPath, sessionId, projectContext)
```

Observable decisions:

- `unmanaged`: target is outside configured Code Roots; exit success, no receipt.
- `blocked`: target is managed and no current receipt exists. Return index provenance and the full Context Closure, wait until the Adapter reports successful output delivery, then atomically create the private receipt and return the Harness refusal exit code so the current write does not run. Failed or truncated delivery must leave no current receipt.
- `allowed`: a receipt for the same normalized session and target has the same current resolution digest; exit success without repeating file contents.

Invalid configuration, indexes, references, target paths or session identifiers return stable Harness errors and never create a receipt.

## Receipt Contract

- Resolve the Git private path with Git plumbing so linked worktrees are supported; never assume `.git` is a directory.
- Store receipts below the Git private `harness/context-receipts` namespace, partitioned by SHA-256 of session and target identity.
- Store only version, normalized target, session hash, resolution digest, ordered path/digest manifest and creation time. Do not store prerequisite text.
- Write atomically with owner-only directory/file permissions where the platform supports POSIX modes, and only after the complete Context Bundle has been accepted by the output Adapter.
- A receipt is current only when version, target, session hash and resolution digest all match. No time-based expiry is introduced in this version.

## CLI And Hook Behavior

The unified command is:

```text
harness context guard --file <path> --session <id> [--json]
```

Absolute target paths are accepted only when they normalize inside the repository; output paths are always repository-relative. JSON output is stable and contains `decision`, `target`, `indexes`, `dependencies`, `resolutionDigest` and receipt metadata appropriate to the decision.

The Hook Adapter accepts normalized file/session arguments from a platform, invokes the same command/module and passes through stdout, stderr and exit status. Platform registration remains an adapter concern; the repository owns all gate semantics.

## Static Validation

The existing Harness context check reuses Context Guard validation to verify:

- `contextIndex` schema and every Code Root;
- root index coverage and every discovered Directory Index schema;
- exact-file keys and prerequisite path safety;
- referenced file existence/type/text encoding;
- the dependency graph for all declared exact-file targets and existing files under Code Roots is acyclic.

Static validation never creates receipts and reports checker-native stable IDs with deterministic repair text.

## Error Contract

Errors distinguish at least: invalid context configuration, missing root index, invalid index schema, unsafe, missing, Git-private or oversized prerequisite, non-text prerequisite, oversized closure, dependency cycle, invalid target and missing/invalid session. Domain refusal uses exit code `1`; malformed CLI/configuration, unreadable IO and unavailable Git use exit code `2`, consistent with the existing Harness contract.

## Verification Contract

Tests assert observable behavior through Context Guard, unified CLI, checker and Hook Adapter:

- disabled/unmanaged compatibility;
- ancestor accumulation and exact-file append;
- transitive order, deduplication and provenance;
- unsafe, missing, directory, any-component symlink, Git-private, oversized, invalid UTF-8, NUL and cycle rejection;
- first call blocked with full bundle, same-session retry allowed;
- different target/session blocked independently;
- index and transitive dependency drift invalidate receipts;
- failed output delivery does not commit a receipt;
- receipts support linked Git worktrees and do not dirty the working tree;
- CLI and Hook decisions/error IDs match;
- the repository's own configured Code Roots pass static validation.

## Out Of Scope

Language import analysis, automatic Code Root discovery, vector retrieval, stateRef audit events, active Slice/Write Scope coupling, model-understanding claims, directories/globs as prerequisites, and enforcement outside configured Code Roots.
