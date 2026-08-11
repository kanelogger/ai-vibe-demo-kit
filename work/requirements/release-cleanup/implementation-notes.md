# Release Cleanup Implementation Notes

## Removed

- Tracked obsolete external Skill lock: `.agents/skills.lock.json`.
- Tracked invalid historical Evidence: `work/requirements/ai-vibe-demo-kit-v0.4.0/` (10 files whose alignment and implementation results referenced removed `PLAN.md`).
- Ignored local artifacts: `.DS_Store`, `.agents/skills/.gitignore`, `.agents/skills/.sources/`, `.agents/skills/baoyu-design/` and `.agents/skills/web-design/`.

## Preserved

- Canonical `source/` tree and `source/.agents/skills.sources.json` remote registry.
- Bundled `.agents/skills/ai-vibe-demo-kit/` Runtime guidance Skill.
- Current completed Source refactor Evidence in `work/requirements/source-distribution-refactor/`.
- Runtime, Harness, Manifest, tests, Git history and global npm cache.

## Documentation cleanup

- Removed references to the deleted lock from `README.md` and the Source registry description.
- Kept the registry limited to remote repository metadata and tracking policy.

## Release environment note

The user-level npm cache contains root-owned entries and is outside this repository. Package verification used a dedicated temporary cache, then removed it. Publication should use a writable release/CI cache rather than modifying the shared cache as part of this cleanup.
