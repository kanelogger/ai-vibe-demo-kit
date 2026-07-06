# Sample Feature Walkthrough

This walkthrough specifies an admin user list feature without implementing UI or API code.

## 1. initialized

Fresh output contains no `workflow/*.md` stage artifacts.

Run:

```sh
pnpm kit:check
```

Agent may create only the immediate target artifact:

```text
workflow/requirements.md
```

with:

```yaml
---
status: draft
---
```

Then the user advances:

```sh
pnpm kit:stage -- advance requirements-draft --by user --quote "确认进入需求草稿"
```

## 2. requirements-draft

`workflow/requirements.md` is the current artifact. Before confirming, the Agent updates its frontmatter to:

```yaml
---
status: confirmed
confirmedBy: user
confirmedAt: 2026-06-28T00:00:00.000Z
confirmationQuote: "需求内容确认"
---
```

The requirements document must include a `Source Register`. Minimal example:

```md
| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| User request | "需要用户列表支持搜索和分页" | Problem boundary | confirmed |
| API documentation | `SPECS/API.md` | Endpoint and field facts | required |
| Design / prototype / screenshot | 无可用来源：沿用用户管理页形态 | UI behavior and layout | accepted risk |
| Existing module reference | `frontend/src/views/system/user/`, `backend/src/routes/user-management.ts` | Harness candidate | confirmed |
```

Then the user advances:

```sh
pnpm kit:stage -- advance requirements-confirmed --by user --quote "需求内容确认"
```

Create `tasks/backlog.md` from the confirmed requirements.

## 3. requirements-confirmed

Agent may create only:

```text
workflow/solution-options.md
```

with:

```yaml
---
status: proposed
optionIds: [minimal-list, table-filtering, audit-ready]
---
```

Then the user advances:

```sh
pnpm kit:stage -- advance solution-options --by user --quote "请进入方案选择"
```

## 4. solution-options

Agent may create only:

```text
workflow/solution-selected.md
```

with:

```yaml
---
status: selected
selectionType: option
selectedOptionId: table-filtering
selectedBy: user
selectedAt: 2026-06-28T00:00:00.000Z
selectionQuote: "选择 table-filtering"
---
```

Record `table-filtering` in `memory/decisions.md`, then advance:

```sh
pnpm kit:stage -- advance solution-selected --by user --quote "选择 table-filtering"
```

## 5. solution-selected

Now write cross-end and local specs:

```text
SPECS/API.md
frontend/SPECS/PRD.md
frontend/SPECS/ARCHITECTURE.md
frontend/SPECS/FEATURES/admin-user-list/spec.md
frontend/SPECS/FEATURES/admin-user-list/tasks.md
backend/SPECS/PRD.md
backend/SPECS/ARCHITECTURE.md
backend/SPECS/FEATURES/admin-user-list/spec.md
backend/SPECS/FEATURES/admin-user-list/tasks.md
workflow/implementation-ready.md
```

Each feature spec must record `Harness References`, such as the closest existing frontend view/API client, backend route/service, and database table or seed. If no close reference exists, record that explicitly before implementation.

Each PRD, architecture document, feature spec, and implementation-ready plan must keep the same source facts in `Source Register`, with narrower status notes for that scope.

`SPECS/API.md` must contain the request and response fields used by both sides:

```md
### GET /api/v1/users

Request query: `page`, `pageSize`, `keyword`

Response fields:

| Field | Backend JSON | Frontend VO |
| --- | --- | --- |
| id | id | id |
| username | username | username |
| displayName | displayName | displayName |
| status | status | status |
| createdAt | createdAt | createdAt |
```

`workflow/implementation-ready.md` uses:

```yaml
---
status: ready
confirmedBy: user
confirmedAt: 2026-06-28T00:00:00.000Z
confirmationQuote: "可以进入实现"
---
```

Then the user advances:

```sh
pnpm kit:stage -- advance implementation-ready --by user --quote "可以进入实现"
```

Create `tasks/sprint-01.md`.

## 6. implementation-ready

Run:

```sh
pnpm kit:check
```

Only now may Agents implement feature code.

During implementation Review, list implicit behaviors inherited from the reference module, such as form reset, default values, soft delete, sorting, permission filtering, and date/null handling. Keep only behaviors that match the confirmed requirements and specs.

If review finds a repeatable pitfall, write it back to the durable layer: `rules/` for Agent constraints, `SPECS/` for contract facts, `tasks/` for sprint verification, or `scripts/check-*` when it can be checked deterministically.
