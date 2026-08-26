# Testing Rules

## Required Checks

- 每个改变可观察行为的功能或修复必须在同一 commit 新增或更新自动化测试；`feat`、`fix` 由 `source/tools/check-change-tests.mjs` 强制检查。
- implementation Stage 必须提交 `test-impact/v1`。`behavioral` 记录源码、测试和实际通过的检查；`non-behavioral` 明确记录无需修改测试的原因。

| Change type | Required verification |
| --- | --- |
| 核心逻辑或状态转换 | `node --test test/runtime/control.test.mjs test/runtime/store.test.mjs` |
| 模块与真实依赖协作 | `node --test test/runtime/cli.test.mjs test/distribution/lifecycle.test.mjs` |
| 共享接口或 Schema | `node --test test/runtime/validator.test.mjs`、`./harness check --json` |
| 关键用户路径 | `node --test test/runtime/*.test.mjs test/distribution/*.test.mjs` |
| UI 与体验 | 当前 Harness 无 UI；新增 UI 时必须补充真实浏览器路径和截图证据。 |

## 性能与结构审查

- 功能验收通过后，对已稳定或历史复杂的模块可先做性能/结构审查，再进入下一需求；
  前提是已有可运行版本和真实数据作参照，不得在静态设计稿上判断。
- 边界明确但历史复杂的模块：先新增并行实现，对比新旧结果，验证通过后替换旧路径；
  替换完成必须删除旧路径，两套实现不得永久共存（见 git.md）。
- 审查结论与替换验证记录进 verification-report 或独立 review 记录，供下一需求决策。

## Reporting

- 记录实际运行的命令、结果和关键输出。
- `skipped` 必须说明原因和风险。
- 测试产生的数据、账户、文件和进程必须清理。
- 测试存在不等于功能可用；关键路径必须真实运行。
- Acceptance 报告使用 `verification-report/v1`；Stage Result 条件状态必须与报告一致。
- `passed` 检查记录实际命令、退出码和 Evidence；`skipped`、`failed` 与残留资源记录原因并形成 Policy Failure。
