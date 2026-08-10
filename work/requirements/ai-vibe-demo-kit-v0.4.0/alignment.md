# AI Vibe Demo Kit CLI v0.4.0 Alignment

## Specification

The implementation is bound to `PLAN.md` SHA-256
`9f40abda14d692792b01ee8508ed186a9fdac6484a58a3b5267a5692de8d1c6c`.
The observable acceptance surface is the public Distribution CLI envelope and exit mapping,
the lifecycle decision tables, recoverable transaction windows, Runtime lock behavior,
Required Skill and Artifact contracts, and the package/doctor goldens named by that plan.

## Environment probes

| Probe | Actual | Expected | Result |
| --- | --- | --- | --- |
| `uname -s` | `Darwin` | macOS or Linux | passed |
| `uname -m` | `arm64` | arm64 or x86_64 | passed |
| `node --version` | `v24.18.0` | Node.js 22+ | passed |
| `git --version` | `2.55.0` | Git available | passed |
| `npm --version` | `11.16.0` | source/release npm 11.16.0 | passed |
| `docker --version` | `29.4.0` | optional | passed |

Required probes match. `./harness check --json` was valid at revision 19 with no warning or
error before the prior Work Item was aborted at revision 20.

## Risk and authorization

- Lifecycle mutations use a shared repository lock and journaled before/after states.
- Unregistered paths and third-state content are never overwritten or deleted.
- npm publish, Git tag and push remain outside implementation authorization.
- The user explicitly requested implementation of the reviewed plan, including aborting the
  Work Item bound to the default Workflow and approving this frozen alignment for execution.

`skill-creator` governs the bundled Skill entity and `codebase-design` governs the
Distribution/Runtime/RepositoryGuard seams. Their use is authoring Evidence; this frozen
bootstrap Workflow intentionally has no Required Skill call so later Catalog replacement cannot
create drift.
