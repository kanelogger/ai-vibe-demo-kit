---
title: "Sprint 04: Operations, Logs and Dashboard - 可执行技术文档"
status: ready
dependsOn: tasks/sprint-03.md
solution: C
---

# Sprint 04: Operations, Logs and Dashboard

## 目标

在 Sprint 03 基础维护模块完成后，补齐后台模板的运营与审计闭环：

1. 附件管理。
2. 消息中心。
3. 登录日志、操作日志、异常日志。
4. 首页工作台概览。

Sprint 04 完成后，`templates/pc-admin` 的后台模板具备登录、菜单、系统基础维护、运营消息、文件附件、审计日志和首页概览的完整 demo 级业务闭环。

## 范围

| 类别 | Sprint 04 包含 | Sprint 04 不包含 |
| --- | --- | --- |
| 后端 | `/attachments`、`/messages`、`/logs/*`、`/dashboard/overview` | 复杂对象存储、消息推送、日志归档 |
| 前端 | 附件、消息、登录日志、操作日志、异常日志、首页概览页面 | 自动化 E2E、富文本消息编辑器 |
| 数据库 | 复用现有 schema/seed | 新增迁移框架 |
| 验证 | typecheck、build、基础 API smoke | 生产级权限矩阵 |

## 执行顺序

```text
Task 0 Sprint 03 基线确认
  -> Task 1 附件管理
  -> Task 2 消息中心
  -> Task 3 日志审计页面与异常日志基础
  -> Task 4 首页工作台概览
  -> Checkpoint Sprint 04 验收
```

## Task 0: Sprint 03 基线确认

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

## Task 1: 附件管理

### 后端

- `POST /attachments`
- `GET /attachments`
- `GET /attachments/:id/download`
- `GET /attachments/:id/preview`
- `DELETE /attachments/:id`

### 前端

- `frontend/src/views/operation/attachment/index.vue`
- 支持上传、查询、下载、预览图片、删除。

### Acceptance

- [ ] 上传附件后写入 `attachments`。
- [ ] 附件列表可按文件名、业务模块分页查询。
- [ ] 非图片预览返回 `UNSUPPORTED_PREVIEW_TYPE`。
- [ ] 删除采用逻辑删除。

## Task 2: 消息中心

### 后端

- `GET /messages`
- `GET /messages/:id`
- `PATCH /messages/:id/read`
- `PATCH /messages/read`
- `GET /messages/unread-count`

### 前端

- `frontend/src/views/operation/message/index.vue`
- 支持查询、查看详情、单条已读、批量已读。

### Acceptance

- [ ] 当前用户只能查看自己的消息。
- [ ] 单条和批量已读会更新 `read_status` 与 `read_at`。
- [ ] 未读数量接口返回当前用户未读数。

## Task 3: 日志审计

### 后端

- `GET /logs/login`
- `GET /logs/operation`
- `GET /logs/exception`
- `GET /logs/login/:id`
- `GET /logs/operation/:id`
- `GET /logs/exception/:id`

### 前端

- `frontend/src/views/log/login-log/index.vue`
- `frontend/src/views/log/operation-log/index.vue`
- `frontend/src/views/log/exception-log/index.vue`

### Acceptance

- [ ] 登录日志展示成功/失败记录。
- [ ] 操作日志展示已接入 CRUD 操作记录。
- [ ] 异常日志可查询和查看详情。

## Task 4: 首页工作台概览

### 后端

- `GET /dashboard/overview`

### 前端

- `frontend/src/views/welcome/index.vue`

### Acceptance

- [ ] 普通用户展示未读消息、最近操作、公告。
- [ ] 管理员展示用户数、角色数、菜单数、今日登录数、接口异常数。
- [ ] 首页加载失败时有明确错误态。

## Checkpoint: Sprint 04 验收

```bash
pnpm --filter fullstack-admin-backend typecheck
pnpm --filter fullstack-admin-frontend typecheck
pnpm --filter fullstack-admin-backend build
pnpm --filter fullstack-admin-frontend build
git diff --check
```

### 完成标准

- [ ] 附件、消息、日志、首页概览都有真实前后端实现。
- [ ] 全量 typecheck/build 通过。
- [ ] Sprint 04 diff 经 review 后按业务切片独立提交。
