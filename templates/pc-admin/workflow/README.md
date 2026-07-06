# Workflow Artifacts

Stage artifacts are created only when allowed by `workflow-state.json`.

- `workflow/requirements.md`
- `workflow/solution-options.md`
- `workflow/solution-selected.md`
- `workflow/implementation-ready.md`

Use the `*.template.md` files as copy sources. Do not edit template files as active stage artifacts.

| Template | Copy To | Copy Timing |
| --- | --- | --- |
| `requirements.template.md` | `requirements.md` | When moving from `initialized` into `requirements-draft`. Keep `status: draft` until the user confirms requirements. |
| `solution-options.template.md` | `solution-options.md` | Only after `requirements-confirmed`. Keep exactly three `optionIds`. |
| `solution-selected.template.md` | `solution-selected.md` | Only after the user chooses one option or explicitly gives a custom choice. |
| `implementation-ready.template.md` | `implementation-ready.md` | Only after `solution-selected` and before implementation starts. |

Use `pnpm kit:check` before and after stage work. Use `pnpm kit:stage -- advance <stage> --by user --quote "<user exact quote>"` to advance.

Each active workflow artifact should keep its `Source Register` current. Record user quotes, PRD/API/design/test/log sources, closest existing modules, and missing sources. Missing sources are tracked as open questions or risks, not filled by guesswork.
