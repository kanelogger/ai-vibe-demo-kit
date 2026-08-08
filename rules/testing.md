# Testing Rules

## Required Checks

| Change type | Required verification |
| --- | --- |
| 核心逻辑或状态转换 | `node --test scripts/harness/test/control.test.mjs scripts/harness/test/store.test.mjs` |
| 模块与真实依赖协作 | `node --test scripts/harness/test/cli.test.mjs scripts/harness/test/installer.test.mjs` |
| 共享接口或 Schema | `node --test scripts/harness/test/validator.test.mjs`、`./harness check --json` |
| 关键用户路径 | `node --test scripts/harness/test/*.test.mjs` |
| UI 与体验 | 当前 Harness 无 UI；新增 UI 时必须补充真实浏览器路径和截图证据。 |

## Reporting

- 记录实际运行的命令、结果和关键输出。
- `skipped` 必须说明原因和风险。
- 测试产生的数据、账户、文件和进程必须清理。
- 测试存在不等于功能可用；关键路径必须真实运行。
