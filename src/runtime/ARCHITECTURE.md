# Runtime Architecture

## Responsibility

通过单一 command Interface 从 `source/workflows/` 加载默认 Workflow、校验项目架构索引、投影状态、计算 Next Actions、处理幂等 Signal、漂移、完成资格和领域错误。

## Interface

```js
runRuntimeCommand({ runtimeRoot, cwd, command })
  -> Promise<{ exitCode, payload }>
```

Interface 不读取 argv、不写 stdout/stderr、不设置进程退出码。`cli.mjs` 是薄 Adapter。

## Entry Points

| Module | Responsibility |
| --- | --- |
| `runtime.mjs` | command orchestration 与错误归一化 |
| `cli.mjs` | 参数校验、JSON/文本格式和退出码转交 |
| `kernel.mjs` | 纯 Control 状态转换、Gate 和人工决策 |
| `policy.mjs` | Workflow v2/v3 outcome-aware Exit Condition Policy |
| `store.mjs` | Revision、原子持久化与归档 |
| `readiness.mjs` | Manifest 能力和 contract readiness |

## Modules

| Directory | Responsibility |
| --- | --- |
| `validation/` | Validator facade、Workflow、Stage Result、环境、架构和 Control State contract |

## Invariants

- 调用方与测试只导入 `validation/index.mjs`，不导入 Validator 内部文件。
- ControlKernel 不读取文件、环境或当前时间。
- Kernel 与无状态 Stage Result 检查共享同一个 outcome-aware Policy 计算。
- Runtime Mutation 始终经 Shared RepositoryGuard。

## Verification

```sh
node --test test/runtime/*.test.mjs
```
