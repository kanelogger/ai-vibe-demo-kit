---
description: AI 实现阶段的 Harness、契约、并行开发和隐性行为审查规则
globs:
alwaysApply: false
---

# AI 实现规则

适用于创建 feature SDD、进入 `implementation-ready` 后实现功能、或前后端并行开发。

## 参考实现先行

- 实现前必须先找最相似的已有模块，并在 feature spec 的 `Harness References` 中记录。
- 参考范围至少覆盖：前端页面/API client、后端 route/service、数据库表或 seed。
- 优先复制既有目录形态、命名、响应封装、分页、权限、错误处理和状态处理。
- 如果没有可复用参考，在 spec 中写明“无可用参考”和原因，再设计新形态。

## 共享契约先行

- 涉及接口或字段时，先更新根目录 `SPECS/API.md`，再改 `frontend/` 或 `backend/`。
- 每个端点必须记录请求参数、后端 JSON 响应字段、前端 VO 字段和字段映射说明。
- 前端 VO 字段和后端响应字段默认同名；不同名必须在 `SPECS/API.md` 显式记录映射。
- 涉及表结构时，先更新 `SPECS/DATABASE.md`，再改 `backend/db/schema.sql` 和 seed。

## 分工并行

- 契约任务或主 Agent 先更新根目录 `SPECS/API.md` 和必要的根级 workflow/tasks 文件。
- 前端实现 Agent 只改 `frontend/`，后端实现 Agent 只改 `backend/`；两端不能互改对方代码。
- 跨端事实只通过根目录契约文件同步，不通过口头约定或重复的本地 API 文档同步。
- 前端可先用 Mock 数据验证页面交互；Mock 必须来自 `SPECS/API.md` 和相近真实返回结构。
- 后端先独立通过类型检查和构建，再进入前后端联调。
- 联调只解决契约偏差、代理配置和端到端行为，不在联调阶段重新设计接口。

## 隐性行为审查

- Review 时必须列出从参考模块继承或复制的隐性行为，并判断保留、修改或删除。
- 重点检查：表单重置、默认值补齐、软删除、排序、权限过滤、审计字段、日期转换、空值处理、错误提示。
- 保留的隐性行为必须写回 spec、tasks 或 `SPECS/API.md`；不符合需求的隐性行为必须删除。
