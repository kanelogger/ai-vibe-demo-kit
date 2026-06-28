# Backend Agent Rules

Work inside `backend/`.

## Responsibilities

- Maintain backend-local specs under `backend/SPECS/`.
- Read the shared API contract at `../SPECS/API.md`.
- Keep `backend/SPECS/API.md` as a reference to `../../SPECS/API.md`.
- Do not change frontend code.
- Do not implement feature code before root stage is `implementation-ready`.

## Local Specs

Expected future files:

- `backend/SPECS/PRD.md`
- `backend/SPECS/ARCHITECTURE.md`
- `backend/SPECS/API.md`
- `backend/SPECS/FEATURES/<feature-slug>/spec.md`
- `backend/SPECS/FEATURES/<feature-slug>/tasks.md`

Backend response JSON fields must match frontend VO fields documented in root `SPECS/API.md`.
