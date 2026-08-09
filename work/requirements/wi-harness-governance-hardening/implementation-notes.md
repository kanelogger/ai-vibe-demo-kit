# Implementation Notes

## Decisions

- Kept Workflow schemaVersion 2 and made Artifact contracts optional, preserving old workflows without `contract`.
- Added `check-result` as a stateless CLI seam; it reports completion eligibility separately from Human Gate approval.
- Kept `implementation -> acceptance` automatic and retained Human Gates at alignment and completion.
- Kept the repository completion checker outside the installed Runtime; downstream projects receive the generic CLI and integration documentation.
- Registered all test temporary directories with a process-level cleanup hook and added a subprocess test proving removal after test exit.

## Deviations

- None from the approved plan.

## Residual Boundaries

- Harness validates declared Evidence and internal consistency. External database, account or cloud-resource state remains the responsibility of the command producing that Evidence.
- CI completion eligibility does not prove that a local Human Gate was approved.

