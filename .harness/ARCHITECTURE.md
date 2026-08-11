# Installed Harness Architecture

## Responsibility

保存目标仓库内由 Distribution Manifest 管理的 Runtime、Shared 支撑文件、发行身份、安装账本和说明。

## Layout

| Path | Responsibility |
| --- | --- |
| `runtime/` | CLI Adapter、command Interface、Control、Validator、Store、Readiness |
| `shared/` | Errors、PathSafety、Manifest、RepositoryGuard |
| `manifest.json` | schema v2 Runtime command 与 contract 能力声明 |
| `install-lock.json` | 安装 Ownership 与 observed facts；由 Lifecycle 创建 |

根目录 `../harness` 只加载 `runtime/cli.mjs`。目标仓库不安装 Distribution 生产源码；升级、Doctor、恢复和卸载由 npm Distribution CLI 提供。

## Invariants

- 该目录中的 managed 文件只能由 canonical Lifecycle transaction 更新。
- Runtime 与 Lifecycle 共用 Git 私有 RepositoryGuard 锁。
- Doctor 基于 Manifest 能力、managed facts、Workflow 和 contract 判断 readiness，不读取 Runtime JavaScript 内容。
