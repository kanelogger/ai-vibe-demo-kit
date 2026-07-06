---
scope: frontend
status: template
---
# Frontend Architecture

## Source

- Frontend PRD: `PRD.md`
- Shared API contract: `../../SPECS/API.md`
- Feature specs: `FEATURES/<feature-slug>/spec.md`

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| Frontend PRD | `PRD.md` | User flow and acceptance | required |
| Shared API contract | `../../SPECS/API.md` | Field alignment | required when API changes |
| Existing frontend module |  | Component, state, and routing shape | required when similar module exists |
| Design / prototype / screenshot |  | Layout and interaction | required when UI changes |

## Runtime Shape

- Framework: Vue 3 + Vite
- UI: Element Plus
- State: Pinia
- Routing: Vue Router with backend-driven async routes

## Module Boundaries

| Area | Location | Notes |
| --- | --- | --- |
| Pages | `src/views/` | Feature pages and route components |
| API clients | `src/api/` | HTTP wrappers aligned with root `SPECS/API.md` |
| Store | `src/store/` | Shared state only |
| Utilities | `src/utils/` | Cross-feature helpers |

## Data Contracts

Every backend response field consumed by the frontend must be documented in root `SPECS/API.md`.

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] Browser smoke path:
