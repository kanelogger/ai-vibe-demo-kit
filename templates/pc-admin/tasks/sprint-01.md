# Sprint 01: Auth And Menu Foundation

## Goal

建立方案 C 的第一条可运行主干：真实 MySQL 数据、后端基础设施、登录认证、当前用户、动态菜单、前端 Token/Pinia/Router 接入。

Sprint 01 不批量实现 13 个模块页面，只证明完整后台模板的基础链路成立。

## Task 1: 数据库 schema 和 seed

Acceptance:

- [ ] `admin_template` 空库可初始化。
- [ ] 核心表覆盖组织、用户、角色、菜单、字典、配置、附件、消息、日志。
- [ ] seed 包含 SUPER_ADMIN、OPERATOR、COMMON_USER、默认菜单、默认配置和演示账号。

Verify:

- [ ] `docker compose up -d mysql`
- [ ] 执行 schema/seed 后查询默认账号、角色、菜单。

Files:

- `backend/db/schema.sql`
- `backend/db/seed.sql`
- `backend/.env.example`

## Task 2: 后端基础设施和统一合同

Acceptance:

- [ ] Fastify app 注册 CORS、路由和全局错误处理。
- [ ] MySQL pool 支持 query 和 transaction。
- [ ] 成功响应统一 `{ success: true, data }`。
- [ ] 失败响应统一 `{ success: false, error }`。
- [ ] Winston logger 不记录密码和 Token。

Verify:

- [ ] `pnpm --filter fullstack-admin-backend typecheck`
- [ ] `pnpm --filter fullstack-admin-backend build`

Files:

- `backend/src/app.ts`
- `backend/src/db/mysql.ts`
- `backend/src/loaders/logger.ts`
- `backend/src/utils/errors.ts`
- `backend/src/utils/pagination.ts`

## Task 3: 认证与当前用户 API

Acceptance:

- [ ] `POST /login` 支持启用用户登录。
- [ ] 停用用户返回 `USER_DISABLED`。
- [ ] 密码错误返回 `INVALID_CREDENTIALS`。
- [ ] 登录成功返回 accessToken、refreshToken、expires、roles、permissions。
- [ ] `GET /auth/me` 返回 user、roles、menus、permissions。
- [ ] 登录成功和失败写入 `login_logs`。

Verify:

- [ ] `pnpm --filter fullstack-admin-backend typecheck`
- [ ] 手工调用 `POST /login`
- [ ] 手工调用 `GET /auth/me`

Files:

- `backend/src/routes/auth.ts`
- `backend/src/services/auth.ts`
- `backend/src/services/menus.ts`
- `backend/src/utils/jwt.ts`
- `backend/src/utils/password.ts`

## Task 4: 动态菜单 API 和权限计算

Acceptance:

- [ ] `GET /get-async-routes` 返回 `MenuRoute[]`。
- [ ] SUPER_ADMIN 返回全部启用菜单。
- [ ] 普通用户只返回角色授权菜单。
- [ ] 停用角色和停用菜单不参与计算。

Verify:

- [ ] 两个账号调用 `/get-async-routes` 菜单不同。
- [ ] `pnpm --filter fullstack-admin-backend typecheck`

Files:

- `backend/src/routes/async-routes.ts`
- `backend/src/services/menus.ts`
- `backend/src/utils/tree.ts`

## Task 5: 前端登录、Token 和动态路由

Acceptance:

- [ ] 登录页使用真实 `POST /login`。
- [ ] Axios 自动注入 `Authorization: Bearer <accessToken>`。
- [ ] Token 过期尝试刷新，刷新失败回登录页。
- [ ] 登录后按后端菜单注册路由和侧边栏。
- [ ] 超级管理员和普通用户菜单不同。

Verify:

- [ ] `pnpm --filter fullstack-admin-frontend typecheck`
- [ ] 超级管理员登录后看到完整菜单。
- [ ] 普通用户登录后菜单受限。

Files:

- `frontend/src/api/user.ts`
- `frontend/src/api/routes.ts`
- `frontend/src/store/modules/user.ts`
- `frontend/src/store/modules/permission.ts`
- `frontend/src/router/index.ts`

## Checkpoint

Sprint 01 完成后必须验证：

- [ ] `pnpm --filter fullstack-admin-backend typecheck`
- [ ] `pnpm --filter fullstack-admin-frontend typecheck`
- [ ] 默认超级管理员账号可登录。
- [ ] 默认普通用户账号可登录。
- [ ] `/auth/me` 返回当前用户、角色、菜单。
- [ ] `/get-async-routes` 对不同账号返回不同菜单。
- [ ] 前端动态路由基于真实后端菜单生成。

通过该 checkpoint 后，才能进入用户、角色、菜单三大核心 CRUD 任务。
