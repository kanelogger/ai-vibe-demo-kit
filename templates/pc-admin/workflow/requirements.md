---
status: confirmed
confirmedBy: user
confirmedAt: 2026-06-30T00:00:00+08:00
confirmationQuote: "我确认了，现在创建 solution-options"
sourceDocs:
  - SPECS/requirements
  - SPECS/API.md
  - SPECS/DATABASE.md
---

# PC Admin 需求规格草案

## 1. 目标

构建一个 demo 级但可真实联调的 PC 后台管理系统模板。系统面向后台管理员、运营人员、审核人员和普通用户，提供登录认证、动态菜单、基础权限、组织用户、系统配置、消息、附件和日志审计能力。

本草案合并以下现有事实源：

- `SPECS/requirements/` 下 13 个模块需求文档。
- `SPECS/API.md` 中的前后端共享 API 契约。
- `SPECS/DATABASE.md` 中的 MySQL 8.0 数据库设计。

第一阶段目标是让 generated project 可以用真实后端 API、真实 MySQL 数据和真实前端页面完成核心后台管理流程演示，不追求企业级权限、复杂审批流或多租户能力。

## 2. 技术栈

### 2.1 Monorepo

- 包管理：pnpm workspace。
- 子包：`frontend`、`backend`。
- 根目录负责 workflow、共享 API 契约、任务和决策记录。

### 2.2 Frontend

- Vue 3 + Composition API + `<script setup>`。
- Vite 7，开发端口 `8848`。
- TypeScript。
- Element Plus：表单、表格、弹窗、菜单、分页、消息提示等交互组件。
- Tailwind CSS 4：布局和局部样式微调。
- Vue Router 4：静态基础路由 + 登录后按后端菜单动态注册业务路由。
- Pinia：用户信息、角色、菜单、Token、应用布局状态。
- Axios：统一请求封装，注入 Token，处理刷新 Token、错误提示和登录失效跳转。
- Vite proxy：前端 `/api` 请求代理到 `http://localhost:3000`。

### 2.3 Backend

- Fastify 5 + TypeScript。
- MySQL2 连接 MySQL 8.0，数据库名 `admin_template`。
- JWT：`jsonwebtoken` 签发 Access Token 和 Refresh Token。
- Winston：应用日志、错误日志、访问日志。
- 服务端口：`3000`。

## 3. 命令

在 `templates/pc-admin` 或 generated project 根目录执行：

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm kit:check
pnpm kit:stage -- advance requirements-draft --by user --quote "<用户原话>"
```

前端子包：

```bash
pnpm --filter fullstack-admin-frontend dev
pnpm --filter fullstack-admin-frontend build
pnpm --filter fullstack-admin-frontend typecheck
```

后端子包：

```bash
pnpm --filter fullstack-admin-backend dev
pnpm --filter fullstack-admin-backend build
pnpm --filter fullstack-admin-backend typecheck
```

数据库：

```bash
docker compose up -d mysql
```

## 4. 项目结构

```text
workflow/                 -> 阶段产物，本文件是 requirements-draft 草案
SPECS/API.md              -> 唯一前后端共享 API 契约
SPECS/DATABASE.md         -> MySQL 数据库设计
SPECS/requirements/       -> 13 个模块级需求来源
frontend/                 -> Vue 3 SPA
frontend/SPECS/API.md     -> 只能引用 ../../SPECS/API.md
backend/                  -> Fastify API 服务
backend/SPECS/API.md      -> 只能引用 ../../SPECS/API.md
tasks/                    -> 需求确认后的任务拆解
memory/                   -> 方案选择和重要决策记录
```

## 5. 通用产品规则

- 所有非公开页面和非公开 API 必须依赖登录态。
- 成功响应统一为 `{ success: true, data }`。
- 失败响应统一为 `{ success: false, error: { code, message, details } }`。
- 分页响应统一返回 `items` 和 `pagination`。
- API 字段使用 `camelCase`，数据库字段使用 `lower_snake_case`，映射在服务层完成。
- 业务数据默认逻辑删除，日志表只追加。
- 第一阶段权限控制到菜单级；按钮级和接口级权限只保留扩展字段。
- 前端 VO 字段和后端响应 JSON 字段必须以 `SPECS/API.md` 为准。

## 6. API 契约摘要

开发环境后端 Base URL 为 `http://localhost:3000`。前端通过 `/api` 代理访问后端，后端路由本身不强制包含 `/api` 前缀。

公开接口：

- `POST /login`
- `POST /refresh-token`

登录态接口：

- `POST /logout`
- `GET /auth/me`
- `GET /get-async-routes`
- `GET /dashboard/overview`
- `/users`
- `/roles`
- `/menus`
- `/departments`
- `/posts`
- `/dict-types`
- `/dict-items`
- `/attachments`
- `/messages`
- `/logs`
- `/system-configs`
- `/profile`

错误码至少覆盖：

- `BAD_REQUEST`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `VALIDATION_ERROR`
- `INTERNAL_ERROR`
- `USER_DISABLED`
- `INVALID_CREDENTIALS`
- `ROLE_IN_USE`
- `DEPARTMENT_IN_USE`
- `POST_IN_USE`
- `UNSUPPORTED_PREVIEW_TYPE`
- `INVALID_OLD_PASSWORD`
- `PASSWORD_CONFIRM_MISMATCH`
- `PASSWORD_UNCHANGED`

## 7. 数据库合同摘要

数据库采用 MySQL 8.0，后端通过 `mysql2` 连接池访问。

核心表：

- 组织与用户：`departments`、`posts`、`users`。
- 权限：`roles`、`user_roles`、`menus`、`role_menus`。
- 字典与配置：`dict_types`、`dict_items`、`system_configs`。
- 附件与消息：`attachments`、`messages`。
- 日志审计：`login_logs`、`operation_logs`、`exception_logs`。

默认预置数据：

- 部门：管理部、运营部。
- 岗位：管理员、运营人员、审核人员、普通用户。
- 角色：`SUPER_ADMIN`、`OPERATOR`、`COMMON_USER`。
- 配置：系统名称、登录页标题、上传大小限制、允许上传类型、Access Token 有效期、Refresh Token 有效期。

关键约束：

- `users.user_code`、`users.login_name` 唯一。
- `roles.role_code` 唯一。
- `menus.menu_code` 唯一。
- `departments.dept_code`、`posts.post_code` 唯一。
- `dict_types.dict_code` 唯一。
- `dict_items(dict_type_id, item_value, deleted)` 唯一。
- `system_configs.config_code` 唯一。
- `user_roles(user_id, role_id, deleted)` 唯一。
- `role_menus(role_id, menu_id, deleted)` 唯一。

## 8. 模块需求

### 8.1 登录认证

目标：提供登录、退出、刷新 Token、当前用户初始化和动态路由入口。

页面与交互：

- 登录页包含系统名称、登录名、密码、记住登录状态和登录按钮。
- 登录失败展示明确错误，包括账号停用、密码错误。
- 登录成功进入首页工作台。
- 顶部栏提供退出登录入口。

业务规则：

- 用户状态停用时不允许登录。
- 密码必须按 `password_hash` 校验，数据库不得保存明文密码。
- 登录成功返回 Access Token、Refresh Token、用户信息、角色编码、权限数组和过期时间。
- Access Token 过期后允许用 Refresh Token 换取新 Token。
- 退出登录后前端必须清除 Token、用户信息、角色和菜单缓存。
- 前端启动后调用当前用户信息接口，返回用户基础信息、角色集合和可访问菜单树。
- Token 无效、刷新失败或用户被停用时跳转回登录页。
- 登录成功和失败都必须写入登录日志。

Demo 验收：

- 提供至少一个超级管理员账号和一个普通用户账号。
- 能验证登录成功、密码错误、账号停用和退出登录。
- 切换账号能体现菜单权限差异。
- 所有业务页面必须依赖登录态访问。

### 8.2 首页工作台

目标：展示当前登录用户的工作概览。

展示内容：

- 我的待办数量。
- 未读消息数量。
- 最近操作记录。
- 系统公告列表。
- 管理员统计：用户数、角色数、菜单数、今日登录数、接口异常数。

业务规则：

- 首页统计按当前用户权限范围展示。
- 普通用户不能看到管理员统计区。
- 未读消息数量来自消息中心。
- 最近操作记录来自操作日志。
- 系统公告复用消息中心，不单独强制建设公告维护模块。

Demo 验收：

- 首页加载后展示真实接口返回数据，不使用前端 Mock。
- 切换账号后首页统计和菜单展示发生变化。
- 点击未读消息可进入消息中心。
- 最近操作能反映当前账号新增、修改、删除等关键动作。

### 8.3 用户管理

目标：维护可登录用户的基础资料、组织归属、岗位、状态和角色集合。

查询条件：

- 用户工号、登录名、中文姓名、手机号、所属部门、岗位、用户状态。

列表字段：

- 用户工号、登录名、中文姓名、手机号、邮箱、所属部门、岗位、用户状态、创建时间、操作。

维护字段：

- 用户工号、登录名、密码、中文姓名、手机号、邮箱、所属部门、岗位、用户状态、角色集合。

业务规则：

- 支持新增、编辑、查看、启用、停用、重置密码和删除用户。
- 用户工号和登录名必须唯一。
- 密码必须加密存储。
- 一个用户可以拥有多个角色。
- 停用用户不允许登录。
- 用户删除采用逻辑删除，历史日志仍可展示用户名称。
- 已停用角色不可继续分配给新用户。
- 修改用户角色后，下次获取当前用户信息时必须返回新的角色和菜单范围。

Demo 验收：

- 用户列表支持分页、查询和重置。
- 新增、编辑、启用、停用、重置密码可交互。
- 修改用户角色后切换该账号登录，能体现菜单权限变化。

### 8.4 角色管理

目标：维护权限分组，通过角色关联用户和菜单。

查询条件：

- 角色名称、角色编码、角色状态。

列表字段：

- 角色名称、角色编码、角色状态、角色说明、用户数量、创建时间、操作。

维护字段：

- 角色名称、角色编码、角色状态、角色说明。

业务规则：

- 支持新增、编辑、查看、启用、停用和删除角色。
- 角色编码必须唯一。
- 停用角色不参与菜单授权计算。
- 已被用户使用的角色不允许物理删除，只能停用或逻辑删除。
- 超级管理员角色默认拥有全部菜单访问能力。
- 角色详情页支持查看该角色下的用户。
- 支持为角色批量分配用户或移除用户。
- 一个角色可以包含多个用户，一个用户可以属于多个角色。

Demo 验收：

- 角色列表支持查询、分页和状态切换。
- 角色下用户维护可交互。
- 停用角色后切换账号登录，菜单范围重新计算。

### 8.5 菜单权限

目标：维护系统菜单、前端动态路由和角色菜单授权关系，实现菜单级权限控制。

页面结构：

- 菜单树。
- 菜单详情表单。
- 角色授权区。

维护字段：

- 菜单名称、菜单编码、父级菜单、菜单图标、菜单排序、路由地址、组件路径、显示状态、菜单状态、可访问角色。

业务规则：

- 菜单支持多级结构。
- 菜单编码必须唯一。
- 同一父级下按排序号展示。
- 隐藏菜单不在侧边栏展示，但仍可作为路由能力预留。
- 停用菜单不参与授权菜单树生成。
- 登录后根据用户角色生成可访问菜单树。
- 前端根据菜单树动态生成侧边栏和页面路由。
- 未授权菜单不能在前端展示，未授权接口需要在后端拦截。

Demo 验收：

- 菜单树支持新增、编辑、停用和排序。
- 菜单授权角色后，切换账号能体现菜单差异。
- 超级管理员默认看到全部可用菜单。

### 8.6 部门管理

目标：维护用户所属部门，为人员归属、查询筛选和后续数据范围控制提供基础数据。

查询条件：

- 部门编码、部门名称、部门状态。

列表字段：

- 部门编码、部门名称、部门状态、创建时间、操作。

维护字段：

- 部门编码、部门名称、部门状态、部门说明。

业务规则：

- 第一阶段只支持单层级部门结构。
- 部门编码必须唯一。
- 停用部门不可分配给新增用户。
- 已被用户引用的部门不允许物理删除。
- 历史用户和日志需要继续展示部门名称。
- 后续可扩展为多级部门结构和数据范围控制。

Demo 验收：

- 支持新增、编辑、启用、停用和删除部门。
- 用户管理中的部门下拉选项来自部门数据。
- 停用部门后不出现在新增用户表单中。

### 8.7 岗位管理

目标：维护人员岗位信息，描述用户在组织中的职责分类。

查询条件：

- 岗位名称、岗位编码、岗位状态。

列表字段：

- 岗位名称、岗位编码、岗位状态、岗位说明、创建时间、操作。

维护字段：

- 岗位名称、岗位编码、岗位状态、岗位说明。

业务规则：

- 岗位编码必须唯一。
- 常见岗位包括管理员、运营人员、审核人员、普通用户。
- 停用岗位不可分配给新增用户。
- 已被用户引用的岗位不允许物理删除。
- 岗位不直接决定菜单权限，菜单权限仍由角色控制。

Demo 验收：

- 支持新增、编辑、启用、停用和删除岗位。
- 用户管理中的岗位下拉选项来自岗位数据。
- 停用岗位后不出现在新增用户表单中。

### 8.8 数据字典

目标：统一维护系统常用状态、类型、来源、优先级、标签、开关值等枚举数据。

页面结构：

- 左侧字典类型列表。
- 右侧字典项列表。
- 字典类型维护表单。
- 字典项维护表单。

维护字段：

- 字典类型：编码、名称、状态、说明。
- 字典项：类型、值、标签、排序、状态、说明。

业务规则：

- 字典类型编码必须唯一。
- 同一字典类型下字典值必须唯一。
- 字典项按排序号升序展示。
- 停用字典项不应继续出现在新增表单中。
- 历史数据引用的停用字典项仍需要正常展示标签。
- 删除字典类型前必须确认无启用字典项。

Demo 验收：

- 支持字典类型新增、编辑、启用、停用。
- 支持字典项新增、编辑、排序、启用、停用。
- 用户状态、角色状态、菜单显示状态等选项可来自字典数据。

### 8.9 文件附件

目标：提供统一文件上传、附件元数据管理、图片预览和文档下载能力。

上传字段：

- 文件名称、文件类型、文件大小、文件内容、业务模块、业务记录 ID。

附件元数据：

- 附件 ID、原始文件名、存储文件名、文件地址、文件类型、文件大小、上传人、上传时间、业务模块、业务记录 ID。

业务规则：

- 文件上传必须要求用户已登录。
- 仅允许上传常见办公文档和图片格式。
- 禁止上传可执行文件、脚本文件等危险类型。
- 文件大小受系统配置限制。
- 业务模块可以通过附件 ID 或附件 URL 引用文件。
- 图片类附件支持页面预览。
- 文档类附件支持下载。
- 未登录用户不能直接通过 URL 访问文件。

安全规则：

- 后端必须校验文件后缀和 MIME 类型。
- 文件存储名不得直接使用用户上传的原始文件名。
- 文件访问需要基于登录态进行权限控制。
- 删除业务记录时，附件默认保留元数据并标记为未引用或逻辑删除。

Demo 验收：

- 支持上传图片和办公文档。
- 支持图片预览和文档下载。
- 上传成功后返回附件 ID、URL 和基础元数据。
- 上传危险文件类型时返回明确错误提示。

### 8.10 消息中心

目标：提供站内消息能力，支持系统公告、待办提醒、处理结果通知等消息的查询、未读标识和已读处理。

查询条件：

- 消息标题、消息类型、已读状态、发送时间。

列表字段：

- 消息标题、消息类型、消息摘要、已读状态、发送时间、操作。

消息字段：

- 接收人、消息标题、消息内容、消息类型、已读状态、发送时间、阅读时间。

业务规则：

- 用户只能查看自己的消息。
- 未读消息需要在首页和顶部栏醒目标识。
- 用户可以将单条消息标记为已读。
- 用户可以批量标记当前页或全部消息为已读。
- 已读后不再显示未读标记。
- 后续业务模块可以调用消息中心发送待办或结果通知。

Demo 验收：

- 支持未读消息数量展示。
- 支持查看详情、标记已读和批量已读。
- 首页未读数量与消息中心状态联动。
- 切换账号后只能看到当前账号消息。

### 8.11 日志审计

目标：记录用户登录、关键业务操作、接口访问异常和系统错误。

页面结构：

- 登录日志页。
- 操作日志页。
- 异常日志页。

日志字段：

- 登录日志：登录用户、登录名、登录时间、登录 IP、登录结果、失败原因。
- 操作日志：操作人、操作时间、操作模块、操作类型、请求方法、请求路径、请求参数、操作结果、错误信息。
- 异常日志：发生时间、接口路径、请求方法、错误类型、错误信息、堆栈摘要、处理状态。

业务规则：

- 登录成功和登录失败均需记录登录日志。
- 新增、修改、删除、审核、导入、导出等关键动作需记录操作日志。
- 接口异常和系统错误需记录异常日志。
- 敏感字段如密码、Token 不得明文写入日志。
- 日志默认只允许查询，不允许普通用户删除或修改。
- 超级管理员可按时间范围查询日志。

Demo 验收：

- 登录、退出、用户维护、角色维护、菜单授权等动作能生成操作日志。
- 日志列表支持查询、分页和详情查看。
- 异常日志可通过模拟失败接口或错误操作展示。

### 8.12 系统配置

目标：维护系统名称、登录页标题、文件上传限制、Token 有效期等基础参数。

查询条件：

- 配置编码、配置名称、配置状态。

列表字段：

- 配置编码、配置名称、配置值、配置状态、配置说明、更新时间、操作。

维护字段：

- 配置编码、配置名称、配置值、配置状态、配置说明。

业务规则：

- 配置编码必须唯一。
- 配置项支持启用和停用。
- 配置变更需要记录操作日志。
- 第一阶段采用数据库配置。
- 第一阶段不强制复杂动态热更新。
- 运行态敏感配置变更可在下次服务启动或下次读取时生效。

预置配置：

- 系统名称、登录页标题、文件上传大小限制、允许上传文件类型、Access Token 有效期、Refresh Token 有效期。

Demo 验收：

- 支持配置项查询、编辑、启用和停用。
- 修改系统名称后，首页顶部栏或登录页标题可体现变化。
- 修改文件上传限制后，附件上传校验按新配置执行。

### 8.13 个人信息

目标：为登录用户提供个人资料查看和修改密码能力。

展示信息：

- 用户工号、登录名、中文姓名、手机号、邮箱、所属部门、岗位、用户状态、角色集合。

可维护信息：

- 登录密码。

修改密码规则：

- 必须输入原密码。
- 新密码与确认密码必须一致。
- 新密码不能与原密码相同。
- 新密码需要加密保存。
- 修改密码成功后，应要求用户重新登录或刷新 Token。

Demo 验收：

- 支持查看当前登录用户资料。
- 支持修改密码，并用新密码重新登录。
- 修改密码失败时返回明确提示。

## 9. 字段映射规则

服务层必须负责数据库字段和 API 字段映射。

| 数据库字段 | API 字段 | 说明 |
| --- | --- | --- |
| users.login_name | username | 登录名 |
| users.display_name | nickname | 中文姓名 |
| users.avatar_url | avatar | 头像 URL |
| departments.dept_name | deptName | 部门名称 |
| posts.post_name | postName | 岗位名称 |
| roles.role_code | roleCode | 角色编码 |
| roles.role_name | roleName | 角色名称 |
| menus.route_path | routePath | 路由地址 |
| menus.component_path | componentPath | 组件路径 |
| menus.meta_json | meta | 路由元数据 |
| attachments.file_url | url | 文件访问 URL |
| messages.read_status | readStatus | 已读状态 |
| operation_logs.operated_at | operatedAt | 操作时间 |

时间字段返回 ISO 8601 字符串。逻辑删除字段 `deleted` 默认不返回给前端。

## 10. 代码风格

前端组件默认使用 Vue 3 Composition API 和 `<script setup>`：

```vue
<script setup lang="ts">
import { ref } from "vue";

const loading = ref(false);

async function loadUsers() {
  loading.value = true;
  try {
    // call API through shared axios instance
  } finally {
    loading.value = false;
  }
}
</script>
```

后端模块默认按 route、service、db、utils 分层：

```ts
export async function listUsers(params: UserQuery) {
  const rows = await queryUsers(params);
  return rows.map(mapUserRowToVo);
}
```

命名约定：

- 前端变量、API 字段、DTO/VO 字段使用 `camelCase`。
- 数据库表和字段使用 `lower_snake_case`。
- 角色编码、配置编码、枚举编码使用大写下划线。
- 业务状态默认使用 `0` 停用、`1` 启用。

## 11. 测试与验收策略

### 11.1 文档阶段

- `workflow/requirements.md` frontmatter 必须保持 `status: draft`，直到用户明确确认需求。
- 不创建 `workflow/solution-options.md`，直到需求进入 `requirements-confirmed`。
- 不实现功能代码，直到进入 `implementation-ready`。

### 11.2 实现阶段

实现阶段的验收至少包括：

- 根目录 `pnpm typecheck` 通过。
- 根目录 `pnpm build` 通过。
- 后端关键接口能通过真实 MySQL 数据返回 `{ success, data }`。
- 前端登录、菜单加载、首页、用户/角色/菜单基础维护可跑通。
- Token 过期刷新、登录失效跳转、错误提示路径可验证。
- 权限差异能通过超级管理员账号和普通用户账号观察到。

### 11.3 数据验收

- 数据库包含默认部门、岗位、角色、菜单、配置和演示账号。
- 停用、逻辑删除、唯一约束、引用保护能触发对应错误码。
- 登录日志、操作日志、异常日志能被真实动作写入并查询。

## 12. 边界

Always：

- 保持 `SPECS/API.md` 作为唯一共享 API 契约。
- 保持 `frontend/SPECS/API.md` 和 `backend/SPECS/API.md` 只引用 `../../SPECS/API.md`。
- 新增或修改前后端字段时，同步检查 API 字段、VO 字段和数据库映射。
- 密码、Access Token、Refresh Token 不得明文写入日志。
- 所有业务数据删除默认使用逻辑删除。

Ask first：

- 修改数据库表结构、字段含义或唯一约束。
- 新增依赖，尤其是上传、鉴权、ORM、测试框架相关依赖。
- 改变 API 响应结构或路径兼容策略。
- 把按钮级或接口级权限纳入第一阶段强制实现。
- 引入多级部门、数据范围、多租户、审批流等扩展能力。

Never：

- 在需求未确认前创建方案文件。
- 在方案未选择前创建 implementation-ready 文件。
- 在 implementation-ready 前实现功能代码。
- 保存明文密码或明文 Token。
- 删除日志审计数据。
- 用前端 Mock 冒充真实接口联调结果。

## 13. 成功标准

需求草案确认前：

- 本文件保留 `status: draft`。
- 13 个模块均在本文件中有明确目标、业务规则和 Demo 验收。
- API 通用响应、鉴权、分页、错误码和核心接口范围已沉淀。
- 数据库核心表、唯一约束、预置数据和字段映射已沉淀。
- 开放问题明确列出，供用户确认。

后续实现完成时：

- 前端 `8848` 可启动并通过 `/api` 代理访问后端。
- 后端 `3000` 可启动并连接 `admin_template`。
- 超级管理员和普通用户可登录，菜单权限不同。
- 用户、角色、菜单、部门、岗位、字典、配置至少具备基础 CRUD 或维护能力。
- 首页、消息、日志、附件、个人信息具备可演示闭环。
- 全链路不依赖前端 Mock 数据。

## 14. 开放问题

1. 附件上传真实实现是否允许新增 `@fastify/multipart` 依赖？当前后端依赖列表未包含 multipart 处理库。
2. 第一阶段是否需要实现后端接口级权限拦截，还是只保证菜单级权限和基础登录态拦截？
3. `workflow-state.json` 和 `scripts/kit.mjs` 在模板源目录中当前不存在，是否只在 `kit init` 生成项目时物化？如果模板源也要直接跑 `pnpm kit:check`，需要补齐这两个运行时文件。
4. 系统公告是否固定复用 `messages.message_type = NOTICE`，还是需要额外公告类型编码？
5. 文件物理存储位置、访问 URL 前缀和清理策略需要在技术方案阶段确认。
