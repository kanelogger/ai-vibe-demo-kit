# Source Distribution Refactor Implementation Notes

## Result

The repository now exposes two explicit layers:

1. The Distribution CLI initializes, upgrades, diagnoses, recovers and uninstalls the package projection.
2. `source/` is the canonical Coding Agent control/tool source containing the remote Skill registry, knowledge, rules, specs, workflows and project templates.

The CLI installs the Source tree intact at `target/source/`. This keeps Workflow-relative references deterministic and avoids a second root-level projection contract.

## Implemented scope

- Moved `.agents/skills.sources.json`, `knowledge/`, `rules/`, `SPECS/`, `workflows/` and the four project templates into `source/`.
- Renamed `SPECS/` to `source/specs/` and made lowercase `specs` the documented canonical path.
- Replaced `.harness/distribution-manifest.json` with `source/manifest.json` as the single Distribution Manifest.
- Declared every packaged file explicitly in both `source/manifest.json` and `package.json`.
- Kept `source/manifest.json` package-only; every other Source asset is projected to the identical `source/...` target path.
- Kept the four project templates as seed files so upgrades preserve user edits; knowledge, rules, specs, workflows and the Skill registry remain managed Source.
- Updated Runtime defaults and readiness checks to `source/workflows/workflow-template.json` and its sibling templates.
- Updated the bundled `ai-vibe-demo-kit` Skill and repository guidance to the new Source paths.
- Added lifecycle coverage for fresh install, collision atomicity, modified-Source uninstall preservation and same-version migration from the prior root projection.
- Extended distribution checks to require an exact Source tree, a remote-only Skill registry and a package projection identical to the Manifest.

## Preserved interfaces and boundaries

- `loadDistributionManifest`, `runDistributionCommand`, Runtime CLI commands and Stage Result contracts are unchanged.
- Workflow validation, Skill catalog resolution, Stage progression and Human Gate semantics are unchanged.
- The bundled `.agents/skills/ai-vibe-demo-kit` directory remains a Runtime guidance asset and is intentionally outside `source/.agents`.
- `source/.agents/skills.sources.json` contains remote repository tracking only; no Skill source files are stored there.
- No `skills sync` command or network materialization behavior was added.
- The Harness still validates and records control state; it does not execute Skills, tests, Git operations or external writes.

## Compatibility

- Fresh installs receive the complete `source/` layout and pass installed Runtime readiness checks.
- Same-version upgrades migrate unchanged legacy root Source files into `source/` atomically.
- Modified legacy seeds and effective governance files are preserved.
- Unregistered target collisions fail before writes.
- Uninstall removes only unchanged ledger-owned content and preserves modified Source/governance content.

## Architecture rationale

The existing Lifecycle Interface remains the deep module boundary. `source/manifest.json` is the single mapping seam between package files and target ownership, while `source/` is installed without a translation adapter. This reduces duplicated path policy and keeps Source synchronization independent from Runtime control semantics.
