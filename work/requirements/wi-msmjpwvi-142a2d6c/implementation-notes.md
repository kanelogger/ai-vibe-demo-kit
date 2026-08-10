# Implementation Notes

## Delivered Interface

- Added `AI_ENVIRONMENT_template.md` with four explicit information layers: project requirements, observed machine facts, effective Agent capabilities and alignment rules.
- Added command, capability, service, lifecycle, network, filesystem, path, data, artifact, observability, verification, constraint, secret, CI parity and freshness contracts.
- Added the read-only `harness check-environment --file <path>` Interface. It rejects missing required sections, unresolved `{填写...}` markers and unchecked alignment items without trying to judge whether prose is truthful.
- Added the template to the Installer preflight/copy list. Installer conflict and idempotency behavior is unchanged.
- Added the promoted `AI_ENVIRONMENT.md` to `project-template.yml` and Agent onboarding. Governance-ready now requires the promoted file and a successful environment check.
- Bumped the installed Runtime identity from `0.2.0` to `0.3.0` because the public CLI and installed asset set changed.

## Design Boundaries

- `project.yml` remains the authoritative project index and command string source. The new manifest references those commands and records their execution semantics, avoiding two independently editable command strings.
- Installer copies only `AI_ENVIRONMENT_template.md`; promotion to `AI_ENVIRONMENT.md` remains a project-owner operation, so installation cannot overwrite project facts.
- `check-environment` validates structural completion. Actual versions, authentication, permissions and service health remain Evidence produced by declared probes.
- No dependency, arbitrary Markdown parser, command execution, secret inspection, Git write or external operation was added.

## Architecture Impact

- Governance Interface: added the AI environment manifest template and its promotion contract.
- Validator Interface: added `validateEnvironmentManifest(text)`.
- CLI Adapter Interface: added `check-environment` with exit code `0` for structurally complete, `1` for incomplete, and `2` for usage/path/I/O errors.
- Installer Module Interface is unchanged; its internal runtime asset list now contains the template.

## Deviations

None from the approved specification.
