# Shared Architecture

## Responsibility

提供 Runtime 与 Distribution 共享的错误、路径、发行身份与 Git 仓库 Mutation guard。

## Modules

| Module | Interface |
| --- | --- |
| `errors.mjs` | `HarnessError`、`fail` |
| `path-safety.mjs` | `isInside`、`resolveInside`、`firstSymlinkInPath` |
| `manifest.mjs` | `loadHarnessManifest` 与 schema v2 能力校验 |
| `repository-guard.mjs` | `repositoryPaths`、`withRepositoryMutation`、maintenance 读取和安全命令格式化 |

## Invariants

- Git 私有控制路径禁止 Symlink。
- Runtime Mutation 和 Lifecycle Apply 共用一个 PID lock 与 maintenance 检测。
- Shared 不依赖 Runtime、Distribution 或 CLI Adapter。
