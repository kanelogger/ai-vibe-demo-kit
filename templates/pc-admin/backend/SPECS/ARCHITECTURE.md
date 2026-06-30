---
scope: backend
status: template
---
# Backend Architecture

## Source

- Backend PRD: `PRD.md`
- Shared API contract: `../../SPECS/API.md`
- Database contract: `../../SPECS/DATABASE.md`
- Feature specs: `FEATURES/<feature-slug>/spec.md`

## Runtime Shape

- Runtime: Node.js + TypeScript
- HTTP framework: Fastify
- Database: MySQL via `mysql2/promise`
- Response style: `{ success, data }`

## Module Boundaries

| Area | Location | Notes |
| --- | --- | --- |
| Routes | `src/routes/` | Request parsing and response wiring |
| Services | `src/services/` | Business logic and SQL calls |
| DB | `src/db/` | MySQL pool and database access helpers |
| Utilities | `src/utils/` | Shared response, auth, tree, pagination helpers |

## Data Contracts

Database changes must be reflected in root `SPECS/DATABASE.md`, `backend/db/schema.sql`, and necessary seed data.

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] API smoke path:
