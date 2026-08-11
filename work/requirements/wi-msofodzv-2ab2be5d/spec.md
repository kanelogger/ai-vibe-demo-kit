# Sync Envelope 契约修复

## Intent

修复 `sync` 在 `not-installed`、`invalid-ledger`、`newer` 三个非委派分支返回不完整 JSON Envelope 的缺陷，并补齐相等版本委派的显式覆盖。

## Acceptance Criteria

1. 三个非委派分支均返回 `schemaVersion: 1`、`command: "sync"`、canonical `target`、当前执行包信息和 `transaction: null`。
2. 文本输出可读取 `payload.command`，不再输出 `undefined: <status>`。
3. `package.installedVersion` 保持委派前账本版本；未安装时为 `null`。
4. 已安装版本等于 npm latest 时仍委派固定版本执行只读 `upgrade`。
5. 聚焦测试及完整 Runtime/Distribution 测试通过。

## Implementation Shape

- 在 `lifecycle.mjs` 的 `sync` 分支统一将 `runSync()` 结果送入现有 `envelope()`；保留委派结果的状态、变更、事务、警告、错误和退出码语义。
- 在 `test/distribution/sync.test.mjs` 增加完整 Envelope 字段断言与 equal relation 测试。
- 不修改 registry、SemVer、进程管理或仓库写入逻辑。

## Risk And Rollback

- 风险：二次包装可能覆盖委派 Envelope 中的字段或丢失 `update`。通过现有 delegated 测试及新增完整字段断言验证。
- 回滚：撤销 lifecycle 的单点包装和对应测试即可；不涉及数据迁移、发布或目标仓库写入。

## Environment Alignment

- Darwin / arm64：匹配 `project.yml`。
- Node v24.18.0：满足最低 22，且属于已测试版本。
- Git 2.55.0：可用。
- npm 11.16.0：与声明一致。
- Docker 29.4.0：可用，且为可选探测。
- `./harness check --json`：revision 68 时 valid=true、零错误与警告。
