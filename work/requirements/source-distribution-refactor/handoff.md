# Source Distribution Refactor Handoff

## Candidate status

The implementation candidate is verified: the CLI owns Distribution lifecycle behavior and the complete Coding Agent control/tool materials live under canonical `source/`. The full 141-test suite, distribution contract, bundled Skill validator, package dry run and whitespace check pass.

## User-visible structure

```text
source/
├── .agents/skills.sources.json
├── knowledge/
├── rules/
├── specs/
├── workflows/
├── agents_template.md
├── ai_environment_template.md
├── coding_agent_rules_template.md
├── project-template.yml
└── manifest.json
```

`source/manifest.json` is package-only. Init and upgrade install all other Source assets intact into the target repository's `source/` directory. The CLI still installs Runtime assets and the bundled Harness guidance Skill through the same lifecycle transaction.

## Explicit exclusions

- No `skills sync` command exists.
- No Workflow Skill resolver or Stage/Gate contract was changed.
- The remote Skill registry does not contain materialized Skill source files.

## Residual control-state action

The candidate is statelessly acceptance-valid, but the local Harness revision 35 predates the Source move and is bound to the removed root Workflow path. It now reports Workflow Drift and only permits `abort`. Closing that placeholder revision is an exact Human action and was deliberately not inferred or executed. After the user authorizes that action, start a new Work Item against `source/workflows/workflow-template.json`, signal the recorded stages and make the final Human Gate decision.

No release, commit, tag, push or publication was performed.
