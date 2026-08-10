# Harness Library Architecture

## Responsibility

实现 CLI Adapter 后面的确定性控制与校验 Module。

## Module Index

| Module | Interface | Responsibility |
| --- | --- | --- |
| ControlKernel | `applyControl`、`inspectState` | 纯状态转换、Gate 和人工控制 |
| Validator | `validateEnvironmentManifest`、`validateWorkflow`、`validateStageResult`、`validateStateAgainstWorkflow` | 环境 Manifest、Workflow、Stage Result、Evidence contract 和状态绑定校验 |
| RepositoryGuard | `repositoryPaths`、`withRepositoryMutation`、`readCanonicalMaintenance` | Git 根、共享锁和 canonical maintenance 不变量 |
| FileStore | `loadState`、`mutateState` | Revision、原子持久化和历史归档 |
| Lifecycle | `runDistributionCommand`、`loadDistributionManifest` | Distribution Manifest、账本、计划、事务、恢复和 Doctor |
| PathSafety | `isInside`、`resolveInside`、`firstSymlinkInPath` | 仓库路径约束和 Symlink 检测 |
| Manifest | `loadHarnessManifest` | 发行身份和最低 Node.js 版本 |
| Errors | `HarnessError`、`fail` | 稳定错误结构和退出码 |

## Invariants

- ControlKernel 不读取文件、环境或当前时间；调用者注入非确定输入。
- Validator 和 FileStore 使用 PathSafety 解析所有仓库路径。
- Lifecycle 在 canonical journal 原子发布前不修改目标文件；未登记与第三状态内容不覆盖、不删除。
- Module 之间通过显式导出 Interface 协作，不反向依赖 CLI Adapter。

## Verification

```sh
node --test scripts/harness/test/control.test.mjs scripts/harness/test/store.test.mjs scripts/harness/test/validator.test.mjs scripts/harness/test/lifecycle.test.mjs
```
