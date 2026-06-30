---
title: "Sprint 02: Core CRUD And Permission Maintenance - 可执行技术文档"
status: ready
dependsOn: tasks/sprint-01.md
solution: C
---

# Sprint 02: Core CRUD And Permission Maintenance

## 目标

在 Sprint 01 的登录、Token、当前用户、动态菜单主干之上，补齐后台管理系统最核心的三个维护模块：

1. 用户管理 CRUD。
2. 角色管理 CRUD 与菜单授权。
3. 菜单管理 CRUD 与动态菜单联动。
4. 通用 CRUD 页面模式。
5. 用户、角色、菜单维护操作写入 `operation_logs`。

Sprint 02 完成后，系统应能证明“菜单权限可被后台维护”，并为后续部门、岗位、字典、配置、附件、消息、日志、个人信息等模块提供复用模式。

## 范围

| 类别 | Sprint 02 包含 | Sprint 02 不包含 |
| --- | --- | --- |
| 后端 | `/users`、`/roles`、`/menus` REST API，基础校验，逻辑删除，状态切换，角色菜单授权，操作日志 helper | 接口级 RBAC 拦截、按钮级权限完整模型、复杂数据权限 |
| 前端 | 用户、角色、菜单三个真实页面，查询、分页、弹窗、状态切换、删除确认、授权弹窗 | 部门/岗位/字典/配置等后续模块页面 |
| 数据库 | 复用 Sprint 01 schema/seed 的用户、角色、菜单、关联表、操作日志表 | 新增迁移框架、生产级审计流水 |
| 验证 | typecheck、build、curl/API smoke、前端手工验证路径 | 自动化 E2E 套件 |

## 执行顺序

必须按以下顺序执行。每个 Task 完成后先执行本 Task 的 Verify，再进入下一个 Task。

```text
Task 0 Sprint 01 基线确认
  -> Task 1 用户管理 CRUD
  -> Task 2 角色管理 CRUD 与授权
  -> Task 3 菜单管理 CRUD
  -> Task 4 通用 CRUD 页面模式收敛
  -> Task 5 操作日志基础
  -> Checkpoint Sprint 02 端到端验收
```

## 全局约定

| 项 | 约定 |
| --- | --- |
| 工作目录 | 所有命令默认从 `templates/pc-admin` 执行 |
| API 契约 | 以 `SPECS/API.md` 为唯一事实源 |
| 数据库契约 | 以 `SPECS/DATABASE.md` 和 `backend/db/schema.sql` 为准 |
| 后端分层 | route 读取 HTTP 参数；service 处理业务、SQL、字段映射 |
| 前端分层 | `src/api/` 放接口；`src/views/system/*` 放页面；复用 Element Plus 表格/弹窗模式 |
| 字段映射 | DB 使用 `lower_snake_case`，API/VO 使用 `camelCase` |
| 删除策略 | 用户、角色、菜单均采用 `deleted = 1` 逻辑删除 |
| 状态字段 | `status`: 0-停用，1-启用 |

---

## Task 0: Sprint 01 基线确认

### 目标

确认当前分支已经固化 Sprint 01，且工作区干净后再进入核心 CRUD。

### 实施动作

| 步骤 | 动作 | 文件/命令 |
| --- | --- | --- |
| 0.1 | 确认 Sprint 01 commit 存在 | `git log --oneline -5` |
| 0.2 | 确认工作区干净 | `git status --short` |
| 0.3 | 运行基础类型检查 | `pnpm --filter fullstack-admin-backend typecheck`、`pnpm --filter fullstack-admin-frontend typecheck` |
| 0.4 | 运行基础构建 | `pnpm --filter fullstack-admin-backend build`、`pnpm --filter fullstack-admin-frontend build` |

### Acceptance

- [ ] `git status --short` 无输出。
- [ ] 前后端 typecheck 通过。
- [ ] 前后端 build 通过。
- [ ] Sprint 02 diff 不混入 Sprint 01 未提交内容。

### Verify

```bash
git status --short
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-backend build
pnpm --filter fullstack-admin-frontend build
```

---

## Task 1: 用户管理 CRUD

### 目标

建立第一个真实业务列表页模式，让用户管理覆盖分页、查询、新增、编辑、停用、删除和重置密码。

### 后端实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 1.1 | 新增用户管理 service，封装 SQL、字段映射和角色绑定 | `backend/src/services/user-management.ts` |
| 1.2 | 新增 REST 路由：`GET /users`、`POST /users`、`GET /users/:id`、`PATCH /users/:id`、`PATCH /users/:id/status`、`POST /users/:id/reset-password`、`DELETE /users/:id` | `backend/src/routes/user-management.ts` |
| 1.3 | 保留旧 `/searchPage`、`/searchVague` 等兼容路由，避免破坏已有 demo | `backend/src/routes/users.ts` |
| 1.4 | 用户列表 JOIN 部门、岗位、角色，返回 `deptName`、`postName`、`roles` | `backend/src/services/user-management.ts` |
| 1.5 | 新增/编辑用户时维护 `user_roles` | `backend/src/services/user-management.ts` |
| 1.6 | 用户工号、登录名唯一冲突返回 `CONFLICT` | `backend/src/services/user-management.ts` |

### 前端实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 1.7 | 新增用户管理 API client | `frontend/src/api/system.ts` 或 `frontend/src/api/user-management.ts` |
| 1.8 | 新增用户管理页面 | `frontend/src/views/system/user/index.vue` |
| 1.9 | 页面包含查询表单：用户工号、登录名、中文姓名、手机号、部门、岗位、状态 | `frontend/src/views/system/user/index.vue` |
| 1.10 | 页面包含表格、分页、新增/编辑弹窗、状态切换、删除确认、重置密码 | `frontend/src/views/system/user/index.vue` |
| 1.11 | 部门、岗位、角色下拉来自真实 API | `frontend/src/views/system/user/index.vue` |

### Acceptance

- [ ] `GET /users` 支持分页和查询。
- [ ] `POST /users` 可创建用户并绑定角色。
- [ ] `PATCH /users/:id` 可修改用户基础信息和角色。
- [ ] `PATCH /users/:id/status` 可启用/停用用户。
- [ ] `POST /users/:id/reset-password` 可重置密码。
- [ ] `DELETE /users/:id` 逻辑删除用户。
- [ ] 前端用户管理页可完成同等操作。

### Verify

```bash
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
curl -s "http://localhost:3000/users?page=1&pageSize=10" -H "Authorization: Bearer <accessToken>"
curl -s -X POST "http://localhost:3000/users" -H "Content-Type: application/json" -H "Authorization: Bearer <accessToken>" -d '{"userCode":"T001","username":"tester","password":"123456","nickname":"测试用户","deptId":1,"postId":1,"status":1,"roleIds":[3]}'
```

---

## Task 2: 角色管理 CRUD 与授权

### 目标

让角色可维护，并能通过角色授权菜单影响重新登录后的动态菜单。

### 后端实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 2.1 | 新增角色管理 service | `backend/src/services/role-management.ts` |
| 2.2 | 新增 REST 路由：`GET /roles`、`POST /roles`、`GET /roles/:id`、`PATCH /roles/:id`、`PATCH /roles/:id/status`、`DELETE /roles/:id` | `backend/src/routes/role-management.ts` |
| 2.3 | 新增角色用户维护：`GET /roles/:id/users`、`PUT /roles/:id/users` | `backend/src/routes/role-management.ts` |
| 2.4 | 角色详情返回 `menuIds`、`userCount`、`isSuperAdmin` | `backend/src/services/role-management.ts` |
| 2.5 | 新增/编辑角色时维护 `role_menus` | `backend/src/services/role-management.ts` |
| 2.6 | 已被用户使用的角色删除时返回 `ROLE_IN_USE` | `backend/src/services/role-management.ts` |

### 前端实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 2.7 | 新增角色管理 API client | `frontend/src/api/system.ts` 或 `frontend/src/api/role-management.ts` |
| 2.8 | 新增角色管理页面 | `frontend/src/views/system/role/index.vue` |
| 2.9 | 页面包含查询、分页、新增/编辑、状态切换、删除确认 | `frontend/src/views/system/role/index.vue` |
| 2.10 | 新增菜单授权弹窗，使用菜单树勾选 `menuIds` | `frontend/src/views/system/role/index.vue` |
| 2.11 | 授权保存后提示用户重新登录验证菜单变化 | `frontend/src/views/system/role/index.vue` |

### Acceptance

- [ ] `GET /roles` 支持分页和查询。
- [ ] 角色详情包含 `menuIds`。
- [ ] 新增/编辑角色可维护菜单授权。
- [ ] 已绑定用户的角色不能删除。
- [ ] 前端角色授权弹窗可保存菜单树。
- [ ] 修改角色菜单后，重新登录同角色用户，`GET /get-async-routes` 返回变化。

### Verify

```bash
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
curl -s "http://localhost:3000/roles?page=1&pageSize=10" -H "Authorization: Bearer <accessToken>"
curl -s -X PATCH "http://localhost:3000/roles/2" -H "Content-Type: application/json" -H "Authorization: Bearer <accessToken>" -d '{"roleName":"运营人员","status":1,"description":"可访问运营菜单","menuIds":[1,10,11,17,18,19]}'
curl -s "http://localhost:3000/get-async-routes" -H "Authorization: Bearer <operatorAccessToken>"
```

---

## Task 3: 菜单管理 CRUD

### 目标

让动态菜单数据可被后台维护，并证明菜单状态变化会影响 `/get-async-routes`。

### 后端实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 3.1 | 新增菜单管理 service | `backend/src/services/menu-management.ts` |
| 3.2 | 新增 REST 路由：`GET /menus/tree`、`POST /menus`、`GET /menus/:id`、`PATCH /menus/:id`、`PATCH /menus/:id/status`、`DELETE /menus/:id` | `backend/src/routes/menu-management.ts` |
| 3.3 | 新增菜单排序：`PATCH /menus/tree/sort` | `backend/src/routes/menu-management.ts` |
| 3.4 | 新增菜单授权角色：`PUT /menus/:id/roles` | `backend/src/routes/menu-management.ts` |
| 3.5 | 菜单新增/编辑时同步 `meta_json.title`，保持动态路由显示一致 | `backend/src/services/menu-management.ts` |
| 3.6 | 有子菜单的菜单禁止删除 | `backend/src/services/menu-management.ts` |

### 前端实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 3.7 | 新增菜单管理 API client | `frontend/src/api/system.ts` 或 `frontend/src/api/menu-management.ts` |
| 3.8 | 新增菜单树维护页面 | `frontend/src/views/system/menu/index.vue` |
| 3.9 | 页面包含树表格、新增/编辑弹窗、状态切换、显示/隐藏、删除确认 | `frontend/src/views/system/menu/index.vue` |
| 3.10 | 页面支持父级菜单选择和角色授权选择 | `frontend/src/views/system/menu/index.vue` |

### Acceptance

- [ ] `GET /menus/tree` 返回树形菜单。
- [ ] 菜单可新增、编辑、启用/停用、删除。
- [ ] 停用菜单后，重新请求 `/get-async-routes` 不再返回该菜单。
- [ ] 前端菜单管理页可维护菜单树。
- [ ] 菜单 `componentPath` 与真实前端页面路径保持一致。

### Verify

```bash
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
curl -s "http://localhost:3000/menus/tree" -H "Authorization: Bearer <accessToken>"
curl -s -X PATCH "http://localhost:3000/menus/11/status" -H "Content-Type: application/json" -H "Authorization: Bearer <accessToken>" -d '{"status":0}'
curl -s "http://localhost:3000/get-async-routes" -H "Authorization: Bearer <operatorAccessToken>"
```

---

## Task 4: 通用 CRUD 页面模式收敛

### 目标

从用户、角色、菜单三个页面中抽出后续模块可复用的页面模式，避免部门、岗位、字典、配置等模块重复写散。

### 实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 4.1 | 固化查询表单、表格、分页、弹窗、状态切换、删除确认的组合模式 | `frontend/src/views/system/*` |
| 4.2 | 如出现 3 处以上重复逻辑，抽取轻量 composable | `frontend/src/views/system/hooks/` |
| 4.3 | 保留模块差异字段，不抽大型 CRUD DSL | `frontend/src/views/system/*` |
| 4.4 | 统一 API 返回处理和错误提示 | `frontend/src/api/*`、`frontend/src/utils/message.ts` |

### Acceptance

- [ ] 用户、角色、菜单三个页面交互结构一致。
- [ ] 复用逻辑有明确边界，不引入大型通用 CRUD DSL。
- [ ] 后续部门、岗位、字典、配置页面可复制该模式落地。

### Verify

```bash
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-frontend build
```

---

## Task 5: 操作日志基础

### 目标

为管理操作留审计链路。用户、角色、菜单的新增、编辑、状态切换、删除、授权操作必须写入 `operation_logs`。

### 实施动作

| 步骤 | 动作 | 文件 |
| --- | --- | --- |
| 5.1 | 新增 `recordOperationLog` helper | `backend/src/services/operation-logs.ts` |
| 5.2 | 记录操作人 ID、操作人名称、模块编码、操作类型、请求方法、路径、脱敏参数、结果 | `backend/src/services/operation-logs.ts` |
| 5.3 | 用户管理写入 `moduleCode=USER` | `backend/src/routes/user-management.ts` |
| 5.4 | 角色管理写入 `moduleCode=ROLE` | `backend/src/routes/role-management.ts` |
| 5.5 | 菜单管理写入 `moduleCode=MENU` | `backend/src/routes/menu-management.ts` |
| 5.6 | 密码、Token 等敏感字段不得写入日志 | `backend/src/services/operation-logs.ts` |

### Acceptance

- [ ] 用户新增、编辑、停用、删除写入 `operation_logs`。
- [ ] 角色新增、编辑、授权、停用、删除写入 `operation_logs`。
- [ ] 菜单新增、编辑、授权、停用、删除写入 `operation_logs`。
- [ ] 日志参数不包含密码、Access Token、Refresh Token。
- [ ] 操作失败时至少保留错误信息或由全局异常日志记录。

### Verify

```bash
curl -s "http://localhost:3000/logs/operation?page=1&pageSize=10" -H "Authorization: Bearer <accessToken>"
docker compose exec mysql mysql -uroot -p123456789 admin_template -e "SELECT module_code, operation_type, operation_result, operated_at FROM operation_logs ORDER BY id DESC LIMIT 10;"
```

---

## Checkpoint: Sprint 02 端到端验收

### 验收路径

1. 使用 `superadmin / 123456` 登录。
2. 打开用户管理，新增一个测试用户，绑定 `COMMON_USER`。
3. 编辑测试用户手机号或部门岗位。
4. 停用再启用测试用户。
5. 打开角色管理，调整 `OPERATOR` 的菜单授权。
6. 使用 `operator / 123456` 重新登录，确认侧边栏菜单变化。
7. 打开菜单管理，停用一个运营菜单。
8. 使用 `operator / 123456` 重新登录，确认该菜单消失。
9. 查询 `operation_logs`，确认用户、角色、菜单维护操作有审计记录。

### 全量 Verify

```bash
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-backend build
pnpm --filter fullstack-admin-frontend build
```

### 完成标准

- [ ] 用户、角色、菜单三个模块都有真实前后端实现。
- [ ] 三个模块所有 Acceptance 均通过。
- [ ] 修改角色菜单或菜单状态后，重新登录可观察到动态菜单变化。
- [ ] 维护操作产生 `operation_logs`。
- [ ] 全量 typecheck/build 通过。
- [ ] Sprint 02 diff 经 review 后独立提交。
