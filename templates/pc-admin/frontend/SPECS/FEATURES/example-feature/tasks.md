---
scope: frontend
feature: example-feature
status: example
---
# Frontend Feature Tasks: example-feature

## Implementation

- [ ] Confirm feature spec `Source Register` records user request, API contract, design source, and frontend reference status.
- [ ] Record closest frontend references in the feature spec `Harness References`.
- [ ] Confirm root `SPECS/API.md` contains every consumed field and mapping.
- [ ] Derive Mock data from root `SPECS/API.md` and a similar real/template response.
- [ ] Add or update API client functions under `src/api/`.
- [ ] Add or update view components under `src/views/`.
- [ ] Wire route/menu behavior when required.
- [ ] Add user-facing loading, empty, error, and success states.
- [ ] Document UI behaviors inherited from references, including reset, loading, empty, error, permissions, and sorting.

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] Implicit behavior review completed
- [ ] Rule or check candidate recorded when a reusable pitfall is found
- [ ] Browser smoke path:
