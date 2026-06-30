---
status: ready
confirmedBy: user
confirmedAt: 2026-06-30T00:00:00+08:00
confirmationQuote: "继续执行流程，直到输出可用于执行的技术文档。"
selectedOptionId: full-module-foundation
sourceRequirement: workflow/requirements.md
sourceSelection: workflow/solution-selected.md
---

# PC Admin Implementation Ready

## 1. 执行目标

按已选方案 `full-module-foundation`，把 PC Admin 模板建设成 13 个模块的前后端基础可用版本。

完成后的模板必须满足：

- 13 个模块都有菜单入口。
- 13 个模块至少具备列表页或基础维护页。
- 后端 13 个模块至少具备 route/service 基础实现和真实 MySQL 访问。
- 登录、Token、当前用户、动态菜单、首页、菜单权限形成可验证主闭环。
- 日志、消息、配置、附件至少能演示核心行为。
- 前后端字段以 `SPECS/API.md` 为准。
- 根目录 `pnpm typecheck` 和 `pnpm build` 通过。

## 2. 当前事实

当前模板源已有：

- `SPECS/requirements/`：13 个模块需求。
- `SPECS/API.md`：共享 API 契约。
- `SPECS/DATABASE.md`：MySQL 8.0 数据库设计。
- `backend/src`：Fastify、MySQL、JWT、auth、users、async-routes 等基础文件。
- `frontend/src`：Vue 3、layout、router、Pinia、Axios、login、welcome 等基础文件。

当前模板源缺口：

- `workflow-state.json` 和 `scripts/kit.mjs` 只应由 `kit init` 在 generated project 中物化；模板源不能直接当 generated project 跑 `pnpm kit:check`。
- 后端尚未覆盖 13 个模块 route/service。
- 前端尚未覆盖 13 个模块业务页面。
- 数据库 schema/seed 尚未以可执行 SQL 或 migration 形式落地。
- 文件上传真实实现需要确认并新增 multipart 处理依赖。

## 3. 架构决定

### 3.1 数据库优先

数据库 schema 与 seed 是所有模块的基础。第一批任务必须先落地：

- 13 个核心表。
- 唯一约束和关键索引。
- 默认部门、岗位、角色、菜单、配置、演示账号。

原因：后端 API、动态菜单、首页统计、权限计算都依赖真实数据。

### 3.2 API 契约优先于页面实现

所有前后端字段必须以 `SPECS/API.md` 为准。字段映射统一放在后端 service 或 mapper 层：

- DB 使用 `lower_snake_case`。
- API/VO 使用 `camelCase`。
- 时间返回 ISO 8601 字符串。
- `deleted` 默认不返回前端。

### 3.3 后端分层

后端采用轻量分层，不引入 ORM：

```text
src/app.ts                 -> Fastify app 注册插件和路由
src/server.ts              -> 启动入口
src/config/                -> env 和运行配置
src/db/                    -> mysql2 pool、query、transaction
src/routes/                -> route 注册和 request/response 边界
src/services/              -> 业务规则、字段映射、权限计算
src/utils/                 -> jwt、password、date、errors、pagination
src/loaders/               -> logger
```

原则：

- route 只做 HTTP 边界和参数读取。
- service 负责业务规则、SQL 调用和 VO 映射。
- 通用分页、状态切换、逻辑删除可提取 helper。
- 不做大型通用 CRUD DSL。

### 3.4 前端分层

前端保留现有 Pure Admin 风格结构：

```text
src/api/                   -> axios API 方法
src/router/                -> 静态路由、动态路由注册
src/store/modules/         -> user、permission、app 等状态
src/views/                 -> 业务页面
src/components/            -> 复用组件
src/utils/http/            -> 请求封装与拦截器
```

业务页面采用统一模式：

- 查询表单。
- Element Plus 表格。
- 分页。
- 新增/编辑弹窗。
- 状态切换。
- 删除确认。

### 3.5 权限边界

第一阶段权限做到：

- 登录态保护。
- 菜单级授权。
- 超级管理员默认拥有全部启用菜单。
- 普通用户只能看到授权菜单。

按钮级和接口级权限字段保留，但不作为第一阶段强制能力。

### 3.6 日志边界

日志分两类：

- Winston：应用日志、错误日志、访问日志。
- 数据库审计日志：`login_logs`、`operation_logs`、`exception_logs`。

敏感字段如密码、Access Token、Refresh Token 不得写入任何日志。

## 4. 依赖顺序

```text
P0 文档和契约冻结
  -> P1 数据库 schema/seed
    -> P2 后端基础设施
      -> P3 认证、当前用户、动态菜单
        -> P4 前端请求、状态、动态路由
          -> P5 通用 CRUD 模式
            -> P6 13 个模块基础落地
              -> P7 附件、消息、日志、配置联动
                -> P8 全量验证
```

必须串行：

- P1 -> P2 -> P3 -> P4。
- 数据库字段变更必须先更新 `SPECS/DATABASE.md` 和 `SPECS/API.md`。
- 登录和动态菜单未稳定前，不开始批量页面铺设。

可并行：

- P6 中部门、岗位、字典、配置页面和后端 API 可在 CRUD 模式稳定后并行。
- 日志详情页、消息列表页、个人信息页可并行。
- 文档更新和测试用例整理可与实现并行。

## 5. 执行阶段

### Phase 1: Foundation

目标：让数据库、后端 app、统一响应、错误、Token、日志基础能力稳定。

交付：

- SQL schema/seed。
- 后端 DB helper。
- 后端 error/response/pagination helpers。
- JWT/password/logger 基础能力。

Checkpoint：

- `pnpm --filter fullstack-admin-backend typecheck`
- `pnpm --filter fullstack-admin-backend build`
- MySQL 可连接。
- seed 后有默认账号、角色、菜单。

### Phase 2: Auth And Menu Spine

目标：跑通登录、刷新 Token、当前用户、动态菜单和前端动态路由。

交付：

- `/login`
- `/refresh-token`
- `/logout`
- `/auth/me`
- `/get-async-routes`
- 前端 login、user store、permission store、router 注册。

Checkpoint：

- 超级管理员可登录。
- 普通用户可登录。
- 两类账号菜单不同。
- 未登录访问业务页跳转登录页。

### Phase 3: CRUD Pattern

目标：用用户、角色、菜单三个模块建立通用 CRUD 模式。

交付：

- 用户管理。
- 角色管理。
- 菜单权限。
- 前端列表、查询、弹窗、状态切换、删除确认、授权维护模式。

Checkpoint：

- 用户、角色、菜单可分页查询。
- 用户角色变更后重新登录菜单变化。
- 停用角色或菜单后权限计算变化。

### Phase 4: Foundation Modules

目标：批量落地部门、岗位、字典、系统配置、个人信息。

交付：

- 部门管理。
- 岗位管理。
- 数据字典。
- 系统配置。
- 个人信息和修改密码。

Checkpoint：

- 部门/岗位下拉来自真实 API。
- 停用基础数据不出现在新增表单。
- 修改系统名称可被前端读取并展示。
- 修改密码后可用新密码登录。

### Phase 5: Operational Modules

目标：补齐附件、消息、日志和首页统计联动。

交付：

- 首页工作台。
- 消息中心。
- 日志审计。
- 文件附件。

Checkpoint：

- 首页统计来自真实 API。
- 未读消息与消息中心联动。
- 登录/用户/角色/菜单操作产生审计日志。
- 图片可预览，文档可下载，危险文件被拒绝。

### Phase 6: Full Verification

目标：证明模板达到方案 C 的完整基础版本。

交付：

- 全量 typecheck/build。
- 真实 MySQL 联调记录。
- 超级管理员和普通用户演示路径。
- `SPECS/API.md` 字段回查。
- 必要文档更新。

Checkpoint：

- `pnpm typecheck`
- `pnpm build`
- `pnpm dev` 可启动前后端。
- 前端端口 `8848`，后端端口 `3000`。

## 6. 任务清单

### Task 1: 数据库 schema 和 seed

Description：把 `SPECS/DATABASE.md` 落成可执行 SQL，包含 13 个模块表、唯一约束、关键索引和默认数据。

Acceptance：

- [ ] `admin_template` schema 可创建。
- [ ] 表覆盖 departments、posts、users、roles、user_roles、menus、role_menus、dict_types、dict_items、system_configs、attachments、messages、login_logs、operation_logs、exception_logs。
- [ ] seed 包含 SUPER_ADMIN、OPERATOR、COMMON_USER、默认菜单、默认配置和演示账号。

Verification：

- [ ] `docker compose up -d mysql`
- [ ] SQL 可重复在空库执行。
- [ ] 查询默认账号、角色、菜单有数据。

Dependencies：None

Files likely touched：

- `templates/pc-admin/backend/db/schema.sql`
- `templates/pc-admin/backend/db/seed.sql`
- `templates/pc-admin/backend/.env.example`

Estimated scope：M

### Task 2: 后端基础设施和统一合同

Description：稳定 Fastify app、MySQL pool、统一响应、错误处理、分页、字段映射工具和 Winston 日志基础。

Acceptance：

- [ ] API 成功响应统一 `{ success: true, data }`。
- [ ] API 失败响应统一 `{ success: false, error }`。
- [ ] MySQL pool 支持 query 和 transaction。
- [ ] logger 不记录密码和 Token。

Verification：

- [ ] `pnpm --filter fullstack-admin-backend typecheck`
- [ ] `pnpm --filter fullstack-admin-backend build`

Dependencies：Task 1

Files likely touched：

- `templates/pc-admin/backend/src/app.ts`
- `templates/pc-admin/backend/src/db/mysql.ts`
- `templates/pc-admin/backend/src/loaders/logger.ts`
- `templates/pc-admin/backend/src/utils/errors.ts`
- `templates/pc-admin/backend/src/utils/pagination.ts`

Estimated scope：M

### Task 3: 认证与当前用户 API

Description：实现登录、刷新 Token、退出、当前用户和登录日志。

Acceptance：

- [ ] 停用用户登录返回 `USER_DISABLED`。
- [ ] 密码错误返回 `INVALID_CREDENTIALS`。
- [ ] 登录成功返回 accessToken、refreshToken、expires、roles、permissions。
- [ ] `/auth/me` 返回 user、roles、menus、permissions。
- [ ] 登录成功和失败写入 `login_logs`。

Verification：

- [ ] `pnpm --filter fullstack-admin-backend typecheck`
- [ ] 手工调用 `POST /login`
- [ ] 手工调用 `GET /auth/me`

Dependencies：Task 1, Task 2

Files likely touched：

- `templates/pc-admin/backend/src/routes/auth.ts`
- `templates/pc-admin/backend/src/utils/jwt.ts`
- `templates/pc-admin/backend/src/utils/password.ts`
- `templates/pc-admin/backend/src/services/auth.ts`
- `templates/pc-admin/backend/src/services/menus.ts`

Estimated scope：M

### Task 4: 动态菜单 API 和权限计算

Description：实现菜单树生成、超级管理员全量菜单、普通用户按角色菜单。

Acceptance：

- [ ] `/get-async-routes` 返回 `MenuRoute[]`。
- [ ] SUPER_ADMIN 返回全部启用菜单。
- [ ] 普通用户只返回角色授权菜单。
- [ ] 停用角色和停用菜单不参与计算。

Verification：

- [ ] 两个账号调用 `/get-async-routes` 菜单不同。
- [ ] `pnpm --filter fullstack-admin-backend typecheck`

Dependencies：Task 1, Task 3

Files likely touched：

- `templates/pc-admin/backend/src/routes/async-routes.ts`
- `templates/pc-admin/backend/src/services/menus.ts`
- `templates/pc-admin/backend/src/utils/tree.ts`

Estimated scope：S

### Task 5: 前端登录、Token 和动态路由

Description：接入真实登录 API、Token 刷新、Pinia 用户态、动态路由注册和登录态保护。

Acceptance：

- [ ] 登录页使用 `POST /login`。
- [ ] Axios 请求自动注入 `Authorization`。
- [ ] Token 过期尝试刷新，刷新失败回登录页。
- [ ] 登录后按后端菜单注册路由和侧边栏。

Verification：

- [ ] `pnpm --filter fullstack-admin-frontend typecheck`
- [ ] 超级管理员登录后看到完整菜单。
- [ ] 普通用户登录后菜单受限。

Dependencies：Task 3, Task 4

Files likely touched：

- `templates/pc-admin/frontend/src/api/user.ts`
- `templates/pc-admin/frontend/src/api/routes.ts`
- `templates/pc-admin/frontend/src/store/modules/user.ts`
- `templates/pc-admin/frontend/src/store/modules/permission.ts`
- `templates/pc-admin/frontend/src/router/index.ts`

Estimated scope：M

### Task 6: 用户管理纵向切片

Description：实现用户列表、查询、新增、编辑、状态切换、重置密码、逻辑删除和角色分配。

Acceptance：

- [ ] 用户列表分页查询真实 MySQL。
- [ ] 用户工号和登录名唯一冲突返回 `CONFLICT`。
- [ ] 停用用户不能登录。
- [ ] 修改用户角色后重新登录菜单变化。

Verification：

- [ ] `pnpm --filter fullstack-admin-backend typecheck`
- [ ] `pnpm --filter fullstack-admin-frontend typecheck`
- [ ] 手工完成新增用户、分配角色、重新登录。

Dependencies：Task 5

Files likely touched：

- `templates/pc-admin/backend/src/routes/users.ts`
- `templates/pc-admin/backend/src/services/users.ts`
- `templates/pc-admin/frontend/src/api/users.ts`
- `templates/pc-admin/frontend/src/views/system/users/index.vue`
- `templates/pc-admin/frontend/src/views/system/users/form.vue`

Estimated scope：M

### Task 7: 角色管理纵向切片

Description：实现角色列表、维护、状态切换、删除保护、角色用户维护和菜单授权读取。

Acceptance：

- [ ] 角色编码唯一。
- [ ] 已被用户使用的角色删除返回 `ROLE_IN_USE`。
- [ ] 停用角色不参与菜单授权计算。
- [ ] 角色可批量绑定用户。

Verification：

- [ ] 手工停用角色后重新登录，菜单变化。
- [ ] `pnpm typecheck`

Dependencies：Task 6

Files likely touched：

- `templates/pc-admin/backend/src/routes/roles.ts`
- `templates/pc-admin/backend/src/services/roles.ts`
- `templates/pc-admin/frontend/src/api/roles.ts`
- `templates/pc-admin/frontend/src/views/system/roles/index.vue`
- `templates/pc-admin/frontend/src/views/system/roles/users.vue`

Estimated scope：M

### Task 8: 菜单权限纵向切片

Description：实现菜单树维护、排序、状态切换和角色授权。

Acceptance：

- [ ] 菜单编码唯一。
- [ ] 菜单树支持多级结构。
- [ ] 停用菜单不进入动态菜单。
- [ ] 菜单授权角色后重新登录生效。

Verification：

- [ ] 修改菜单授权后，用普通用户重新登录观察菜单变化。
- [ ] `pnpm typecheck`

Dependencies：Task 7

Files likely touched：

- `templates/pc-admin/backend/src/routes/menus.ts`
- `templates/pc-admin/backend/src/services/menus.ts`
- `templates/pc-admin/frontend/src/api/menus.ts`
- `templates/pc-admin/frontend/src/views/system/menus/index.vue`

Estimated scope：M

### Task 9: 部门和岗位基础模块

Description：实现部门、岗位的分页查询、维护、状态切换、引用保护和用户表单下拉。

Acceptance：

- [ ] 停用部门/岗位不出现在新增用户表单。
- [ ] 已被用户引用的部门返回 `DEPARTMENT_IN_USE`。
- [ ] 已被用户引用的岗位返回 `POST_IN_USE`。

Verification：

- [ ] 手工停用部门/岗位后打开新增用户表单。
- [ ] `pnpm typecheck`

Dependencies：Task 6

Files likely touched：

- `templates/pc-admin/backend/src/routes/departments.ts`
- `templates/pc-admin/backend/src/routes/posts.ts`
- `templates/pc-admin/backend/src/services/org.ts`
- `templates/pc-admin/frontend/src/views/system/departments/index.vue`
- `templates/pc-admin/frontend/src/views/system/posts/index.vue`

Estimated scope：M

### Task 10: 数据字典基础模块

Description：实现字典类型、字典项、排序、状态切换和按编码获取 options。

Acceptance：

- [ ] 字典类型编码唯一。
- [ ] 同类型下字典值唯一。
- [ ] 字典项按 sortOrder 升序。
- [ ] 停用字典项不出现在新增表单 options。

Verification：

- [ ] 手工新增字典类型和字典项。
- [ ] 调用 `/dict-types/by-code/:dictCode/options`。
- [ ] `pnpm typecheck`

Dependencies：Task 2

Files likely touched：

- `templates/pc-admin/backend/src/routes/dicts.ts`
- `templates/pc-admin/backend/src/services/dicts.ts`
- `templates/pc-admin/frontend/src/api/dicts.ts`
- `templates/pc-admin/frontend/src/views/system/dicts/index.vue`

Estimated scope：M

### Task 11: 系统配置和个人信息

Description：实现系统配置维护、按编码读取配置、个人资料和修改密码。

Acceptance：

- [ ] 配置编码唯一。
- [ ] 修改系统名称后前端可读取并展示。
- [ ] 修改密码校验 oldPassword、confirmPassword 和 PASSWORD_UNCHANGED。
- [ ] 修改密码后可用新密码登录。

Verification：

- [ ] 手工修改系统名称。
- [ ] 手工修改密码并重新登录。
- [ ] `pnpm typecheck`

Dependencies：Task 3, Task 10

Files likely touched：

- `templates/pc-admin/backend/src/routes/system-configs.ts`
- `templates/pc-admin/backend/src/routes/profile.ts`
- `templates/pc-admin/backend/src/services/system-configs.ts`
- `templates/pc-admin/frontend/src/views/system/configs/index.vue`
- `templates/pc-admin/frontend/src/views/profile/index.vue`

Estimated scope：M

### Task 12: 首页和消息中心

Description：实现首页 overview、消息列表、详情、单条已读、批量已读和未读数量。

Acceptance：

- [ ] 首页 todoCount、unreadMessageCount、recentOperations、announcements 来自真实 API。
- [ ] 普通用户 `adminStats` 返回 null。
- [ ] 用户只能查看自己的消息。
- [ ] 单条和批量已读会更新首页未读数。

Verification：

- [ ] 两个账号查看首页数据不同。
- [ ] 消息已读后首页未读数变化。
- [ ] `pnpm typecheck`

Dependencies：Task 5, Task 11

Files likely touched：

- `templates/pc-admin/backend/src/routes/dashboard.ts`
- `templates/pc-admin/backend/src/routes/messages.ts`
- `templates/pc-admin/backend/src/services/messages.ts`
- `templates/pc-admin/frontend/src/views/welcome/index.vue`
- `templates/pc-admin/frontend/src/views/system/messages/index.vue`

Estimated scope：M

### Task 13: 日志审计

Description：实现登录日志、操作日志、异常日志查询和详情，并把关键动作接入操作日志。

Acceptance：

- [ ] 登录成功和失败写入登录日志。
- [ ] 用户、角色、菜单、配置维护写入操作日志。
- [ ] 未捕获 API 错误写入异常日志。
- [ ] 日志查询支持分页和筛选。

Verification：

- [ ] 执行登录、用户编辑、角色编辑、菜单授权后查询日志。
- [ ] 模拟错误接口或错误操作后查询异常日志。
- [ ] `pnpm typecheck`

Dependencies：Task 8, Task 11

Files likely touched：

- `templates/pc-admin/backend/src/routes/logs.ts`
- `templates/pc-admin/backend/src/services/logs.ts`
- `templates/pc-admin/backend/src/utils/audit.ts`
- `templates/pc-admin/frontend/src/views/system/logs/index.vue`

Estimated scope：M

### Task 14: 文件附件

Description：实现登录态文件上传、图片预览、文档下载、危险类型拒绝和附件元数据维护。

Acceptance：

- [ ] 未登录不能上传或访问附件。
- [ ] 上传成功返回 id、originalName、storedName、url、mimeType、fileSize、uploadedAt。
- [ ] 危险文件类型返回明确错误。
- [ ] 图片可预览，文档可下载。

Verification：

- [ ] 手工上传 png/pdf。
- [ ] 手工上传脚本文件被拒绝。
- [ ] `pnpm typecheck`

Dependencies：Task 11

Files likely touched：

- `templates/pc-admin/backend/package.json`
- `templates/pc-admin/backend/src/routes/attachments.ts`
- `templates/pc-admin/backend/src/services/attachments.ts`
- `templates/pc-admin/frontend/src/api/attachments.ts`
- `templates/pc-admin/frontend/src/views/system/attachments/index.vue`

Estimated scope：M

Note：该任务需要确认并新增 multipart 处理依赖，建议使用 Fastify 生态插件。

### Task 15: 全量菜单、路由和导航整理

Description：把 13 个模块统一纳入菜单 seed、前端动态组件映射、侧边栏和页面路径。

Acceptance：

- [ ] SUPER_ADMIN 菜单显示 13 个模块入口。
- [ ] 普通用户按角色授权显示子集。
- [ ] 所有菜单 path 对应可加载页面。
- [ ] 未实现高级功能不出现死链。

Verification：

- [ ] 登录超级管理员逐项打开菜单。
- [ ] 登录普通用户确认菜单子集。
- [ ] `pnpm --filter fullstack-admin-frontend typecheck`

Dependencies：Task 8, Tasks 9-14

Files likely touched：

- `templates/pc-admin/backend/db/seed.sql`
- `templates/pc-admin/frontend/src/router/utils.ts`
- `templates/pc-admin/frontend/src/views/**/index.vue`

Estimated scope：M

### Task 16: 全链路验收和文档回填

Description：执行完整 typecheck/build/dev smoke，回查 API 字段与文档，并记录未完成扩展能力。

Acceptance：

- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm build` 通过。
- [ ] 前端 `8848`、后端 `3000` 可启动。
- [ ] 两个账号演示路径通过。
- [ ] `SPECS/API.md` 与实际响应字段一致。

Verification：

- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `pnpm dev`
- [ ] 手工登录 SUPER_ADMIN 和 COMMON_USER。

Dependencies：Tasks 1-15

Files likely touched：

- `templates/pc-admin/SPECS/API.md`
- `templates/pc-admin/SPECS/DATABASE.md`
- `templates/pc-admin/workflow/implementation-ready.md`
- `templates/pc-admin/tasks/sprint-01.md`

Estimated scope：M

## 7. Sprint 01 切入点

第一轮执行只做基础闭环，不碰 13 个模块页面批量铺设。

Sprint 01 包含：

- Task 1：数据库 schema 和 seed。
- Task 2：后端基础设施和统一合同。
- Task 3：认证与当前用户 API。
- Task 4：动态菜单 API 和权限计算。
- Task 5：前端登录、Token 和动态路由。

Sprint 01 完成标准：

- 默认账号可登录。
- `/auth/me` 和 `/get-async-routes` 可用。
- 前端能按真实菜单注册路由。
- 超级管理员和普通用户菜单不同。
- 后端和前端 typecheck 通过。

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 方案 C 任务面过大 | 高 | 按 Sprint 01 先做认证菜单主干，再铺模块 |
| 通用 CRUD 抽象过早 | 中 | 只抽分页、响应、字段映射、状态切换和逻辑删除 |
| API 字段漂移 | 高 | 每个任务验收时回查 `SPECS/API.md` |
| 文件上传缺少依赖 | 中 | 在 Task 14 明确新增 multipart 依赖并单独验收 |
| 日志污染敏感信息 | 高 | logger 和 audit helper 必须统一脱敏 |
| 模板源不能跑 kit check | 中 | 在 generated project 中运行阶段门；模板源只维护模板文件 |

## 9. 并行策略

可以并行：

- Task 9、Task 10、Task 11 中的前端页面骨架可并行，但要等 CRUD 模式稳定。
- Task 12、Task 13、Task 14 可并行，但都依赖认证和基础配置。
- 文档回查和 API 字段清单可与实现并行。

必须串行：

- Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5。
- Task 6 -> Task 7 -> Task 8。
- Task 16 必须最后执行。

## 10. 执行边界

Always：

- 先更新相关规格，再改实现。
- 每个任务完成后运行对应 typecheck。
- 任何字段新增都同步检查 `SPECS/API.md`。
- 所有密码和 Token 脱敏。

Ask first：

- 新增依赖。
- 改数据库表结构或 API 路径。
- 把按钮级/接口级权限纳入强制实现。
- 引入 ORM、代码生成器或大型 CRUD 配置 DSL。

Never：

- 跳过 Sprint checkpoint 继续批量铺模块。
- 用前端 Mock 冒充真实接口。
- 手动编辑 generated project 的 `workflow-state.json`。
- 删除失败测试或隐藏 typecheck/build 错误。
