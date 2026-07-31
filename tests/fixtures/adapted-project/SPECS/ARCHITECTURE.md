# Project Architecture

接入 Harness 后，先用仓库证据填写本文件。未知信息写“待确认”，不要猜测。机器可执行命令登记在 `.harness/config.json`，本文件只解释命令的适用条件，不复制命令全文。

## Project Identity

- Product / service: Greeting CLI demo (existing-project)
- Primary users: Harness maintainers
- Primary outcome: greet(name) returns "hello <name>" via CLI

## Runtime And Tooling

| Area | Technology / Version | Evidence |
| --- | --- | --- |
| Runtime | Node.js 20+ | package.json, AGENTS.md 原有约束 |
| Package / build tool | npm | package.json |
| Application framework | 无（纯 Node CLI） | src/index.js |
| Data / external systems | 无 | 无外部依赖 |

## Module Map

| Responsibility | Location | Required Context |
| --- | --- | --- |
| CLI 入口 | src/index.js | src/util.js |
| 问候逻辑 | src/util.js | tests/greet.test.js |

## Durable Contracts

| Contract | Location | Consumers |
| --- | --- | --- |
| greet(name): string | src/util.js | src/index.js, tests/greet.test.js |

## Verification Commands

机器命令的唯一登记处是 `.harness/config.json`（`commands.quick` 与 `commands.full`）。在此说明各命令的适用条件和预期证据：

| Purpose | Config Entry | When To Use | Expected Evidence |
| --- | --- | --- | --- |
| Static checks | `commands.*.static` | 每次改动后 | node --check 无输出即通过 |
| Tests | `commands.*.test` | 每次改动后 | node --test 全绿 |
| Critical user path | `criticalUserPaths[]` | 非 UI 项目，未登记 | 手动运行 node src/index.js 观察输出 |

## Risk And Recovery

- Sensitive assets: 无
- Destructive operations: 无
- Rollback / recovery path: git revert <commit>（机器入口见 `.harness/config.json` 的 `recovery`）
- Test-data cleanup: 无需清理：测试不产生外部数据（机器入口见 `.harness/config.json` 的 `recovery.testDataCleanup`）
