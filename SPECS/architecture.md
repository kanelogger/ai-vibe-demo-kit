# 项目架构

接入 Harness 后，用仓库证据填写本文件。未知信息写"待确认"，不要猜测。机器可执行命令登记在 `.harness/config.json`，本文件只解释命令的适用条件，不复制命令全文。

## 项目身份

- Product / service: TODO
- Primary users: TODO
- Primary outcome: TODO

## Runtime And Tooling

| 领域 | 技术 / 版本 | 证据 |
| --- | --- | --- |
| 运行时 | TODO | TODO |
| 包管理 / 构建工具 | TODO | TODO |
| 应用框架 | TODO | TODO |
| 数据 / 外部系统 | TODO | TODO |

## 模块映射

| 职责 | 位置 | 所需上下文 |
| --- | --- | --- |
| TODO | TODO | TODO |

## 持久契约

| 契约 | 位置 | 消费者 |
| --- | --- | --- |
| TODO | TODO | TODO |

## 验证命令

机器命令的唯一登记处是 `.harness/config.json`。在此说明各命令的适用条件和预期证据：

| 用途 | 配置项 | 使用时机 | 预期证据 |
| --- | --- | --- | --- |
| TODO | TODO | TODO | TODO |

## 风险与恢复

- 敏感资产：TODO
- 破坏性操作：TODO
- 回退 / 恢复路径：TODO
- 测试数据清理：TODO
