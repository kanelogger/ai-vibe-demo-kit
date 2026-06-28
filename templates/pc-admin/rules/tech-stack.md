---
description: 项目所使用的技术栈以及官方文档
globs:
alwaysApply: true
---

# 技术栈规范

## 前端

| 类别 | 技术 | 版本 | 文档 |
| --- | --- | --- | --- |
| 框架 | Vue 3 (Composition API + `<script setup>`) | ^3.5 | https://vuejs.org/ |
| 构建 | Vite | ^7.1 | https://vitejs.dev/ |
| 语言 | TypeScript | — | https://www.typescriptlang.org/ |
| UI 组件库 | Element Plus | ^2.11 | https://element-plus.org/ |
| CSS 工具 | Tailwind CSS | ^4.1 | https://tailwindcss.com/ |
| CSS 预处理器 | Sass | ^1.93 | https://sass-lang.com/ |
| 状态管理 | Pinia | ^3.0 | https://pinia.vuejs.org/ |
| 路由 | Vue Router | ^4.6 | https://router.vuejs.org/ |
| HTTP 客户端 | Axios | ^1.12 | https://axios-http.com/ |
| 图表 | ECharts | ^6.0 | https://echarts.apache.org/ |
| 图标 | Iconify | — | https://iconify.design/ |
| 工具库 | VueUse | ^14.0 | https://vueuse.org/ |
| 日期 | Day.js | ^1.11 | https://day.js.org/ |
| 表格增强 | @pureadmin/table | ^3.3 | https://pureadmin-table.pages.dev/ |

## 后端

| 类别 | 技术 | 版本 | 文档 |
| --- | --- | --- | --- |
| 运行时 | TypeScript (ts-node) | ^10.9 | https://typestrong.org/ts-node/ |
| 框架 | Fastify | ^5.0 | https://fastify.dev/ |
| 数据库 | MySQL (mysql2) | ^3.11 | https://github.com/sidorares/node-mysql2 |
| 认证 | JWT (jsonwebtoken) | ^8.5 | https://github.com/auth0/node-jsonwebtoken |
| 日志 | Winston | ^3.8 | https://github.com/winstonjs/winston |
| 跨域 | @fastify/cors | ^10.0 | https://github.com/fastify/fastify-cors |
| 热重载 | nodemon | ^2.0 | https://nodemon.io/ |

## 工程化

| 类别 | 技术 | 说明 |
| --- | --- | --- |
| 包管理 | pnpm (workspace) | monorepo，frontend + backend 两个包 |
| Node | ^20.19 \|\| >=22.13 | 运行环境最低版本 |
