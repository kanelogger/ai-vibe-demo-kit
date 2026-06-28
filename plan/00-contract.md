---
title: Kit-Test v1 Contract
slug: kit-test-v1-contract
summary: Kit-Test v1 的唯一产品契约源，定义生成项目结构、状态机、阶段门、Agent 工作流和验收边界。
---

## Summary

Kit-Test v1 生成一个前后端工作区，让 Agent 在明确的 `AGENTS.md`、`SPECS/`、`workflow-state.json` 和阶段门约束下推进业务需求。第 6 步之后，所有阶段推进必须通过用户逐字原话确认和 `kit stage advance` 命令。

首版 CLI 范围固定为：

* `kit init <project-name>`：生成项目。
* `kit check`：检查流程状态、阶段文档、跨端 API 引用和禁止提前创建的阶段文件。
* `kit stage advance <stage> --by "<actor>" --quote "<user exact quote>"`：按唯一 next stage 推进状态，写入 `workflow-state.json.history[]`。

## Generated Project Contract

生成项目保留当前模板目录名：`frontend/`、`backend/`。根目录负责流程总控，前后端只维护各自实现相关的 `SPECS/`。

```text
project/
├── AGENTS.md
├── workflow-state.json
├── workflow/
│   └── README.md
├── SPECS/
│   └── API.md
├── tasks/
│   └── README.md
├── memory/
│   └── decisions.md
├── frontend/
│   ├── AGENTS.md
│   ├── SPECS/
│   │   ├── README.md
│   │   └── API.md
│   └── src/
└── backend/
    ├── AGENTS.md
    ├── SPECS/
    │   ├── README.md
    │   └── API.md
    └── src/
```

Initialization rules:

* `workflow-state.json` starts at `stage: "initialized"` with `allowedNextStages: ["requirements-draft"]` and empty `history: []`.
* Root `SPECS/API.md` is created at init as the only cross-end API contract, with frontmatter `status: draft`.
* `frontend/SPECS/API.md` and `backend/SPECS/API.md` are created at init and must contain exactly this source line: `Source: ../../SPECS/API.md`.
* `frontend/SPECS/README.md` and `backend/SPECS/README.md` must list future local artifacts: `PRD.md`, `ARCHITECTURE.md`, `API.md`, `FEATURES/<feature-slug>/spec.md, tasks.md`.
* `tasks/backlog.md` is not created until `requirements-confirmed`; `tasks/sprint-01.md` is not created until `implementation-ready`.
* Stage artifact files under `workflow/` are not pre-created. A stage artifact may exist only for the current stage or the immediate target of `kit stage advance`.

## Workflow State Machine

Stage order is fixed and cannot be skipped:

```text
initialized
-> requirements-draft
-> requirements-confirmed
-> solution-options
-> solution-selected
-> implementation-ready
```

`workflow-state.json` schema:

```json
{
  "stage": "initialized",
  "allowedNextStages": ["requirements-draft"],
  "currentStageDoc": null,
  "lastConfirmedDoc": null,
  "confirmation": null,
  "selection": null,
  "history": []
}
```

History entries are written only by `kit stage advance`:

```json
{
  "from": "requirements-draft",
  "to": "requirements-confirmed",
  "advancedBy": "user",
  "advancedAt": "2026-06-28T00:00:00.000Z",
  "quote": "用户逐字原话",
  "doc": "workflow/requirements.md"
}
```

`--quote` is mandatory for every stage advance and must be the user exact quote, not an Agent summary.

`--by` must be `"user"` for all `kit stage advance` calls in v1. Agent-initiated advances are not supported.

### History `doc` mapping

| Transition | doc field value |
| --- | --- |
| `initialized` → `requirements-draft` | `workflow/requirements.md` |
| `requirements-draft` → `requirements-confirmed` | `workflow/requirements.md` |
| `requirements-confirmed` → `solution-options` | `workflow/solution-options.md` |
| `solution-options` → `solution-selected` | `workflow/solution-selected.md` |
| `solution-selected` → `implementation-ready` | `workflow/implementation-ready.md` |

## Stage File Lifecycle

`workflow/*.md` files follow a strict creation-and-advance lifecycle:

1. **Agent creates.** The Agent writes the stage file for the **immediate next stage** (the only entry in `allowedNextStages`). This is the "immediate target" rule — the file may exist before `kit stage advance` because the Agent prepares it in advance.
2. **User confirms and advances.** The user reviews the file, then runs `kit stage advance <stage> --by user --quote "..."`. `kit stage advance` **does not create or modify any `workflow/*.md` file**. Before writing state, it **reads the target artifact and validates minimal frontmatter**: the file must exist, have valid YAML frontmatter, and include the `status` field required for the target stage. If validation fails, the command aborts and does not update `workflow-state.json`. After validation passes, it updates `workflow-state.json` — see Transition State Diff below for the full field-by-field diff per transition. `kit check` still performs full Gate Rules validation post-advance.
3. **File becomes current-stage artifact.** After advance, the previously prepared file is now the current stage's required artifact. `kit check` (with Phase 2 artifact checks) validates it exists with correct frontmatter.
4. **Next cycle.** The Agent now prepares the file for the new immediate next stage, and the cycle repeats.

Example flow for `initialized` → `requirements-draft`:

```text
[initialized]  No workflow/*.md files exist
    │
    │  Agent creates workflow/requirements.md (status: draft)
    │  ↑ allowed as "immediate target"
    │
    │  User: kit stage advance requirements-draft --by user --quote "确认需求"
    │  ↑ only updates workflow-state.json; does NOT touch workflow/requirements.md
    │
[requirements-draft]  workflow/requirements.md exists (current stage artifact)
    │  kit check → ✅ (status: draft matches current stage)
    │
    │  Agent updates workflow/requirements.md frontmatter to status: confirmed
    │  ↑ same file, updated frontmatter; still the immediate target
    │  ↑ kit check NOW FAILS — expected: kit stage advance will validate instead
    │
    │  User: kit stage advance requirements-confirmed --by user --quote "需求没问题"
    │  ↑ validates file exists + status: confirmed, then advances state
    │
[requirements-confirmed]  workflow/requirements.md is confirmed
    │  kit check → ✅ (status: confirmed matches current stage)
```

## Transition State Diff

When `kit stage advance <stage> --by user --quote "..."` runs, `workflow-state.json` receives the following per-transition updates. `—` means a field is unchanged from its previous value; `append entry` pushes a new `{"from","to","advancedBy","advancedAt","quote","doc"}` object to the `history` array.

| Transition | `stage` | `allowedNextStages` | `currentStageDoc` | `lastConfirmedDoc` | `confirmation` | `selection` | `history` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `initialized` → `requirements-draft` | `"requirements-draft"` | `["requirements-confirmed"]` | `"workflow/requirements.md"` | — | — | — | append entry |
| `requirements-draft` → `requirements-confirmed` | `"requirements-confirmed"` | `["solution-options"]` | `"workflow/requirements.md"` | `"workflow/requirements.md"` | `{"confirmedBy":"user","confirmedAt":"<ISO>","confirmationQuote":"<quote>"}` | — | append entry |
| `requirements-confirmed` → `solution-options` | `"solution-options"` | `["solution-selected"]` | `"workflow/solution-options.md"` | — | — | — | append entry |
| `solution-options` → `solution-selected` | `"solution-selected"` | `["implementation-ready"]` | `"workflow/solution-selected.md"` | — | — | `{"selectionType":"option\|custom","selectedOptionId":"<id>","selectedBy":"user","selectedAt":"<ISO>","selectionQuote":"<quote>"}` | append entry |
| `solution-selected` → `implementation-ready` | `"implementation-ready"` | `[]` | `"workflow/implementation-ready.md"` | `"workflow/implementation-ready.md"` | `{"confirmedBy":"user","confirmedAt":"<ISO>","confirmationQuote":"<quote>"}` | — | append entry |

### Pre-Advance Validation

Before writing updated state, `kit stage advance` validates the target artifact against these minimum requirements. If the file is missing, has no YAML frontmatter, or the `status` field does not match, the command aborts with an error.

| Transition | File must exist | Required `status` |
| --- | --- | --- |
| `initialized` → `requirements-draft` | `workflow/requirements.md` | `draft` |
| `requirements-draft` → `requirements-confirmed` | `workflow/requirements.md` | `confirmed` |
| `requirements-confirmed` → `solution-options` | `workflow/solution-options.md` | `proposed` |
| `solution-options` → `solution-selected` | `workflow/solution-selected.md` | `selected` |
| `solution-selected` → `implementation-ready` | `workflow/implementation-ready.md` | `ready` |

`kit stage advance` validates **only** the `status` field. It does not check additional frontmatter fields required by the post-advance Gate Rules. This is a deliberate v1 simplification: `kit stage advance` is the transition gate, `kit check` is the quality gate.

**Fields checked by `kit check` but NOT by `kit stage advance`:**

| Transition | Additional fields `kit check` validates |
| --- | --- |
| `requirements-draft` → `requirements-confirmed` | `confirmedBy`, `confirmedAt`, `confirmationQuote` |
| `solution-options` → `solution-selected` | `selectionType`, `selectedOptionId`, `selectedBy`, `selectedAt`, `selectionQuote` |
| `solution-selected` → `implementation-ready` | `confirmedBy`, `confirmedAt`, `confirmationQuote` |

An advance that passes pre-advance validation may still fail `kit check` if the Agent omitted these additional fields. Agents must ensure the target artifact is complete before invoking `kit stage advance`.

## Gate Rules

`kit check` validates YAML frontmatter and JSON only. Markdown body is for human readability; `AGENTS.md` still requires the matching human-readable confirmation section.

### `kit check` vs `kit stage advance` responsibility split

* `kit check` validates the **current stable state** only. It uses the per-stage requirements columns in the Gate Rules table below. When the Agent has prepared an immediate target artifact (updated frontmatter, new file) but the stage has not yet advanced, `kit check` is **expected to fail** — this is not a bug; the pre-advance validation is `kit stage advance`'s responsibility.
* `kit stage advance` performs **pre-advance validation** against the [Pre-Advance Validation](#pre-advance-validation) table (file existence + required `status`). It does not consult Gate Rules. Only `kit stage advance` determines whether the transition is allowed.
* The **Allowed immediate target artifact** column in the Gate Rules table only controls whether a file's **existence** is permitted at the current stage — it prevents new files from being flagged as premature. It does **not** override the current stage's `status` requirement. When a file serves as both the current stage artifact and the immediate target (currently only `workflow/requirements.md` in `requirements-draft`), `kit check` checks its `status` against the current stage requirement.

| Stage | Required artifacts | Required frontmatter / state | Allowed immediate target artifact |
| --- | --- | --- | --- |
| `initialized` | Root control files, root `SPECS/API.md`, frontend/backend `SPECS/README.md`, frontend/backend `SPECS/API.md`, `memory/decisions.md`, `tasks/README.md` | No `workflow/*.md` stage files may exist, except the allowed immediate target artifact. | `workflow/requirements.md` |
| `requirements-draft` | `workflow/requirements.md` | `status: draft`. No solution or implementation workflow files may exist. | `workflow/requirements.md` (updated frontmatter) |
| `requirements-confirmed` | `workflow/requirements.md`, `tasks/backlog.md` | `status: confirmed`, `confirmedBy`, `confirmedAt`, `confirmationQuote`; state `lastConfirmedDoc` points to `workflow/requirements.md`. | `workflow/solution-options.md` |
| `solution-options` | `workflow/solution-options.md` | `status: proposed`, exactly 3 `optionIds`. No selected or implementation workflow files may exist, except the allowed immediate target artifact. | `workflow/solution-selected.md` |
| `solution-selected` | `workflow/solution-selected.md`, `memory/decisions.md` | `status: selected`, `selectionType: option\|custom`, `selectedOptionId`, `selectedBy`, `selectedAt`, `selectionQuote`; `memory/decisions.md` must contain the same `selectedOptionId`. | `workflow/implementation-ready.md` |
| `implementation-ready` | `workflow/implementation-ready.md`, `tasks/sprint-01.md`, root `SPECS/API.md` | `status: ready`, `confirmedBy`, `confirmedAt`, `confirmationQuote`; frontend/backend API files still reference `../../SPECS/API.md`. | N/A (terminal stage) |

Selection rules:

* Agent default selection is forbidden.
* Users may pick one of the 3 options or define a custom solution.
* Custom selection must use `selectionType: custom`; `selectedOptionId` is still required but does not need to match `solution-options.md`.
* `kit check` does not parse Markdown option sections. It trusts `optionIds`, `selectionType`, `selectedOptionId`, and `memory/decisions.md`.

Frontmatter examples:

```yaml
---
status: confirmed
confirmedBy: user
confirmedAt: 2026-06-28T00:00:00.000Z
confirmationQuote: "用户逐字原话"
---
```

```yaml
---
status: selected
selectionType: custom
selectedOptionId: custom-admin-reporting
selectedBy: user
selectedAt: 2026-06-28T00:00:00.000Z
selectionQuote: "用户逐字原话"
---
```

## Agent Workflow

`AGENTS.md` files must enforce these rules:

* Root `AGENTS.md` defines the workflow, stage order, hard stops, CLI commands, skill routing, and cross-end contract rules.
* `frontend/AGENTS.md` tells the frontend Agent to work inside `frontend/`, read root `SPECS/API.md`, maintain `frontend/SPECS/`, and never change backend code.
* `backend/AGENTS.md` tells the backend Agent to work inside `backend/`, read root `SPECS/API.md`, maintain `backend/SPECS/`, and never change frontend code.
* After asking clarification questions, Agent must stop until the user replies.
* Without `requirements-confirmed`, Agent must not create solution files.
* Without `solution-selected`, Agent must not create implementation-ready files.
* Without `implementation-ready`, Agent must not implement feature code.

Default skill chain is intentionally narrow:

```text
requirement-clarification (→ ce-brainstorm)
-> doc-iteration (→ doc-coauthoring)
-> spec-lock (→ spec-driven-development)
-> solution-options (→ design-an-interface)
-> tech-plan-generator (→ planning-and-task-breakdown)
-> api-design (→ api-and-interface-design)
-> shell-implementation (→ implement)
-> tdd (→ tdd)
-> webapp-testing (→ webapp-testing)
-> code-review (→ code-review-and-quality)
-> documentation (→ documentation-and-adrs)
```

`requirement-grilling`, `domain-modeling`, `ubiquitous-language`, `security-review`, UI design, prototype, debug, and architecture diagram skills remain conditional triggers. Hook support is limited to generated documentation and examples in v1; no runtime-specific hook integration ships in v1.

### Stage Gate Enforcement

**v1 design:** `kit stage advance` validates the target artifact's existence and `status` frontmatter before writing state (see [Pre-Advance Validation](#pre-advance-validation)). Full Gate Rules validation remains the responsibility of `kit check` post-advance. `AGENTS.md` rules rely on Agent compliance; there is no runtime interception of file creation. Runtime hooks and real-time gate enforcement are deferred to v2.

### `upfrontUserConfirm` (intentionally excluded)

The `workflow-state.json` schema does not include an `upfrontUserConfirm` field in v1. Every `kit stage advance` call already requires `--quote` (the user's exact words), so the confirmation signal is captured in the `history[]` array at advance time. A separate in-schema confirmation flag would be redundant with this design and is deferred to v2 if needed.

## Test Boundary

* `kit check` remains lightweight and does not run frontend/backend typecheck in v1.
* Machine checks trust JSON and YAML frontmatter, not Markdown prose.
* `SPECS/` is the canonical spelling everywhere, including root, frontend, and backend.
* Current template stack stays as Vue frontend + Node backend with directory names `frontend/` and `backend/`.
