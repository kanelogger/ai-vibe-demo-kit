---
description: Vue 3 开发规范（Composition API + Element Plus + Tailwind CSS）
globs: frontend/src/**/*.vue
alwaysApply: false
---

# Vue 开发规范

## 基础约定

- 使用 `<script setup lang="ts">` 语法糖，所有 Vue 组件必须使用 TypeScript。
- 使用组合式 API（Composition API），禁止使用 Options API。
- 组件文件使用单文件组件（SFC）格式。
- 样式优先使用 `scoped` CSS，或 Tailwind CSS 工具类。

## 组件命名

- 组件名始终使用多词组合（PascalCase），避免与 HTML 元素冲突：`UserProfile.vue`、`MenuTree.vue`。
- 公共组件使用特定前缀：`Re*`（如 `ReDialog`、`ReText`）、`Pure*`（如 `PureIcon`、`PureAvatar`）。
- 页面组件放在 `views/`，业务子目录用 kebab-case：`views/user-management/UserList.vue`。

## 组件结构顺序

```vue
<script setup lang="ts">
// 1. 导入（imports）
// 2. Props 定义
// 3. Emits 定义
// 4. 组合式函数（hooks）
// 5. 响应式状态
// 6. 计算属性
// 7. 方法
// 8. 生命周期钩子
// 9. defineExpose（如需要）
</script>

<template>
  <!-- 模板 -->
</template>

<style scoped>
/* 组件样式 */
</style>
```

## Props 规范

- Prop 名使用 camelCase，使用 TypeScript 泛型或 `vue-types` 声明类型与默认值。
- 数组/对象默认值使用工厂函数返回。
- 优先从 `@/utils/propTypes` 复用已有的 Prop 类型定义。

## 样式指南

- 组件特定样式使用 `scoped`，全局样式放在 `src/style/`。
- Element Plus 主题覆写放在 `src/style/element-plus.scss`。
- Tailwind 工具类用于布局、间距、颜色，避免手写大量自定义 CSS。
- 暗色模式样式放在 `src/style/dark.scss`，通过 CSS 变量实现。

## 状态管理

- 使用 Pinia 进行状态管理，store 按功能模块划分在 `src/store/modules/`。
- 使用 `storeToRefs` 解构响应式状态。
- store 类型定义统一放在 `src/store/types.ts`。

## 路由

- 路由配置按模块拆分在 `src/router/modules/`。
- 路由名称使用 PascalCase，与组件名对应。
- 大型页面使用懒加载：`() => import("@/views/...")`。
- 路由守卫逻辑放在 `src/router/utils.ts`。

## API 请求

- HTTP 请求封装放在 `src/api/`，按业务模块划分文件。
- 使用 `src/utils/http/` 中的 Axios 实例，不直接 import axios。
- 请求参数和响应类型必须显式声明 TypeScript 类型。

## 性能

- 频繁切换的元素使用 `v-show` 替代 `v-if`。
- 使用 `@vueuse/core` 工具函数替代手动实现常见模式。
- 使用 `keep-alive` 缓存需要频繁切换的页面。
- `v-for` 必须提供唯一 `key`。
- 不在同一元素上同时使用 `v-if` 和 `v-for`。
