# Delivery Handoff

Project Agent Harness Runtime `0.3.0` now installs `AI_ENVIRONMENT_template.md`.

A target repository promotes the template to `AI_ENVIRONMENT.md`, fills the machine facts, Agent capabilities, project stack, command contracts, services, constraints and verification sections, then runs:

```sh
./harness check-environment --file AI_ENVIRONMENT.md --json
```

The command is read-only. It rejects missing required sections, unresolved placeholders, unchecked alignment items, invalid capability states and Symlink paths. It validates structural completion; probe Evidence remains responsible for proving actual versions, permissions, authentication and service health.

`project-template.yml` and `AGENTS_template.md` now make the promoted Manifest part of Governance-ready onboarding. Installer still copies only templates and refuses conflicts without overwriting project-owned files.

All 80 Harness tests pass. The final completion Transition remains a Human Gate.
