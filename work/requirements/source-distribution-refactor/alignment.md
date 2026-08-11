# Source Distribution Refactor Alignment

## Intent

把用户侧 Coding Agent 资料收拢到单一 `source/` 目录，并由现有 Distribution CLI 负责初始化、升级和卸载。保持 Runtime Workflow、Gate、Stage Result 与 bundled `ai-vibe-demo-kit` Skill 的现有行为。

## Confirmed scope

- `source/` 包含 `.agents/skills.sources.json`、`knowledge/`、`rules/`、`specs/`、`workflows/` 和四个项目模板。
- `source/manifest.json` 成为 npm 内容和安装目标的唯一 Distribution Manifest。
- 保持 `loadDistributionManifest`、`runDistributionCommand` 与 Runtime CLI Interface 不变。
- 更新 package projection、安装账本迁移、Doctor、仓库文档和黑盒测试。

## Explicit non-goals

- 不增加 `skills sync` 或网络 Skill 物化命令。
- 不修改 Workflow Catalog、Skill 解析或 Skill 调用机制。
- 不删除当前 Runtime 所需的 bundled `ai-vibe-demo-kit` Skill。

## Environment evidence

Verified on 2026-08-11 Asia/Shanghai.

| Probe | Expected | Observed | Result |
| --- | --- | --- | --- |
| `uname -s` | macOS or Linux | `Darwin` | passed |
| `uname -m` | arm64 or x86_64 | `arm64` | passed |
| `node --version` | Node.js 22+ | `v24.18.0` | passed |
| `git --version` | available | `2.55.0` | passed |
| `npm --version` | `11.16.0` | `11.16.0` | passed |
| `docker --version` | optional | `29.4.0` | passed |

No environment deviations were found.

## Harness state deviation

`./harness check --json` and `./harness status --json` passed at revision 35, but the active Work Item intent is the placeholder `<intent>`. This change does not make a Human Gate decision or mutate `.git/harness`; moving the bound Workflow will cause expected workflow drift until the user explicitly closes or redirects that Work Item.

## Observable acceptance criteria

1. The tarball contains the complete declared `source/` tree and no unregistered files.
2. Fresh `init` projects all Source assets to their declared target paths and leaves Runtime ready.
3. Upgrade preserves modified seed content, rejects unregistered collisions atomically, and migrates the prior Manifest source layout safely.
4. Uninstall removes only ledger-owned unchanged content and preserves user or governance content.
5. Distribution, Runtime and critical-path tests pass with no skipped tests or retained temporary resources.
