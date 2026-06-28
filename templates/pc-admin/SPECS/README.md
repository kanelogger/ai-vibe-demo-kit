# SPECS Contract

Kit-Test maps the older SDD document list into this structure.

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
