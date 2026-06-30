---
title: "Sprint 03: Foundation Modules - 可执行技术文档"
status: ready
dependsOn: tasks/sprint-02.md
solution: C
---

# Sprint 03: Foundation Modules

## 目标

在 Sprint 02 的用户、角色、菜单 CRUD 模式基础上，批量落地后台模板的基础维护模块：

1. 部门管理。
2. 岗位管理。
3. 数据字典。
4. 系统配置。
5. 个人信息与修改密码。

Sprint 03 完成后，后续附件、消息、日志审计和首页工作台可以直接复用同一套列表、弹窗、状态切换、逻辑删除和真实 MySQL API 模式。

## 范围

| 类别 | Sprint 03 包含 | Sprint 03 不包含 |
| --- | --- | --- |
| 后端 | `/departments`、`/posts`、`/dict-types`、`/dict-items`、`/system-configs`、`/profile` REST API | 文件上传、消息中心、日志审计详情页、首页统计 |
| 前端 | 部门、岗位、字典、配置、个人信息页面 | 附件、消息、日志、首页工作台页面 |
| 数据库 | 复用现有 schema/seed | 新增迁移框架 |
| 验证 | typecheck、build、基础 curl/API smoke | 自动化 E2E |

## 执行顺序

```text
Task 0 Sprint 02 基线确认
  -> Task 1 部门管理 CRUD
  -> Task 2 岗位管理 CRUD
  -> Task 3 数据字典 CRUD
  -> Task 4 系统配置 CRUD
  -> Task 5 个人信息与修改密码
  -> Checkpoint Sprint 03 验收
```

## Task 0: Sprint 02 基线确认

### Acceptance

- [ ] `git status --short` 无输出。
- [ ] 前后端 typecheck 通过。
- [ ] 前后端 build 通过。

### Verify

```bash
git status --short
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-backend build
pnpm --filter fullstack-admin-frontend build
```

## Task 1: 部门管理 CRUD

### 后端

- `GET /departments`
- `GET /departments/options`
- `POST /departments`
- `GET /departments/:id`
- `PATCH /departments/:id`
- `PATCH /departments/:id/status`
- `DELETE /departments`

### 前端

- `frontend/src/views/system/dept/index.vue`
- 查询：部门编码、部门名称、状态。
- 操作：新增、编辑、启用/停用、删除。

### Acceptance

- [ ] 部门可分页查询。
- [ ] 部门编码唯一冲突返回 `CONFLICT`。
- [ ] 已被用户引用的部门删除返回 `DEPARTMENT_IN_USE`。
- [ ] 用户管理的部门下拉继续来自 `/departments/options`。

## Task 2: 岗位管理 CRUD

### 后端

- `GET /posts`
- `GET /posts/options`
- `POST /posts`
- `GET /posts/:id`
- `PATCH /posts/:id`
- `PATCH /posts/:id/status`
- `DELETE /posts`

### 前端

- `frontend/src/views/system/post/index.vue`
- 查询：岗位编码、岗位名称、状态。
- 操作：新增、编辑、启用/停用、删除。

### Acceptance

- [ ] 岗位可分页查询。
- [ ] 岗位编码唯一冲突返回 `CONFLICT`。
- [ ] 已被用户引用的岗位删除返回 `POST_IN_USE`。
- [ ] 用户管理的岗位下拉继续来自 `/posts/options`。

## Task 3: 数据字典 CRUD

### 后端

- `GET /dict-types`
- `POST /dict-types`
- `GET /dict-types/:id`
- `PATCH /dict-types/:id`
- `PATCH /dict-types/:id/status`
- `DELETE /dict-types/:id`
- `GET /dict-types/:id/items`
- `POST /dict-types/:id/items`
- `PATCH /dict-items/:id`
- `PATCH /dict-items/:id/status`
- `PATCH /dict-items/batch-sort`
- `DELETE /dict-items/:id`
- `GET /dict-types/by-code/:dictCode/options`

### 前端

- `frontend/src/views/system/dict/index.vue`
- 左侧字典类型，右侧字典项。
- 支持类型和字典项的新增、编辑、状态切换、删除。

### Acceptance

- [ ] 字典类型可维护。
- [ ] 字典项可按类型维护。
- [ ] `/dict-types/by-code/:dictCode/options` 返回启用字典项。

## Task 4: 系统配置 CRUD

### 后端

- `GET /system-configs`
- `POST /system-configs`
- `GET /system-configs/:id`
- `PATCH /system-configs/:id`
- `PATCH /system-configs/:id/status`
- `DELETE /system-configs/:id`
- `GET /system-configs/by-code/:configCode/value`

### 前端

- `frontend/src/views/system/config/index.vue`
- 查询：配置编码、配置名称、状态。
- 操作：新增、编辑、启用/停用、删除。

### Acceptance

- [ ] 配置可维护。
- [ ] 配置编码唯一冲突返回 `CONFLICT`。
- [ ] 按编码读取配置可用于后续前端展示系统名称。

## Task 5: 个人信息与修改密码

### 后端

- `GET /profile`
- `PATCH /profile`
- `POST /profile/change-password`

### 前端

- `frontend/src/views/profile/index.vue`
- `frontend/src/views/profile/change-password/index.vue`

### Acceptance

- [ ] 当前用户可查看并编辑昵称、手机号、邮箱、头像。
- [ ] 修改密码校验原密码。
- [ ] 新密码与确认密码不一致返回 `PASSWORD_CONFIRM_MISMATCH`。
- [ ] 新密码与旧密码相同返回 `PASSWORD_UNCHANGED`。

## Checkpoint: Sprint 03 验收

```bash
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-backend build
pnpm --filter fullstack-admin-frontend build
```

### 完成标准

- [ ] 部门、岗位、字典、配置、个人信息都有真实前后端实现。
- [ ] 用户管理依赖的部门/岗位/角色下拉不回退。
- [ ] 全量 typecheck/build 通过。
- [ ] Sprint 03 diff 经 review 后独立提交。
