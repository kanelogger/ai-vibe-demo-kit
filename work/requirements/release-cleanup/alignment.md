# Release Cleanup Alignment

## Intent

为 `ai-vibe-demo-kit@0.4.0` 发布建立干净的新起点：删除当前仓库中已失效的历史 Evidence、旧外部 Skill 同步状态和本机忽略缓存；保留 canonical Source、Runtime、当前完成 Evidence 与 bundled Harness Skill。

## Authorized deletion targets

- `.agents/skills.lock.json`：已跟踪的旧外部 Skill 解析 lock，包含 resolved commits、materialized Skill 信息与本地 cache path；新架构的 canonical registry 为 `source/.agents/skills.sources.json`。
- `work/requirements/ai-vibe-demo-kit-v0.4.0/`：10 个历史 Evidence 文件。alignment 与 implementation Result 已因删除的 `PLAN.md` 报 `E_EVIDENCE_MISSING`，不再是有效工作记录。
- `.DS_Store`：macOS 元数据。
- `.agents/skills/.gitignore`：声明由已不存在的 `scripts/skills-sync.mjs` 生成的本机遗留文件。
- `.agents/skills/.sources/`、`.agents/skills/baoyu-design/`、`.agents/skills/web-design/`：324 个被忽略的外部 Skill materialization/cache 文件。

## Explicit preservation

- `source/`、`src/`、`test/`、`payload/`、`.harness/`、`harness` 与全部 Manifest 声明文件。
- `.agents/skills/ai-vibe-demo-kit/`：发行包中的 bundled Harness guidance Skill。
- `work/requirements/source-distribution-refactor/`：已完成 Work Item 的当前 Evidence，包含最终完成记录。
- `.git/harness/`、用户未登记文件、Git 历史与全局 `~/.npm` cache。

## Environment evidence

| Probe | Observed | Result |
| --- | --- | --- |
| `uname -s` | `Darwin` | passed |
| `uname -m` | `arm64` | passed |
| `node --version` | `v24.18.0` | passed |
| `git --version` | `2.55.0` | passed |
| `npm --version` | `11.16.0` | passed |
| `./harness check --json` | valid, revision 42 idle | passed |

## Risk and recovery

- The 10 tracked historical Evidence files and lock are recoverable from Git history until a later history rewrite; no history rewrite is authorized.
- Ignored external Skill materializations can be re-fetched from their recorded remote repositories, but are intentionally removed from this workstation state.
- The global npm cache has root-owned entries. It is outside this repository and is not deleted; release verification uses a dedicated writable temporary cache.

## Observable acceptance criteria

1. Every authorized target is absent; every explicitly preserved path remains present.
2. No active Source, Runtime, Manifest or bundled Skill path is deleted.
3. No references to the obsolete lock, old Evidence directory or removed `skills-sync.mjs` remain in maintained project files.
4. Distribution contract, bundled Skill validation, full test suite, tarball projection and whitespace checks pass.
5. The tarball excludes `work/`, test files and all ignored local Skill/cache files.
