---
scope: backend
feature: example-feature
status: example
---
# Backend Feature Spec: example-feature

## Source

- Workflow requirements: `../../../../workflow/requirements.md`
- Selected solution: `../../../../workflow/solution-selected.md`
- Backend PRD: `../../PRD.md`
- Shared API contract: `../../../../SPECS/API.md`
- Database contract: `../../../../SPECS/DATABASE.md`

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| User request | `../../../../workflow/requirements.md` | Problem boundary | required |
| Selected solution | `../../../../workflow/solution-selected.md` | Scope and tradeoff | required |
| Shared API contract | `../../../../SPECS/API.md` | Endpoint and field alignment | required when API changes |
| Database contract | `../../../../SPECS/DATABASE.md` | Schema and seed alignment | required when schema changes |
| Existing backend module |  | Harness candidate | required when similar module exists |

## Harness References

| Reference | Location | Reused Pattern | Deliberate Differences |
| --- | --- | --- | --- |
| Closest backend route |  |  |  |
| Closest service |  |  |  |
| Closest database table or seed |  |  |  |

## Capability

Describe the backend behavior needed for the selected feature.

## API Contract

| Endpoint | Method | Request | Response |
| --- | --- | --- | --- |
|  |  |  |  |

## Field Alignment

| Endpoint | Request Fields | Backend JSON Fields | Frontend VO Fields | Mapping Notes |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Data Model

| Table | Fields | Notes |
| --- | --- | --- |
|  |  |  |

## Error Handling

- Validation:
- Auth:
- Not found:
- Conflict:

## Implicit Behaviors To Review

- Defaults:
- Soft delete / status transitions:
- Sorting / pagination:
- Permissions:
- Date and null handling:

## Acceptance Criteria

- [ ] Criteria:
