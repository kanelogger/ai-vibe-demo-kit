# ai-vibe-demo-kit

Agent-friendly PC admin project scaffold.

`ai-vibe-demo-kit` creates a full-stack admin workspace with:

- a Vue admin frontend template;
- a Fastify backend template;
- `AGENTS.md`, `SPECS`, `rules`, `workflow`, `tasks`, and `memory` control files;
- a staged workflow lock driven by `workflow-state.json`;
- bundled project skills under `.agents/skills`.

## Usage

Create a project without installing globally:

```sh
npx ai-vibe-demo-kit init my-admin
```

Then run the generated project checks:

```sh
cd my-admin
pnpm install
pnpm kit:check
```

You can also install the package globally:

```sh
npm install -g ai-vibe-demo-kit
kit init my-admin
```

## Commands

```sh
kit init <project-name>
kit check [project-root]
kit skills [project-root]
kit skill <alias> [project-root]
kit next [project-root]
kit propose [--title "..."] [--force]
kit options [--ids a,b,c] [--check] [--force]
kit sdd [feature-slug] [--force]
kit stage advance <stage> --by user --quote "<user exact quote>"
```

The generated project also includes local scripts:

```sh
pnpm kit:check
pnpm kit:next
pnpm kit:skills
pnpm kit:route -- --message "帮我梳理需求"
pnpm kit:propose -- --title "User Import"
pnpm kit:options -- --ids minimal,balanced,robust
pnpm kit:sdd -- user-import
pnpm kit:stage -- advance requirements-draft --by user --quote "进入需求草稿"
```

The orchestration commands read `workflow-state.json` and `.agents/skills.json`, then create or validate workflow and SDD files. They do not execute Agent skills or choose a solution for the user. `kit options` only creates files after `requirements-confirmed`; `kit sdd` only creates feature SDD files after `solution-selected`.

`.agents/hooks/route-skill.mjs` is a deterministic optional routing hook. It reads the current stage and user message, returns recommended skill aliases, and never mutates workflow files.

## Full Workflow

1. Create and inspect the project:

```sh
npx ai-vibe-demo-kit init my-admin
cd my-admin
pnpm install
pnpm kit:check
pnpm kit:next
```

2. Draft requirements:

```sh
pnpm kit:propose -- --title "Feature Name"
pnpm kit:stage -- advance requirements-draft --by user --quote "<user asked to enter requirements draft>"
```

Edit `workflow/requirements.md` until it has `status: confirmed`, `confirmedBy`, `confirmedAt`, and `confirmationQuote`, then advance:

```sh
pnpm kit:stage -- advance requirements-confirmed --by user --quote "<user confirmed requirements>"
```

3. Create exactly three solution options:

```sh
pnpm kit:options -- --ids minimal,balanced,robust
pnpm kit:options -- --check
pnpm kit:stage -- advance solution-options --by user --quote "<user approved the options>"
```

4. Record the selected solution:

Create `workflow/solution-selected.md` with `status: selected`, the selected option id, and the user's selection quote. Record the same selected option id in `memory/decisions.md`, then run:

```sh
pnpm kit:stage -- advance solution-selected --by user --quote "<user selected the option>"
```

5. Prepare implementation:

```sh
pnpm kit:sdd -- user-import
```

Create `workflow/implementation-ready.md` with `status: ready`, create `tasks/sprint-01.md`, then run:

```sh
pnpm kit:stage -- advance implementation-ready --by user --quote "<user approved implementation>"
pnpm kit:check
```

When `kit check` fails, read every `Repair:` line and fix that file before advancing again. Common failures are missing YAML frontmatter, future workflow files created too early, fewer or more than three `optionIds`, or a hand-edited `workflow-state.json`.

## Requirements

- Node.js `^20.19.0 || >=22.13.0`
- pnpm `>=9`

## Publishing

Release checks:

```sh
pnpm build
pnpm test
pnpm typecheck
npm pack --dry-run
npm publish --dry-run
```

The published npm package must include `README.md`, `skills-list.md`, `.agents/skills.json`, `.agents/skills/`, `.agents/hooks/`, `packages/cli/dist/`, and `templates/pc-admin/`.
