---
status: ready
confirmedBy: user
confirmedAt: 2026-01-01T00:00:00.000Z
confirmationQuote: "<exact user quote>"
---
# Implementation Ready

## Scope

- Selected option:
- User-confirmed implementation boundary:

## Source Register Check

| Source Type | Location / Quote | Status |
| --- | --- | --- |
| User confirmation |  | required |
| Requirements | `workflow/requirements.md` | required |
| Selected solution | `workflow/solution-selected.md` | required |
| API contract | `SPECS/API.md` | required when API changes |
| Database contract | `SPECS/DATABASE.md` | required when schema changes |
| Design / prototype / screenshot |  | required when UI changes |
| Test / log / incident |  | optional |

## Files To Change

- Path:
- Path:

## Implementation Plan

1. Step:
2. Step:
3. Step:

## Verification Plan

- Command:
- Command:

## Risks

- Risk:

## Rule / Check Updates

- New rule candidate:
- New deterministic check candidate:

## Final Confirmation

Use this file only after `solution-selected`. Do not start feature implementation until the user confirms this plan and `pnpm kit:stage -- advance implementation-ready --by user --quote "<user exact quote>"` succeeds.
