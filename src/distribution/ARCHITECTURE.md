# Distribution Architecture

## Responsibility

从 `source/manifest.json` 规划并执行 Runtime 与完整 Source 的 init、upgrade、uninstall、recover 与 Doctor；所有 Apply 使用可恢复 canonical transaction。

## Public Interface

- `runDistributionCommand`
- `loadDistributionManifest`
- `exitCodeForStatus`

## Internal Modules

| Module | Responsibility |
| --- | --- |
| `lifecycle.mjs` | public facade、Manifest loading 与 Lifecycle orchestration |
| `planning.mjs` | ledger、文件 Ownership 和 init/upgrade/uninstall plan |
| `ownership.mjs` | managed facts、关系分类与 created-directory planning |
| `transaction.mjs` | canonical transaction、resume/rollback、recovery binding 与 cleanup |
| `doctor.mjs` | layout、Runtime contract 与 governance readiness |

## Invariants

- 新路径写入、旧路径删除和账本提交属于同一 canonical transaction。
- 修改、Symlink 或第三状态 managed 文件使整个 plan conflict 且零写入。
- 非空旧 installer-created 目录保留，并从新账本放弃所有权。
- Doctor 不读取或搜索 Runtime JavaScript 内容。
- `source/` 中除 Manifest 外的资产原样投影到目标 `source/`，不在 Lifecycle 中维护第二份文件表。

## Verification

```sh
node --test test/distribution/lifecycle.test.mjs test/distribution/distribution-cli.test.mjs test/distribution/package.test.mjs
```
