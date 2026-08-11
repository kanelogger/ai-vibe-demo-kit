# Implementation Notes

- `src/distribution/lifecycle.mjs`：`sync` 成功路径统一经现有 `envelope()` 输出，canonical target、当前 CLI 包身份和 schema 字段由 Lifecycle facade 负责。
- 委派结果的 `package.installedVersion` 在包装前提升为 plan 的 `installedVersion`，并将委派 `transaction` 显式传入 `envelope()`，避免丢失既有语义。
- `test/distribution/sync.test.mjs`：为 `not-installed`、`invalid-ledger`、`newer` 增加完整 Envelope 字段断言，并新增 `equal` 仍委派的显式测试。
- 未修改 registry 查询、SemVer、子进程管理、锁、事务或目标仓库写入逻辑。
