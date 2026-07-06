---
scope: frontend
feature: example-feature
status: example
---
# Frontend Feature Spec: example-feature

## Source

- Workflow requirements: `../../../../workflow/requirements.md`
- Selected solution: `../../../../workflow/solution-selected.md`
- Frontend PRD: `../../PRD.md`
- Shared API contract: `../../../../SPECS/API.md`

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| User request | `../../../../workflow/requirements.md` | Problem boundary | required |
| Selected solution | `../../../../workflow/solution-selected.md` | Scope and tradeoff | required |
| Shared API contract | `../../../../SPECS/API.md` | Field alignment | required when API changes |
| Design / prototype / screenshot |  | Layout and interaction | required when UI changes |
| Existing frontend module |  | Harness candidate | required when similar module exists |

## Harness References

| Reference | Location | Reused Pattern | Deliberate Differences |
| --- | --- | --- | --- |
| Closest frontend view |  |  |  |
| Closest API client |  |  |  |
| Closest UI state or component |  |  |  |

## User Story

As an operator, I need a focused frontend workflow so that I can complete the selected business task.

## UI Contract

| View / Component | Location | Responsibility |
| --- | --- | --- |
|  | `src/views/` |  |

## API Usage

| API | Frontend VO Fields | Notes |
| --- | --- | --- |
|  |  |  |

## Field Alignment

| Endpoint | Request Fields | Backend JSON Fields | Frontend VO Fields | Mapping Notes |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## States

- Loading:
- Empty:
- Error:
- Success:

## Implicit Behaviors To Review

- Defaults:
- Soft delete / status transitions:
- Sorting / pagination:
- Permissions:
- Date and null handling:

## Acceptance Criteria

- [ ] Criteria:
