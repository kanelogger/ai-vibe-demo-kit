---
title: "Sprint 01: Auth And Menu Foundation - 可执行技术文档"
status: ready
solution: C
---

# Sprint 01: Auth And Menu Foundation

## 目标

建立方案 C 的第一条可运行主干：MySQL 真实数据、Fastify 后端基础设施、JWT 登录认证、当前用户 API、动态菜单 API、前端 Token/Pinia/Router 接入。

Sprint 01 只验证后台模板的基础链路，不实现用户、角色、菜单等 CRUD 页面。通过本 Sprint 后，系统必须能完成：

1. 默认账号登录。
2. Access Token 注入请求头。
3. Refresh Token 刷新 Access Token。
4. `GET /auth/me` 返回当前用户、角色、菜单、权限。
5. `GET /get-async-routes` 按用户角色返回不同菜单树。
6. 前端使用后端菜单注册动态路由并渲染侧边栏。

## 范围

| 类别 | Sprint 01 包含 | Sprint 01 不包含 |
| --- | --- | --- |
| 数据库 | schema、seed、默认账号、默认角色、默认菜单、登录日志 | 复杂迁移系统、生产级密码策略 |
| 后端 | Fastify app、CORS、错误处理、MySQL pool、JWT、认证 API、菜单 API | 业务模块 CRUD、按钮权限完整模型 |
| 前端 | 登录、Token 保存/刷新、动态路由拉取、菜单渲染 | 完整业务页面实现、权限按钮细粒度控制 |
| 验证 | typecheck、curl、前端手工登录 | 自动化 E2E 测试套件 |

## 执行顺序

必须按以下顺序执行。每个 Task 完成后先执行本 Task 的 Verify，再进入下一个 Task。

```text
Task 0 环境和运行基线
  -> Task 1 数据库 schema 和 seed 校准
  -> Task 2 后端基础设施校准
  -> Task 3 认证和当前用户 API
  -> Task 4 动态菜单 API
  -> Task 5 前端登录、Token 和动态路由
  -> Checkpoint 端到端验收
```

## 全局约定

| 项 | 约定 |
| --- | --- |
| 工作目录 | 所有命令默认从 `templates/pc-admin` 执行 |
| API 契约 | 以 `SPECS/API.md` 为唯一事实源 |
| 数据库契约 | 以 `SPECS/DATABASE.md` 和 `backend/db/schema.sql` 为准 |
| 用户登录字段 | 数据库使用 `login_name`，接口字段使用 `username` |
| 用户展示字段 | 数据库使用 `display_name/avatar_url`，接口字段使用 `nickname/avatar` |
| 密码方案 | Sprint 01 沿用当前 seed 的 MD5：默认密码 `123456`，仅用于模板开发演示 |
| 后端端口 | `3000` |
| 前端端口 | `8848` |
| 前端代理 | `/api` -> `http://localhost:3000`，代理后去掉 `/api` 前缀 |

## 默认账号

| 登录名 | 密码 | 角色 | 预期菜单 |
| --- | --- | --- | --- |
| `superadmin` | `123456` | `SUPER_ADMIN` | 全部启用菜单 |
| `operator` | `123456` | `OPERATOR` | 首页、运营管理、个人中心 |
| `common` | `123456` | `COMMON_USER` | 首页、个人中心 |

---

## Task 0: 环境和运行基线

### 目标

确保 Monorepo、依赖、环境变量、MySQL 启动方式具备可执行基础。

### 实施动作

| 步骤 | 动作 | 文件/命令 |
| --- | --- | --- |
| 0.1 | 确认 Node 和 pnpm 版本 | `node -v`、`pnpm -v` |
| 0.2 | 安装依赖 | `pnpm install` |
| 0.3 | 复制后端环境变量 | `cp backend/.env.example backend/.env` |
| 0.4 | 复制前端环境变量 | `cp frontend/.env.development.example frontend/.env.development` |
| 0.5 | 检查是否存在 MySQL 启动文件 | `test -f docker-compose.yml` |
| 0.6 | 如果 `docker-compose.yml` 不存在，补齐 MySQL 服务 | 新建 `docker-compose.yml` |

### `docker-compose.yml` 要求

如果项目根目录没有 `docker-compose.yml`，必须补齐：

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: pc-admin-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: "123456789"
      MYSQL_DATABASE: "admin_template"
      TZ: "Asia/Shanghai"
    ports:
      - "3306:3306"
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "-p123456789"]
      interval: 5s
      timeout: 3s
      retries: 20
    volumes:
      - pc_admin_mysql_data:/var/lib/mysql

volumes:
  pc_admin_mysql_data:
```

如果开发机已有可用 MySQL，可以不使用 Docker，但 `backend/.env` 必须指向可用的 `admin_template` 数据库。

### Verify

```bash
node -v
pnpm -v
pnpm install
docker compose up -d mysql
docker compose ps
```

验收标准：

- [ ] Node 满足 `^20.19.0 || >=22.13.0`。
- [ ] pnpm 满足 `>=9`。
- [ ] 依赖安装成功。
- [ ] MySQL 可连接，Docker 场景下 `docker compose ps` 显示 `mysql` 为 running 或 healthy。
- [ ] `backend/.env` 存在并包含 `JWT_SECRET`、`MYSQL_DATABASE=admin_template`。
- [ ] `frontend/.env.development` 存在并包含 `VITE_PORT=8848`、`VITE_API_BASE_URL="/api"`。

---

## Task 1: 数据库 schema 和 seed 校准

### 目标

让数据库结构和种子数据与 `SPECS/DATABASE.md`、后端服务层字段名完全一致。

### 当前基线

仓库已存在：

| 文件 | 当前用途 |
| --- | --- |
| `backend/db/schema.sql` | 创建核心业务表、菜单权限表、日志表 |
| `backend/db/seed.sql` | 插入默认部门、岗位、角色、用户、菜单和授权 |
| `backend/src/services/users.ts` | 读取 `users.login_name/display_name/avatar_url` |
| `backend/src/services/auth.ts` | 使用 `login_logs.login_name/login_ip/logged_at` 写登录日志 |
| `backend/src/services/menus.ts` | 读取 `menus.meta_json/component_path/route_path` |

### 实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 1.1 | 核对 `users` 表字段：必须包含 `login_name`、`display_name`、`avatar_url`、`last_login_at` | `backend/db/schema.sql` |
| 1.2 | 核对 `roles` 表字段：必须包含 `role_code`、`is_super_admin`、`status`、`deleted` | `backend/db/schema.sql` |
| 1.3 | 核对 `menus` 表字段：必须包含 `menu_code`、`route_path`、`component_path`、`visible`、`meta_json` | `backend/db/schema.sql` |
| 1.4 | 核对关联表：`user_roles` 和 `role_menus` 必须有 `deleted` 字段 | `backend/db/schema.sql` |
| 1.5 | 核对 `login_logs` 表字段：必须匹配 `services/auth.ts` 的 INSERT | `backend/db/schema.sql` |
| 1.6 | 核对默认账号：`superadmin/operator/common`，密码均为 `123456` 的 MD5 | `backend/db/seed.sql` |
| 1.7 | 核对菜单授权：SUPER_ADMIN 全量，OPERATOR 与 COMMON_USER 有差异 | `backend/db/seed.sql` |

### 执行数据库初始化

```bash
docker compose exec mysql mysql -uroot -p123456789 -e "CREATE DATABASE IF NOT EXISTS admin_template DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
docker compose exec -T mysql mysql -uroot -p123456789 admin_template < backend/db/schema.sql
docker compose exec -T mysql mysql -uroot -p123456789 admin_template < backend/db/seed.sql
```

如果不使用 Docker：

```bash
mysql -h 127.0.0.1 -uroot -p123456789 -e "CREATE DATABASE IF NOT EXISTS admin_template DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -h 127.0.0.1 -uroot -p123456789 admin_template < backend/db/schema.sql
mysql -h 127.0.0.1 -uroot -p123456789 admin_template < backend/db/seed.sql
```

### Verify

```bash
docker compose exec mysql mysql -uroot -p123456789 admin_template -e "SHOW TABLES;"
docker compose exec mysql mysql -uroot -p123456789 admin_template -e "SELECT id, login_name, display_name, status FROM users ORDER BY id;"
docker compose exec mysql mysql -uroot -p123456789 admin_template -e "SELECT id, role_code, is_super_admin, status FROM roles ORDER BY id;"
docker compose exec mysql mysql -uroot -p123456789 admin_template -e "SELECT role_id, COUNT(*) menu_count FROM role_menus WHERE deleted = 0 GROUP BY role_id ORDER BY role_id;"
```

验收标准：

- [ ] 核心表存在：`users`、`roles`、`user_roles`、`menus`、`role_menus`、`login_logs`。
- [ ] 默认用户为 `superadmin`、`operator`、`common`。
- [ ] `SUPER_ADMIN` 的 `is_super_admin=1`。
- [ ] 三个角色的菜单数不同，且 `SUPER_ADMIN` 菜单数最大。
- [ ] seed 可重复执行前必须先执行 schema，避免主键冲突。

---

## Task 2: 后端基础设施校准

### 目标

确认 Fastify、MySQL、统一响应、统一错误、JWT 鉴权 hook 已正确串联，且路由层全部使用这套基础设施。

### 实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 2.1 | 确认配置从 `.env` 读取，缺少必填项时启动失败 | `backend/src/config/index.ts` |
| 2.2 | 确认 MySQL pool 暴露 `pool`、`query`、`withTransaction`、`assertMysqlConnection` | `backend/src/db/mysql.ts` |
| 2.3 | 确认统一成功响应为 `{ success: true, data }` | `backend/src/utils/response.ts` |
| 2.4 | 确认统一失败响应为 `{ success: false, error: { code, message, details? } }` | `backend/src/utils/response.ts` |
| 2.5 | 确认业务错误统一抛 `AppError`，错误码包含 `USER_DISABLED`、`INVALID_CREDENTIALS` | `backend/src/utils/errors.ts` |
| 2.6 | 确认 `requireAuth` 已注册为全局 `onRequest` hook，白名单包含 `/login`、`/refresh-token`、`/captcha` | `backend/src/app.ts`、`backend/src/utils/jwt.ts` |
| 2.7 | 确认 `authRoutes`、`userRoutes`、`asyncRoutes` 在 `buildApp()` 内注册一次 | `backend/src/app.ts` |
| 2.8 | 确认 server 启动前执行 `assertMysqlConnection()` | `backend/src/server.ts` |

### Verify

```bash
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-backend build
pnpm --filter fullstack-admin-backend dev
```

服务启动后，在另一个终端执行：

```bash
curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"not-exists","password":"bad"}'
```

预期响应：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "用户名或密码错误"
  }
}
```

验收标准：

- [ ] 后端 typecheck 通过。
- [ ] 后端 build 通过。
- [ ] 服务启动日志显示 MySQL 连接检查通过。
- [ ] 未知用户登录返回统一错误结构，不返回 HTML、旧桩结构或进程异常。
- [ ] 不带 Token 请求受保护接口返回 `UNAUTHORIZED`。

---

## Task 3: 认证和当前用户 API

### 目标

实现并验收 `POST /login`、`POST /refresh-token`、`POST /logout`、`GET /auth/me`，让认证链路基于真实数据库工作。

### 实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 3.1 | 登录使用 `findUserByLoginName`，不得导入不存在的 `findUserByUsername` | `backend/src/services/auth.ts` |
| 3.2 | 登录验证 `users.status`，停用用户抛 `new AppError("USER_DISABLED", ...)` | `backend/src/services/auth.ts` |
| 3.3 | 登录失败统一返回 `INVALID_CREDENTIALS`，不泄露账号不存在或密码错误 | `backend/src/services/auth.ts` |
| 3.4 | 登录成功和失败都写入 `login_logs`，日志写入失败只记录错误，不阻断主流程 | `backend/src/services/auth.ts` |
| 3.5 | Token 签发必须使用 `signAccessToken`、`signRefreshToken`，不得调用不存在的 `signToken` | `backend/src/services/auth.ts`、`backend/src/utils/jwt.ts` |
| 3.6 | Refresh Token 必须校验 `payload.type === "refresh"` | `backend/src/services/auth.ts` |
| 3.7 | `GET /auth/me` 必须从 `request.user.userId` 获取当前用户，返回 user、roles、menus、permissions | `backend/src/routes/auth.ts` |
| 3.8 | 当前用户不存在时返回 `NOT_FOUND`，未登录时返回 `UNAUTHORIZED` | `backend/src/routes/auth.ts` |

### API 响应合同

`POST /login` 成功响应的 `data` 必须包含：

| 字段 | 类型 | 来源 |
| --- | --- | --- |
| `userId` | number | `users.id` |
| `username` | string | `users.login_name` |
| `nickname` | string | `users.display_name` |
| `avatar` | string/null | `users.avatar_url` |
| `roles` | string[] | `roles.role_code` |
| `permissions` | string[] | Sprint 01 可返回空数组 |
| `accessToken` | string | JWT access token |
| `refreshToken` | string | JWT refresh token |
| `expires` | string | Access Token 过期时间 ISO 字符串 |

`GET /auth/me` 成功响应的 `data` 必须包含：

| 字段 | 类型 |
| --- | --- |
| `user` | `UserProfile` |
| `roles` | `RoleSummary[]` |
| `menus` | `MenuRoute[]` |
| `permissions` | `string[]` |

### Verify

登录并保存 Token：

```bash
curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"123456"}'
```

手动复制返回的 `accessToken` 后验证当前用户：

```bash
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

验证 Refresh Token：

```bash
curl -s -X POST http://localhost:3000/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

验证登录日志：

```bash
docker compose exec mysql mysql -uroot -p123456789 admin_template -e "SELECT login_name, login_result, failure_reason, logged_at FROM login_logs ORDER BY id DESC LIMIT 5;"
```

验收标准：

- [ ] `superadmin/123456` 可登录并返回 `accessToken`、`refreshToken`、`expires`。
- [ ] `operator/123456` 可登录。
- [ ] `common/123456` 可登录。
- [ ] 错误密码返回 `INVALID_CREDENTIALS`。
- [ ] 登录成功和失败均写入 `login_logs`。
- [ ] `/auth/me` 不带 Token 返回 `UNAUTHORIZED`。
- [ ] `/auth/me` 带合法 Token 返回 user、roles、menus、permissions。
- [ ] `/refresh-token` 传 access token 时返回 `UNAUTHORIZED`，传 refresh token 时返回新 token。

---

## Task 4: 动态菜单 API

### 目标

实现并验收基于角色授权的动态菜单树，支持 SUPER_ADMIN 与普通角色差异化返回。

### 实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 4.1 | `buildTree` 使用 `id/parentId` 构建树，孤儿节点作为根节点兜底 | `backend/src/utils/tree.ts` |
| 4.2 | `isSuperAdmin(userId)` 只认可启用、未删除、`is_super_admin=1` 的角色 | `backend/src/services/menus.ts` |
| 4.3 | SUPER_ADMIN 查询全部启用且未删除菜单 | `backend/src/services/menus.ts` |
| 4.4 | 普通用户只查询启用角色授权的启用菜单 | `backend/src/services/menus.ts` |
| 4.5 | `meta_json` 解析失败时返回空对象，不中断接口 | `backend/src/services/menus.ts` |
| 4.6 | 后端菜单字段映射为前端动态路由字段：`name/path/component/meta/children` | `backend/src/services/menus.ts` |
| 4.7 | `GET /get-async-routes` 从 `request.user.userId` 获取用户并返回菜单树 | `backend/src/routes/async-routes.ts` |

### MenuRoute 输出要求

| 字段 | 要求 |
| --- | --- |
| `id` | 菜单 ID |
| `parentId` | 父菜单 ID，根菜单为 `null` |
| `name` | 使用 `menus.menu_code` |
| `path` | 使用 `menus.route_path` |
| `component` | 有 `component_path` 时返回；目录可为空 |
| `meta.title` | 优先 `meta_json.title`，否则 `menus.menu_name` |
| `meta.icon` | 使用 `menus.icon` |
| `meta.sort` | 使用 `menus.sort_order` |
| `meta.showLink` | `menus.visible === 1` |
| `children` | 有子节点时返回 |

### Verify

分别登录三个账号，使用各自 Token 调用：

```bash
curl -s http://localhost:3000/get-async-routes \
  -H "Authorization: Bearer <accessToken>"
```

可用数据库辅助确认角色授权：

```bash
docker compose exec mysql mysql -uroot -p123456789 admin_template -e "
SELECT u.login_name, r.role_code, COUNT(rm.menu_id) menu_count
FROM users u
JOIN user_roles ur ON ur.user_id = u.id AND ur.deleted = 0
JOIN roles r ON r.id = ur.role_id AND r.deleted = 0
LEFT JOIN role_menus rm ON rm.role_id = r.id AND rm.deleted = 0
WHERE u.deleted = 0
GROUP BY u.login_name, r.role_code
ORDER BY u.id;
"
```

验收标准：

- [ ] `superadmin` 返回全部启用菜单树。
- [ ] `operator` 返回菜单数少于 `superadmin`。
- [ ] `common` 返回菜单数少于 `operator` 或菜单范围不同。
- [ ] 停用菜单不返回。
- [ ] 停用角色对应授权不返回。
- [ ] 菜单树按 `sort_order` 排序。
- [ ] 返回结构可被前端 `addAsyncRoutes()` 处理。

---

## Task 5: 前端登录、Token 和动态路由

### 目标

让前端登录页、Axios、Pinia、Router 与后端真实 API 合同对齐。

### 实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 5.1 | 登录 API 类型与 `SPECS/API.md` 的 `POST /login` 响应一致 | `frontend/src/api/user.ts` |
| 5.2 | 动态路由 API 类型与 `GET /get-async-routes` 响应一致 | `frontend/src/api/routes.ts` |
| 5.3 | Axios baseURL 使用 `VITE_API_BASE_URL`，开发环境请求 `/api/*` | `frontend/src/utils/http/index.ts`、`frontend/.env.development` |
| 5.4 | 请求拦截器给非白名单接口注入 `Authorization: Bearer <accessToken>` | `frontend/src/utils/http/index.ts` |
| 5.5 | Token 过期时调用 `/refresh-token`，并重放等待中的请求 | `frontend/src/utils/http/index.ts`、`frontend/src/store/modules/user.ts` |
| 5.6 | `setToken()` 正确保存 `accessToken`、`refreshToken`、`expires`、用户信息、角色、权限 | `frontend/src/utils/auth.ts` |
| 5.7 | 登录成功后必须让 Pinia user store 更新 avatar、username、nickname、roles、permissions | `frontend/src/store/modules/user.ts` |
| 5.8 | 路由守卫在刷新页面且菜单为空时调用 `initRouter()` 拉取后端菜单 | `frontend/src/router/index.ts`、`frontend/src/router/utils.ts` |
| 5.9 | 后端返回的 `component_path` 找不到真实页面时，可临时落到 `views/system/placeholder.vue` | `frontend/src/router/utils.ts` |
| 5.10 | 退出登录清除 Token、用户信息、动态路由和标签页状态 | `frontend/src/store/modules/user.ts` |

### 前端注意点

- 后端实际接口没有 `/api` 前缀；前端开发环境请求 `/api/login`，由 Vite proxy 转发到后端 `/login`。
- 后端 `expires` 是 ISO 字符串；前端 `setToken()` 必须转换为时间戳后判断过期。
- `component_path` 目前使用 `/welcome/index`、`/system/user/index` 等路径；若对应页面未实现，Sprint 01 可以使用占位页面验证动态路由链路。
- `permissions` 在 Sprint 01 可以是空数组，不阻塞菜单渲染。

### Verify

```bash
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-frontend build
pnpm --filter fullstack-admin-frontend dev
```

浏览器验证：

1. 打开 `http://localhost:8848`。
2. 使用 `superadmin/123456` 登录。
3. 确认侧边栏出现系统管理、运营管理、日志审计、个人中心等菜单。
4. 退出登录。
5. 使用 `common/123456` 登录。
6. 确认侧边栏菜单少于超级管理员。
7. 刷新页面后仍保持登录状态并能访问已授权路由。

验收标准：

- [ ] 前端 typecheck 通过。
- [ ] 前端 build 通过。
- [ ] 登录请求走 `/api/login` 并由代理转发成功。
- [ ] 浏览器本地保存 `authorized-token` 和 `user-info`。
- [ ] 登录后动态调用 `/api/get-async-routes`。
- [ ] `superadmin` 与 `common` 侧边栏菜单存在明显差异。
- [ ] 刷新页面不会丢失动态路由。
- [ ] 退出登录后访问受保护页面跳回 `/login`。

---

## Checkpoint: 端到端验收

### 启动顺序

终端 1：

```bash
cd templates/pc-admin
docker compose up -d mysql
docker compose exec -T mysql mysql -uroot -p123456789 admin_template < backend/db/schema.sql
docker compose exec -T mysql mysql -uroot -p123456789 admin_template < backend/db/seed.sql
pnpm --filter fullstack-admin-backend dev
```

终端 2：

```bash
cd templates/pc-admin
pnpm --filter fullstack-admin-frontend dev
```

### 必跑命令

```bash
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-backend build
pnpm --filter fullstack-admin-frontend build
```

### 后端 curl 验收

```bash
# 1. 登录成功
curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"123456"}'

# 2. 登录失败
curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"wrong"}'

# 3. 不带 Token 访问受保护接口
curl -s http://localhost:3000/auth/me

# 4. 带 Token 访问当前用户
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer <accessToken>"

# 5. 带 Token 获取动态菜单
curl -s http://localhost:3000/get-async-routes \
  -H "Authorization: Bearer <accessToken>"
```

### 最终验收清单

| 验收项 | 标准 |
| --- | --- |
| 数据库 | schema 和 seed 可重新初始化成功 |
| 后端 typecheck | `pnpm --filter fullstack-admin-backend typecheck` 通过 |
| 后端 build | `pnpm --filter fullstack-admin-backend build` 通过 |
| 前端 typecheck | `pnpm --filter fullstack-admin-frontend typecheck` 通过 |
| 前端 build | `pnpm --filter fullstack-admin-frontend build` 通过 |
| 登录成功 | 三个默认账号均可登录 |
| 登录失败 | 错误密码返回 `INVALID_CREDENTIALS` |
| 登录日志 | 成功和失败均写入 `login_logs` |
| 当前用户 | `/auth/me` 返回 user、roles、menus、permissions |
| 动态菜单 | `/get-async-routes` 对不同账号返回不同菜单 |
| 前端代理 | `/api` 请求成功代理到 `localhost:3000` |
| 前端动态路由 | 登录后侧边栏基于后端菜单渲染 |
| 刷新页面 | 已登录用户刷新页面不丢动态路由 |
| 退出登录 | 清除 Token 并跳回登录页 |

通过全部验收后，才能进入 Sprint 02：用户、角色、菜单三大核心 CRUD。

---

## 后续执行建议

| 优先级 | 下一步 | 原因 |
| --- | --- | --- |
| P0 | 先执行 Task 0 和 Task 1 | 没有稳定 MySQL 和 seed，认证与菜单无法验证 |
| P0 | 跑后端 typecheck，修复编译错误 | 防止继续在旧桩代码上叠加问题 |
| P0 | 用 curl 跑通 `login -> auth/me -> get-async-routes` | 先证明后端主链路正确 |
| P1 | 再联调前端登录和动态路由 | 前端依赖后端合同稳定 |
| P1 | 记录实际遗留问题到下一个 Sprint | 避免 Sprint 01 扩散成 CRUD 实现 |

## 错误码速查

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | 请求格式错误 |
| `UNAUTHORIZED` | 401 | 未登录、Token 无效或 Token 过期 |
| `FORBIDDEN` | 403 | 已登录但无权限 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 唯一字段冲突 |
| `VALIDATION_ERROR` | 422 | 业务校验失败 |
| `INTERNAL_ERROR` | 500 | 服务端错误 |
| `USER_DISABLED` | 403 | 用户已停用 |
| `INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |

## 常用命令

```bash
# 项目根目录
cd templates/pc-admin

# 安装依赖
pnpm install

# MySQL
docker compose up -d mysql
docker compose ps
docker compose exec mysql mysql -uroot -p123456789 admin_template

# 数据库初始化
docker compose exec -T mysql mysql -uroot -p123456789 admin_template < backend/db/schema.sql
docker compose exec -T mysql mysql -uroot -p123456789 admin_template < backend/db/seed.sql

# 后端
pnpm --filter fullstack-admin-backend dev
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-backend build

# 前端
pnpm --filter fullstack-admin-frontend dev
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-frontend build

# 全量
pnpm typecheck
pnpm build
```
