# Distribution Architecture

## Responsibility

从 `source/manifest.json` 规划并执行 Runtime 与完整 Source 的 init、upgrade、sync、uninstall、recover 与 Doctor；所有 Apply 使用可恢复 canonical transaction。

## Public Interface

- `runDistributionCommand`
- `loadDistributionManifest`
- `exitCodeForStatus`

## Internal Modules

| Module | Responsibility |
| --- | --- |
| `lifecycle.mjs` | public facade、Manifest loading 与 Lifecycle orchestration |
| `planning.mjs` | ledger、文件 Ownership 和 init/upgrade/uninstall plan |
| `sync.mjs` | npm latest 解析、SemVer precedence、固定版本 upgrade 委派与协议校验 |
| `skills-sync.mjs` | `skills status/sync/update`：lock-first 物化、两阶段 staging/guard 提交与 Active 限制 |
| `ownership.mjs` | managed facts、关系分类与 created-directory planning |
| `transaction.mjs` | canonical transaction、resume/rollback、recovery binding 与 cleanup |
| `doctor.mjs` | layout、Runtime contract 与 governance readiness |

## Invariants

- 新路径写入、旧路径删除和账本提交属于同一 canonical transaction。
- 修改、Symlink 或第三状态 managed 文件使整个 plan conflict 且零写入。
- 非空旧 installer-created 目录保留，并从新账本放弃所有权。
- Doctor 不读取或搜索 Runtime JavaScript 内容。
- Sync 父进程不持有 RepositoryGuard 锁且不写目标仓库；所有 Apply 由固定版本的 upgrade Lifecycle 执行。
- `source/` 中除 Manifest 外的资产原样投影到目标 `source/`，不在 Lifecycle 中维护第二份文件表。
- Skills 网络获取与临时 staging 在 RepositoryGuard 外完成；lock-first 提交中断只产生可由普通 `skills sync` 修复的 drift。
- `skills update` 在 Active Work Item 期间拒绝；restore-only `skills sync` 仅在 lock digest 等于 Active binding 时允许。
- Skills Module 永不删除或覆盖未登记目录，也永不管理打包 Skill；物化目录恒为根级 `.agents/skills/`。

## Verification

```sh
node --test test/distribution/lifecycle.test.mjs test/distribution/distribution-cli.test.mjs test/distribution/package.test.mjs
```
