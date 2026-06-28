# Workflow Artifacts

Stage artifacts are created only when allowed by `workflow-state.json`.

- `workflow/requirements.md`
- `workflow/solution-options.md`
- `workflow/solution-selected.md`
- `workflow/implementation-ready.md`

Use `pnpm kit:check` before and after stage work. Use `pnpm kit:stage -- advance <stage> --by user --quote "<user exact quote>"` to advance.
