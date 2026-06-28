---
description: 前端开发规则（Vue 3 + Vite + Element Plus + Tailwind CSS）
globs: frontend/**/*
alwaysApply: true
---

# 前端开发规则

## 职责边界

- 工作范围限制在 `frontend/` 内，**不得修改后端代码**。
- 读取 `../SPECS/API.md` 中的共享 API 契约作为接口事实源。
- `frontend/SPECS/API.md` **只能引用** `../../SPECS/API.md`，不得独立定义 API。
- 根目录阶段进入 `implementation-ready` 前，**不得实现功能代码**。

## 技术栈约束

- 框架：Vue 3.5+，**强制使用 Composition API + `<script setup lang="ts">`**。
- UI 库：Element Plus 2.11+，禁止混用其他 UI 库。
- CSS：Tailwind CSS 4 + Sass，优先 Tailwind 工具类，组件特定样式用 scoped SCSS。
- 状态管理：Pinia 3，store 文件必须放在 `src/store/modules/`。
- HTTP：使用 `src/utils/http/` 中的 Axios 实例，禁止直接 import axios。

## 组件开发

- 新组件必须用 TypeScript，定义 Props 类型。
- 复用项目已有的公共组件（`Re*`、`Pure*` 前缀）。
- 自定义指令统一放在 `src/directives/`，在 `src/directives/index.ts` 注册。

## 路由与权限

- 路由放在 `src/router/modules/`，用懒加载。
- 权限控制使用 `src/directives/auth/` 和 `src/directives/perms/`，不自行实现权限逻辑。
- 使用 `src/router/utils.ts` 中已有的路由工具函数。

## API 请求

- API 声明放在 `src/api/`，按业务模块划分文件：`src/api/user.ts`、`src/api/role.ts`。
- 使用 `@/utils/http` 导出的 `http` 实例，统一拦截器已配置。
- 请求参数和响应类型必须与 `SPECS/API.md` 中的字段一致。

## 样式约定

- 不要在全局样式中覆盖组件库样式——用 Element Plus 的 CSS 变量。
- 暗色模式相关样式统一放在 `src/style/dark.scss`。
- 主题 Token 统一放在 `src/style/theme.scss`。

## 禁止事项

- 禁止使用 Options API。
- 禁止直接操作 DOM（`$refs`、`$parent`、`document.querySelector`）。
- 禁止在 `v-for` 和 `v-if` 同级元素上同时使用。
- 禁止引入新的 UI 库替代 Element Plus。
- 禁止在 `src/api/` 以外的地方直接调用 axios。
