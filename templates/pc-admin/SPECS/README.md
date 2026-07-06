# SPECS Contract

ai-vibe-demo-kit maps the older SDD document list into this structure.

## Relationship to Workflow

`workflow/` records stage decisions. `SPECS/` records the implementation contract that survives after a stage advances.

- Draft and confirm the user problem in `workflow/requirements.md`.
- Compare exactly three approaches in `workflow/solution-options.md`.
- Record the user's selected approach in `workflow/solution-selected.md`.
- After the selected approach is stable, use `frontend/SPECS/` and `backend/SPECS/` to write the SDD implementation contract.

Use `kit sdd <feature-slug>` to create a feature-specific SDD skeleton. The CLI only creates files; it does not execute Agent skills or choose a solution.

Before implementation, each feature spec must name its `Harness References`: the closest existing frontend view/API client, backend route/service, and database table or seed. If no close reference exists, record that explicitly and explain why.

## Context Layers

Use three context layers when writing or reviewing specs:

| Layer | Files | Purpose |
| --- | --- | --- |
| Gate | `workflow-state.json`, `workflow/`, `tasks/` | Stage permission and selected work. |
| Contract | `SPECS/API.md`, `SPECS/DATABASE.md`, feature specs | Cross-end facts that implementation must obey. |
| Harness | Existing frontend/backend modules and `Harness References` | Local shape, naming, UI behavior, and implicit behavior examples. |

## Source Register

Every requirements, solution, PRD, architecture, and feature spec should record the sources it used:

- user request or confirmation quote;
- PRD, issue, ticket, or product document;
- API documentation or root `SPECS/API.md`;
- design source, prototype, screenshot, or “无可用来源”;
- test case, log, incident, or release note when relevant;
- closest existing module references.

Do not invent missing fields, enum values, permissions, or visual behavior. Mark missing sources explicitly and keep them as open questions or risks.

## SDD Mapping

| Old SDD artifact | New destination |
| --- | --- |
| Frontend `proposal.md` | `workflow/requirements.md` plus `frontend/SPECS/PRD.md` |
| Frontend `spec.md` | `frontend/SPECS/ARCHITECTURE.md` and `frontend/SPECS/FEATURES/<feature-slug>/spec.md` |
| Frontend `tasks.md` | `frontend/SPECS/FEATURES/<feature-slug>/tasks.md` |
| Backend `proposal.md` | `workflow/requirements.md` plus `backend/SPECS/PRD.md` |
| Backend `spec.md` | `backend/SPECS/ARCHITECTURE.md` and root `SPECS/API.md` |
| Backend `design.md` | `backend/SPECS/ARCHITECTURE.md` and `backend/SPECS/FEATURES/<feature-slug>/spec.md` |
| Backend `tasks.md` | `backend/SPECS/FEATURES/<feature-slug>/tasks.md` |

Root `SPECS/API.md` is the only cross-end API contract. Frontend and backend local `SPECS/API.md` files must remain references to it.

## Field Alignment Rule

For every endpoint, root `SPECS/API.md` must list:

- request parameters used by the frontend;
- response JSON fields returned by the backend;
- frontend VO field names when they consume response fields.

Frontend VO field names and backend response JSON fields must match unless root `SPECS/API.md` explicitly documents a mapping.

Mock data used for frontend self-checks must be derived from this root contract and a similar real/template response shape, not invented independently.

## Rule Feedback Loop

When implementation or review uncovers a repeatable pitfall, record it in the durable layer:

- `rules/` for Agent behavior and coding constraints;
- `SPECS/API.md` or `SPECS/DATABASE.md` for contract facts;
- `tasks/` for sprint-level verification work;
- `scripts/check-*` when the pitfall can be validated deterministically.
