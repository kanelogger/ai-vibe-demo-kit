---
scope: backend
feature: example-feature
status: example
---
# Backend Feature Tasks: example-feature

## Implementation

- [ ] Record closest backend references in the feature spec `Harness References`.
- [ ] Confirm root `SPECS/API.md` contains request and response fields.
- [ ] Confirm root `SPECS/DATABASE.md` contains required table changes.
- [ ] Add or update route handlers under `src/routes/`.
- [ ] Add or update services under `src/services/`.
- [ ] Update schema or seed files when data shape changes.
- [ ] Document backend behaviors inherited from references, including defaults, soft delete, sorting, audit fields, date transforms, and null handling.

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] Implicit behavior review completed
- [ ] API smoke path:
