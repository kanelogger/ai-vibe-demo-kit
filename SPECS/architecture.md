# 项目架构

接入 Harness 后，先用仓库证据填写本文件。未知信息写“待确认”，不要猜测。机器可执行命令登记在 `.harness/config.json`，本文件只解释命令的适用条件，不复制命令全文。

## 项目身份

- Product / service:
- Primary users:
- Primary outcome:

## Runtime And Tooling

| 领域 | 技术 / 版本 | 证据 |
| --- | --- | --- |
| 运行时 |  |  |
| 包管理 / 构建工具 |  |  |
| 应用框架 |  |  |
| 数据 / 外部系统 |  |  |

## 模块映射

| 职责 | 位置 | 所需上下文 |
| --- | --- | --- |
|  |  |  |

## 持久契约

| 契约 | 位置 | 消费者 |
| --- | --- | --- |
|  |  |  |

## 验证命令

机器命令的唯一登记处是 `.harness/config.json`（`commands.quick` 与 `commands.full`）。在此说明各命令的适用条件和预期证据：

| 用途 | 配置项 | 使用时机 | 预期证据 |
| --- | --- | --- | --- |
| 静态检查 | `commands.*.static` |  |  |
| 测试 | `commands.*.test` |  |  |
| 关键用户路径 | `criticalUserPaths[]` |  |  |

## 风险与恢复

- 敏感资产：
- 破坏性操作：
- 回退 / 恢复路径：（机器入口见 `.harness/config.json` 的 `recovery`）
- 测试数据清理：（机器入口见 `.harness/config.json` 的 `recovery.testDataCleanup`）
