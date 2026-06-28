---
title: Phase 3 - Stage Gate Fixtures
slug: phase-3-stage-gate-fixtures
summary: 为状态机、阶段门和命令行为补齐正负向 fixture 与测试。
---

## Goal

把 `00-contract.md` 的 Gate Rules 变成可回归的机器测试，确保 Agent 无法通过跳级、提前创建文件、缺少 quote 或伪造选择绕过阶段门。

## Inputs

* [`00-contract.md`](/Users/kanehua/project/kit-test/plan/00-contract.md)
* [`01-cli-foundation.md`](/Users/kanehua/project/kit-test/plan/01-cli-foundation.md)
* [`02-template-control-files.md`](/Users/kanehua/project/kit-test/plan/02-template-control-files.md)

## Tasks

* Add valid fixtures for all 6 stages.
* Add negative fixtures for skipped stages.
* Add negative fixtures for missing `--quote` and missing quote fields.
* Add negative fixtures for future workflow files created too early.
* Add negative fixtures for allowed immediate target artifacts not being flagged as future files (e.g., `workflow/requirements.md` with `status: draft` is legal at `initialized`; `workflow/solution-options.md` with `status: proposed` is legal at `requirements-confirmed`).
* Add negative fixtures for missing YAML frontmatter fields.
* Add negative fixtures for missing API `Source: ../../SPECS/API.md`.
* Add negative fixtures for `solution-options` with wrong `optionIds` count.
* Add negative fixtures for `solution-selected` missing `memory/decisions.md` selected option entry.
* Add negative fixtures for `kit stage advance` pre-advance validation: target artifact file missing.
* Add negative fixtures for `kit stage advance` pre-advance validation: target artifact missing YAML frontmatter.
* Add negative fixtures for `kit stage advance` pre-advance validation: target artifact `status` field present but wrong value (e.g., `status: draft` when `confirmed` is required).
* Add fixtures for `requirements-draft` → `requirements-confirmed` same-path status switch: verify `kit check` passes at stable `draft`, fails after Agent updates `workflow/requirements.md` to `status: confirmed` (intermediate state), and `kit stage advance` completes the transition.
* Add tests that verify `kit stage advance` allows only the immediate next stage and writes `history[]`.

## Acceptance Criteria

* Every valid fixture passes `kit check`.
* Every invalid fixture fails with an error and concrete repair action.
* `kit stage advance` rejects skipped stages and missing `--quote`.
* `kit stage advance` pre-advance rejects: missing target artifact file, missing YAML frontmatter on target artifact, wrong `status` value on target artifact.
* `kit stage advance` appends a `history[]` entry with `from`, `to`, `advancedBy`, `advancedAt`, `quote`, and `doc`.
* `requirements-draft` → `requirements-confirmed` same-path switch: `kit check` passes at stable `draft`, fails during intermediate `confirmed`-but-not-advanced state, and passes again after `kit stage advance`.
* Allowed immediate target artifacts are not falsely reported as future files.
* Test suite does not depend on Markdown body parsing.

## Verification

* Run the CLI test suite.
* Run fixture checks directly against at least one valid and one invalid fixture per stage.
* Confirm failure output includes the next repair action, not only an error label.

## Out of Scope

* Adding new workflow stages.
* Parsing option details from Markdown prose.
* Running frontend/backend typecheck from `kit check`.
* Implementing feature-level business specs.

## Depends On

Phase 1 and Phase 2.

## Completion Gate

- [ ] Every valid fixture passes `kit check`.
- [ ] Every invalid fixture fails with an error and concrete repair action.
- [ ] `kit stage advance` rejects skipped stages and missing `--quote`.
- [ ] `kit stage advance` pre-advance rejects missing target artifact, missing YAML, and wrong `status`.
- [ ] `kit stage advance` appends `history[]` entries with all required fields.
- [ ] `requirements-draft` → `requirements-confirmed` same-path switch fixtures pass.
- [ ] Allowed immediate target artifacts are not falsely reported as future files.
- [ ] Test suite does not depend on Markdown body parsing.
- [ ] All Acceptance Criteria are met.
