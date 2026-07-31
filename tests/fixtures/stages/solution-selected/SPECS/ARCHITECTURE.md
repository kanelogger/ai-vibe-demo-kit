# Project Architecture

接入 Harness 后，先用仓库证据填写本文件。未知信息写“待确认”，不要猜测。机器可执行命令登记在 `.harness/config.json`，本文件只解释命令的适用条件，不复制命令全文。

## Project Identity

- Product / service: Fixture project for harness checker tests
- Primary users: Harness maintainers
- Primary outcome: Deterministic harness check results

## Runtime And Tooling

| Area | Technology / Version | Evidence |
| --- | --- | --- |
| Runtime | Node.js 24 | package.json engines |
| Package / build tool | npm | package.json |
| Application framework | 无（纯 Node CLI） | src/index.js |
| Data / external systems | 无 | 无外部依赖 |

## Module Map

| Responsibility | Location | Required Context |
| --- | --- | --- |
|  |  |  |

## Durable Contracts

| Contract | Location | Consumers |
| --- | --- | --- |
|  |  |  |

## Verification Commands

机器命令的唯一登记处是 `.harness/config.json`（`commands.quick` 与 `commands.full`）。在此说明各命令的适用条件和预期证据：

| Purpose | Config Entry | When To Use | Expected Evidence |
| --- | --- | --- | --- |
| Static checks | `commands.*.static` |  |  |
| Tests | `commands.*.test` |  |  |
| Critical user path | `criticalUserPaths[]` |  |  |

## Risk And Recovery

- Sensitive assets:
- Destructive operations:
- Rollback / recovery path:（机器入口见 `.harness/config.json` 的 `recovery`）
- Test-data cleanup:（机器入口见 `.harness/config.json` 的 `recovery.testDataCleanup`）
