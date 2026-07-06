---
description: 项目约定的代码结构规范
globs:
alwaysApply: true
---

# 项目结构规范

## 顶层目录

```text
templates/pc-admin/
├── frontend/        # 前端应用（Vue 3 + Vite）
├── backend/         # 后端 API 服务（Fastify）
├── SPECS/           # 跨端共享 API 契约
├── workflow/        # 阶段产物（requirements / solution / implementation-ready）
├── tasks/           # 根级任务板（backlog / sprint）
├── memory/          # 持久化的架构决策记录
├── scripts/         # 阶段门禁脚本
├── .agents/         # Agent 技能配置
└── rules/           # 本目录 — 项目规则
```

## 前端 `frontend/src/`

```text
src/
├── api/             # HTTP 请求封装，按业务模块划分文件
├── components/      # 公共组件，PascalCase 命名
├── config/          # 应用配置常量
├── directives/      # 自定义指令（auth / copy / perms / ripple 等）
├── layout/          # 布局组件及 hooks
├── plugins/         # 插件注册（echarts / elementPlus）
├── router/          # 路由配置，按模块拆分
├── store/           # Pinia store，按功能模块划分
├── style/           # 全局样式（scss + tailwind + element-plus 覆写）
├── utils/           # 工具函数（http / localforage / mitt / tree 等）
├── views/           # 页面组件，按业务模块划分子目录
├── App.vue
└── main.ts
```

## 后端 `backend/src/`

```text
src/
├── routes/          # Fastify 路由注册，按业务模块划分
├── services/        # 业务逻辑层
├── db/              # 数据库连接与初始化
├── config/          # 配置常量（环境变量集中管理）
├── loaders/         # 服务启动加载器（如 Winston）
├── utils/           # 工具函数（password / jwt / date / enums）
├── app.ts           # Fastify 实例创建与插件注册
└── server.ts        # 入口，监听端口
```

## SPECS 目录

```text
SPECS/
├── API.md                       # 唯一前后端共享 API 契约
├── DATABASE.md                  # 数据库设计文档
├── README.md                    # SPECS 结构与映射规则
├── requirements/                # 按模块拆分的需求文档（01-13）
└── sample-feature-walkthrough.md  # 示例：从需求到实现的全流程
```

- `frontend/SPECS/API.md` 和 `backend/SPECS/API.md` **只能引用** `../../SPECS/API.md`，不得独立描述 API。
- 前端 VO 字段名和后端响应 JSON 字段名必须与 `SPECS/API.md` 一致。

## rules 目录

- `core.md`：通用回复和风格规则。
- `project-structure.md`：目录边界和文件归属规则。
- `ai-implementation.md`：实现阶段必须遵守的参考实现、共享契约、并行分工和隐性行为审查规则。

## workflow 目录

```text
workflow/
├── README.md
├── requirements.md        # requirements-draft / confirmed
├── solution-options.md    # 包含三个候选方案
├── solution-selected.md   # 用户选择的方案
└── implementation-ready.md
```

- 阶段顺序：initialized → requirements-draft → requirements-confirmed → solution-options → solution-selected → implementation-ready
- 不得跳过阶段，使用 `pnpm kit:stage` 推进。
