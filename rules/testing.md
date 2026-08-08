# Testing Rules

## Required Checks

| Change type | Required verification |
| --- | --- |
| 核心逻辑或状态转换 | `<unit test command>` |
| 模块与真实依赖协作 | `<integration test command>` |
| 共享接口或 Schema | `<contract test command>` |
| 关键用户路径 | `<E2E or manual path>` |
| UI 与体验 | `<browser path and screenshot evidence>` |

## Reporting

- 记录实际运行的命令、结果和关键输出。
- `skipped` 必须说明原因和风险。
- 测试产生的数据、账户、文件和进程必须清理。
- 测试存在不等于功能可用；关键路径必须真实运行。
