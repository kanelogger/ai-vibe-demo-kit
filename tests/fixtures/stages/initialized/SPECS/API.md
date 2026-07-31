# API 契约（唯一来源）

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| 既有代码 | src/index.js | Endpoint 清单 | required |

## 基本信息

- Base URL: /api/v1
- 认证方式: Bearer Token
- 错误模型: { error: { code, message } }

## Endpoints

| Method | Path | 请求字段 | 响应字段 | 消费者 |
| --- | --- | --- | --- | --- |
| GET | /items | query: page:number | items: Item[] | src/api/items.ts |

## 变更记录

| 日期 | 变更 | 来源 |
| --- | --- | --- |
| 2026-07-31 | 初始契约 | 既有代码 |
