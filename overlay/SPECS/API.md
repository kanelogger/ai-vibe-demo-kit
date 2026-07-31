# API 契约（唯一来源）

本文件是前后端（或客户端/服务端）共享的**唯一 API 契约来源**。任何实现侧不复制本文件内容，只引用本文件路径；字段一致性由 `.harness/config.json` 的 `commands.contracts` 登记的机器校验兜底，不靠人工比对。

项目没有对外 API 时删除本文件，并在 `commands.contracts` 写明显式说明（例如“无对外契约：纯 CLI 项目”）。

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| {{ 来源类型，如用户原话 / 既有代码 / 第三方文档 }} | {{ 位置或引用 }} | {{ 用途 }} | required |

## 基本信息

- Base URL: {{ 例如 /api/v1 }}
- 认证方式: {{ 例如 Bearer Token / Cookie Session }}
- 错误模型: {{ 统一错误响应结构 }}

## Endpoints

| Method | Path | 请求字段 | 响应字段 | 消费者 |
| --- | --- | --- | --- | --- |
| {{ GET }} | {{ /resource }} | {{ query/body 字段与类型 }} | {{ 字段与类型 }} | {{ frontend src/api/<domain>.ts }} |

## 变更记录

| 日期 | 变更 | 来源 |
| --- | --- | --- |
| {{ YYYY-MM-DD }} | {{ 字段增删改 }} | {{ workflow/ 或 memory/ 引用 }} |
