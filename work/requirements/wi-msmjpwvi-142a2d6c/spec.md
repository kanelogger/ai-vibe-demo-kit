# AI Environment Manifest Template

## Goal

Install a project-owned AI environment manifest template with Project Agent Harness so every target repository records actionable environment facts before it is described as Governance-ready.

## Confirmed Interface

- The installed template is `AI_ENVIRONMENT_template.md`.
- A target repository promotes it to `AI_ENVIRONMENT.md`, fills every `{填写：...}` marker, and keeps it as the human- and Agent-readable environment entrypoint.
- `project.yml` remains the authoritative project index and references `AI_ENVIRONMENT.md`; the manifest owns detailed commands, capabilities, constraints and verification facts.
- `AGENTS.md` requires the manifest to exist and be filled before task execution. Runtime installation and Workflow validation remain available so Installer recovery is not coupled to project-specific governance content.

## Required Template Content

The template must distinguish four kinds of information:

1. Declared project requirements and supported profiles.
2. Observed machine facts with probe command, result source and freshness.
3. Effective Agent capabilities, permissions and availability checks for the current execution environment.
4. Alignment rules that compare requirements with observed and permitted capabilities.

It must provide fillable sections for metadata and discovery, machine platform, runtimes, version managers, package managers, CLI tools, development tools, browsers, Agent capabilities, project stack, commands, services, lifecycle, network, filesystem, paths, data, artifacts, observability, verification, constraints, secrets, CI parity and known issues.

Each canonical command must record purpose, command, working directory, prerequisites, environment input, network and approval needs, side effects, timeout, success exit codes, artifacts, verification and cleanup.

Each capability must record provider/interface, required operations, prerequisites, availability probe, permissions, constraints and verification method. Installed, available, authenticated, authorized and healthy states must not be conflated.

## Acceptance Criteria

- A fresh Installer target contains `AI_ENVIRONMENT_template.md` byte-for-byte and a second installation is idempotent.
- Installer preflight still rejects conflicting target content without partial writes.
- `project-template.yml` references the promoted `AI_ENVIRONMENT.md` as authoritative context.
- `AGENTS_template.md`, `.harness/README.md` and the root `README.md` require promotion and completion of the manifest before Governance-ready work begins.
- The repository architecture index lists the new Governance asset.
- Installer-focused tests and the complete Harness test suite pass.
- `./harness check --json` remains valid and the installed Runtime remains zero-dependency.

## Risk and Rollback

- Risk: duplicating fast-changing versions in both `project.yml` and the manifest. Mitigation: `project.yml` is the index; detailed observed facts live only in `AI_ENVIRONMENT.md`.
- Risk: treating an installed tool as an effective Agent capability. Mitigation: separate installed, available, authenticated, authorized and healthy states.
- Risk: Installer overwrite of project-owned facts. Mitigation: install only the template and preserve existing conflict preflight; promotion to `AI_ENVIRONMENT.md` is explicitly human-owned.
- Rollback: remove the template from the Installer manifest and revert its documentation, test and architecture references. No business data, external service or Git history migration is involved.

## Deliberate Boundary

This change does not add a Markdown parser or make `harness check` infer whether prose is truthful. Governance readiness is enforced through the Agent onboarding interface and observable placeholder completion; Workflow and Evidence validation remain deterministic JSON contracts.
