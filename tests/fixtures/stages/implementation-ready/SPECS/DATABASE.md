# 数据库契约（唯一来源）

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| 既有代码 | src/index.js | 表结构 | required |

## 引擎与连接

- 引擎 / 版本: SQLite 3
- Schema 定义位置: db/schema.sql
- 迁移约定: db/migrations/ 顺序执行，禁止回改已发布迁移

## 表结构

| 表 | 字段 | 约束 | 用途 |
| --- | --- | --- | --- |
| items | id INTEGER, name TEXT | PK, NOT NULL | 示例条目 |

## 测试数据

- 种子数据位置: db/seed.sql
- 测试数据清理: 见 `.harness/config.json` 的 `recovery.testDataCleanup`

## 变更记录

| 日期 | 变更 | 来源 |
| --- | --- | --- |
| 2026-07-31 | 初始契约 | 既有代码 |
