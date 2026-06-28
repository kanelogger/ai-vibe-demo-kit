---
description: 后端开发规则（Fastify + TypeScript + MySQL）
globs: backend/**/*
alwaysApply: true
---

# 后端开发规则

## 职责边界

- 工作范围限制在 `backend/` 内，**不得修改前端代码**。
- 读取 `../SPECS/API.md` 中的共享 API 契约作为接口事实源。
- `backend/SPECS/API.md` **只能引用** `../../SPECS/API.md`，不得独立定义 API。
- 根目录阶段进入 `implementation-ready` 前，**不得实现功能代码**。

## 技术栈约束

- 框架：Fastify 5，所有路由通过 Fastify 插件注册。
- 语言：TypeScript，所有源文件使用 `.ts` 扩展名。
- 数据库：MySQL，使用 `mysql2` 驱动，连接配置在 `src/db/mysql.ts`。
- 认证：JWT（jsonwebtoken），工具函数在 `src/utils/jwt.ts`。
- 日志：Winston，配置在 `src/loaders/logger.ts`。

## 项目结构

```text
src/
├── routes/          # 路由注册（按业务模块分文件）
├── services/        # 业务逻辑（数据库查询、业务处理）
├── db/              # 数据库连接
├── config/          # 配置常量（通过 dotenv 注入）
├── loaders/         # 启动加载器
├── utils/           # 工具函数
├── app.ts           # Fastify 实例
└── server.ts        # 入口
```

## 路由开发

- 路由通过 `app.register()` 注册，按业务模块划分插件文件。
- 路由 handler 的类型定义必须显式声明 Fastify 的 `RouteHandlerMethod`。
- 所有非公开接口必须使用 JWT 中间件验证。
- 请求参数校验使用 Fastify 的 schema 验证或手动校验。

## 服务层

- 数据库查询逻辑放在 `src/services/`，禁止直接在 route handler 中写 SQL。
- service 函数签名必须显式声明参数和返回类型。
- 错误通过抛出或返回统一错误格式处理，不使用 Fastify 的 `reply.status().send()` 分散错误处理。

## 数据库

- 数据库连接配置通过环境变量注入（`.env` → `src/config/index.ts` → `src/db/mysql.ts`）。
- SQL 查询使用参数化查询，**禁止拼接 SQL 字符串**。
- 连接池配置在 `src/db/mysql.ts` 中统一管理。

## 环境变量

- 敏感配置（数据库密码、JWT secret）必须通过 `.env` 注入，使用 `dotenv` 加载。
- 配置读取集中在 `src/config/index.ts`，禁止在其他文件中直接访问 `process.env`。
- `.env` 文件不入库，仅在开发环境使用。

## API 契约

- 后端响应 JSON 字段名必须与根目录 `SPECS/API.md` 中记录的前端 VO 字段一致。
- 新增端点必须在 `SPECS/API.md` 中记录请求参数和响应字段。

## 禁止事项

- 禁止在 route handler 中直接写 SQL。
- 禁止拼接 SQL 字符串（SQL 注入风险）。
- 禁止在 `src/config/index.ts` 以外直接访问 `process.env`。
- 禁止使用 Express/Koa 等其他 HTTP 框架。
- 禁止不经验证信任客户端输入的参数。
