---
scope: frontend
status: template
---
# Frontend Architecture

## Source

- Frontend PRD: `PRD.md`
- Shared API contract: `../../SPECS/API.md`
- Feature specs: `FEATURES/<feature-slug>/spec.md`

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
