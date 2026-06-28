# Generated Project Agent Rules

This workspace is controlled by Kit-Test v1. The root owns workflow state, stage gates, shared API contracts, tasks, and decisions.

## Commands

- `pnpm kit:check`: validate the current workflow state.
- `pnpm kit:stage -- advance <stage> --by user --quote "<user exact quote>"`: advance exactly one stage after the user confirms.

## Stage Order

Stages are fixed and cannot be skipped:

```text
initialized
-> requirements-draft
-> requirements-confirmed
-> solution-options
-> solution-selected
-> implementation-ready
```

`workflow-state.json` is the machine-readable source of the current stage. Do not edit it by hand. Use `kit stage advance`.

## Hard Stops

- After asking clarification questions, stop until the user replies.
- Without `requirements-confirmed`, do not create solution files.
- Without `solution-selected`, do not create implementation-ready files.
- Without `implementation-ready`, do not implement feature code.
- Do not select a solution by Agent default. User selection must be explicit. If the user explicitly says the Agent may choose, record that exact quote.

## Workflow Files

- `workflow/requirements.md` is created for `requirements-draft`, then updated to `status: confirmed` before advancing to `requirements-confirmed`.
- `workflow/solution-options.md` is created only after requirements are confirmed and must present exactly three option ids.
- `workflow/solution-selected.md` records the user's chosen option or custom selection.
- `workflow/implementation-ready.md` is created only after a solution is selected.

`kit stage advance` validates only the target artifact exists and has the required `status`. `kit check` validates the stable current stage.

## Specs And API Contract

- `SPECS/API.md` is the only cross-end API contract.
- `frontend/SPECS/API.md` and `backend/SPECS/API.md` must only reference `../../SPECS/API.md`.
- Frontend VO fields and backend response JSON fields must be represented in root `SPECS/API.md`.
- Frontend work stays inside `frontend/` unless updating root workflow/API/tasks is explicitly part of the current stage.
- Backend work stays inside `backend/` unless updating root workflow/API/tasks is explicitly part of the current stage.

## Skill Routing

Default chain:

```text
requirement-clarification -> doc-iteration -> spec-lock -> solution-options
-> tech-plan-generator -> api-design -> shell-implementation -> tdd
-> webapp-testing -> code-review -> documentation
```

Use conditional skills only when their trigger is explicit or required by the task.
