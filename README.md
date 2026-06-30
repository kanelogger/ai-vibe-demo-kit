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
node scripts/kit.mjs check
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
node scripts/kit.mjs check
node scripts/kit.mjs next
node scripts/kit.mjs skills
node scripts/kit.mjs propose
node scripts/kit.mjs options
node scripts/kit.mjs sdd user-import
node scripts/kit.mjs stage advance requirements-draft --by user --quote "进入需求草稿"
```

The orchestration commands read `workflow-state.json` and `.agents/skills.json`, then create or validate workflow and SDD files. They do not execute Agent skills or choose a solution for the user. `kit options` only creates files after `requirements-confirmed`; `kit sdd` only creates feature SDD files after `solution-selected`.

## Requirements

- Node.js `^20.19.0 || >=22.13.0`
- pnpm `>=9`

## Publishing

Release checks:

```sh
pnpm test
pnpm typecheck
pnpm build
npm pack --dry-run
```
