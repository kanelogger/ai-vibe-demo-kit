# 数据库契约（唯一来源）

本文件是数据库结构的**唯一契约来源**。迁移脚本、ORM 模型和测试夹具以本文件为准；一致性由 `.harness/config.json` 的 `commands.contracts` 登记的机器校验兜底。

项目没有数据库时删除本文件，并在 `commands.contracts` 写明显式说明（例如“无数据库：纯内存实现”）。

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| {{ 来源类型 }} | {{ 位置或引用 }} | {{ 用途 }} | required |

## 引擎与连接

- 引擎 / 版本: {{ 例如 SQLite 3 / PostgreSQL 16 }}
- Schema 定义位置: {{ 例如 backend/db/schema.sql }}
- 迁移约定: {{ 例如 db/migrations/ 顺序执行，禁止回改已发布迁移 }}

## 表结构

| 表 | 字段 | 约束 | 用途 |
| --- | --- | --- | --- |
| {{ table_name }} | {{ 字段与类型 }} | {{ PK / FK / UNIQUE / NOT NULL }} | {{ 业务用途 }} |

## 测试数据

- 种子数据位置: {{ 例如 db/seed.sql }}
- 测试数据清理: 见 `.harness/config.json` 的 `recovery.testDataCleanup`

## 变更记录

| 日期 | 变更 | 来源 |
| --- | --- | --- |
| {{ YYYY-MM-DD }} | {{ 表/字段变更 }} | {{ workflow/ 或 memory/ 引用 }} |
