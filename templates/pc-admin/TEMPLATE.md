# pc-admin Template

本文件是生成项目的模板地图。Agent 进入本工作区后，先读 `AGENTS.md` 确认阶段锁，再读本文件判断模板边界和扩展位置。

## 定位

`pc-admin` 是一个 PC 后台管理系统模板，不是一次性示例代码。它提供：

- Vue 3 + Vite + Element Plus 前端应用。
- Fastify + TypeScript + MySQL 后端 API 服务。
- 根目录阶段锁、共享契约、任务板、决策记录和规则文件。
- 已落地的基础后台模块，供后续业务功能按同一结构扩展。

## 顶层结构

```text
.
├── AGENTS.md              # 生成项目的最高优先级 Agent 规则
├── TEMPLATE.md            # 本文件，模板地图和扩展合同
├── workflow-state.json    # 阶段状态事实源，只能由 kit stage advance 修改
├── SPECS/                 # 跨端需求、API、数据库契约
├── workflow/              # 阶段产物
├── tasks/                 # backlog 与 sprint 计划
├── memory/                # 决策记录
├── rules/                 # 细分工程规则
├── frontend/              # 前端应用
├── backend/               # 后端应用
└── scripts/               # kit 运行时与兼容检查脚本
```

## 先读顺序

不同任务只装入必要上下文：

| 任务 | 先读文件 |
| --- | --- |
| 判断当前能做什么 | `workflow-state.json`、`AGENTS.md`、`workflow/README.md` |
| 写需求或方案 | `SPECS/requirements/`、`SPECS/API.md`、`workflow/README.md` |
| 改前端页面 | `frontend/AGENTS.md`、`rules/frontend.md`、`rules/vue.md`、对应 `frontend/src/views/**` |
| 改前端接口 | `SPECS/API.md`、`frontend/src/api/**`、`frontend/src/utils/http/index.ts` |
| 改后端接口 | `SPECS/API.md`、`backend/AGENTS.md`、`rules/backend.md`、对应 `backend/src/routes/**` 与 `backend/src/services/**` |
| 改数据库 | `SPECS/DATABASE.md`、`backend/db/schema.sql`、`backend/db/seed.sql` |
| 调整流程控制 | `AGENTS.md`、`workflow-state.json`、`scripts/kit.mjs`、`scripts/kit-runtime.mjs` |

## 阶段合同

阶段顺序固定：

```text
initialized
-> requirements-draft
-> requirements-confirmed
-> solution-options
-> solution-selected
-> implementation-ready
```

阶段事实源是 `workflow-state.json`。不要手动编辑它，使用：

```sh
pnpm kit:stage -- advance <stage> --by user --quote "<用户原话>"
```

阶段产物：

| 阶段 | 文件 | 要求 |
| --- | --- | --- |
| `requirements-draft` | `workflow/requirements.md` | frontmatter `status: draft` |
| `requirements-confirmed` | `workflow/requirements.md` | `status: confirmed`，包含用户确认字段 |
| `solution-options` | `workflow/solution-options.md` | `status: proposed`，正好 3 个 `optionIds` |
| `solution-selected` | `workflow/solution-selected.md` | `status: selected`，记录用户选择 |
| `implementation-ready` | `workflow/implementation-ready.md` | `status: ready`，实现前最终确认 |

`tasks/backlog.md` 只能在 `requirements-confirmed` 后创建。`tasks/sprint-01.md` 只能在 `implementation-ready` 后创建。

辅助命令：

| 命令 | 作用 |
| --- | --- |
| `pnpm kit:skills` | 读取 `.agents/skills.json`，列出 skill alias 和当前阶段推荐 |
| `pnpm kit:next` | 读取 `workflow-state.json`，输出下一步、推荐 skill 和应创建文件 |
| `pnpm kit:propose` | 创建 `workflow/requirements.md` 草稿骨架 |
| `pnpm kit:options` | 创建或校验 `workflow/solution-options.md`，要求正好 3 个方案 |
| `pnpm kit:sdd -- <feature-slug>` | 创建前后端 SDD 骨架 |

这些命令只做文件和状态编排，不执行 Agent skill，不替用户选择方案。`kit options` 只能在 `requirements-confirmed` 后创建方案文件；`kit sdd` 只能在 `solution-selected` 后创建 feature SDD。

## 控制文件合同

- `AGENTS.md`：阶段锁、硬停顿、共享 API 契约和默认 skill 链路。
- `TEMPLATE.md`：模板结构、扩展位置和文件边界。
- `rules/*.md`：工程规则。改代码前按任务类型读取对应规则。
- `SPECS/API.md`：唯一前后端共享 API 契约。
- `SPECS/DATABASE.md`：数据库设计事实源。
- `frontend/SPECS/API.md` 与 `backend/SPECS/API.md` 只能保留 `Source: ../../SPECS/API.md`。
- `frontend/SPECS/PRD.md`、`frontend/SPECS/ARCHITECTURE.md` 和 `frontend/SPECS/FEATURES/<feature-slug>/` 承接前端 SDD。
- `backend/SPECS/PRD.md`、`backend/SPECS/ARCHITECTURE.md` 和 `backend/SPECS/FEATURES/<feature-slug>/` 承接后端 SDD。

如果 API 字段、前端 VO 或后端响应有变化，先更新 `SPECS/API.md`，再改前后端代码。

## 已有模块

模板已覆盖这些后台基础模块：

| 模块 | 前端位置 | 后端位置 |
| --- | --- | --- |
| 登录认证 | `frontend/src/views/login/`、`frontend/src/api/user.ts` | `backend/src/routes/auth.ts`、`backend/src/services/auth.ts` |
| 首页工作台 | `frontend/src/views/welcome/` | `backend/src/routes/dashboard.ts`、`backend/src/services/dashboard.ts` |
| 用户管理 | `frontend/src/views/system/user/` | `backend/src/routes/user-management.ts`、`backend/src/services/user-management.ts` |
| 角色管理 | `frontend/src/views/system/role/` | `backend/src/routes/role-management.ts`、`backend/src/services/role-management.ts` |
| 菜单权限 | `frontend/src/views/system/menu/` | `backend/src/routes/menu-management.ts`、`backend/src/services/menu-management.ts` |
| 部门管理 | `frontend/src/views/system/dept/` | `backend/src/routes/org-management.ts`、`backend/src/services/org-management.ts` |
| 岗位管理 | `frontend/src/views/system/post/` | `backend/src/routes/org-management.ts`、`backend/src/services/org-management.ts` |
| 数据字典 | `frontend/src/views/system/dict/` | `backend/src/routes/dict-management.ts`、`backend/src/services/dict-management.ts` |
| 文件附件 | `frontend/src/views/operation/attachment/` | `backend/src/routes/attachments.ts`、`backend/src/services/attachments.ts` |
| 消息中心 | `frontend/src/views/operation/message/` | `backend/src/routes/messages.ts`、`backend/src/services/messages.ts` |
| 日志审计 | `frontend/src/views/log/` | `backend/src/routes/logs.ts`、`backend/src/services/log-management.ts`、`backend/src/services/operation-logs.ts` |
| 系统配置 | `frontend/src/views/system/config/` | `backend/src/routes/config-management.ts`、`backend/src/services/config-management.ts` |
| 个人信息 | `frontend/src/views/profile/` | `backend/src/routes/profile.ts` |

新增业务模块时，优先复制相近模块的目录形态，不新建平行架构。

## 前端扩展合同

前端目录：

```text
frontend/src/
├── api/          # HTTP API 封装
├── components/   # 公共组件
├── layout/       # 后台布局
├── router/       # 静态路由与动态路由处理
├── store/        # Pinia store
├── utils/        # HTTP、auth、tree、message 等工具
└── views/        # 页面
```

扩展规则：

- 页面放在 `frontend/src/views/<domain>/<feature>/index.vue`。
- 模块 API 优先放进 `frontend/src/api/system.ts`、`frontend/src/api/user.ts` 或新建同级业务文件。
- 路由由后端动态菜单和前端 router 共同约束，不要只改前端页面而忘记菜单数据。
- 权限点、按钮编码、接口字段必须能在 `SPECS/API.md` 或需求文档中追溯。

## 后端扩展合同

后端目录：

```text
backend/src/
├── app.ts        # Fastify 实例和插件注册
├── server.ts     # 启动入口
├── routes/       # 路由层
├── services/     # 业务逻辑层
├── db/           # MySQL pool
├── config/       # 环境变量
├── loaders/      # 日志等加载器
└── utils/        # response、jwt、password、pagination、tree 等工具
```

扩展规则：

- 新接口按 `routes/<domain>.ts` + `services/<domain>.ts` 拆分。
- 返回体沿用现有 response 工具，保持 `{ success, data }` 风格。
- SQL 使用 `mysql2/promise` pool 和参数化查询。
- 数据表变更先更新 `SPECS/DATABASE.md`，再更新 `backend/db/schema.sql` 和必要 seed。
- 后端字段命名与前端消费字段必须回写到 `SPECS/API.md`。

## 生成项目命令

常用命令：

```sh
pnpm install
pnpm kit:check
pnpm kit:next
pnpm kit:skills
pnpm kit:stage -- advance requirements-draft --by user --quote "<用户原话>"
pnpm dev
pnpm build
pnpm typecheck
```

数据库由当前环境提供，连接参数来自 `backend/.env`。生成项目不内置数据库启动脚本；如果是在 kit 仓库内开发模板，可使用仓库根目录的 `pnpm template:mysql` 启动本地 MySQL。

如果命令路径不适用于当前工作区，先查看根目录 `package.json` 和 `scripts/kit.mjs`，不要猜测脚本名。

## 禁止事项

- 不要绕过 `workflow-state.json` 手动推进阶段。
- 不要在 `implementation-ready` 前实现功能代码。
- 不要让 Agent 默认选择技术方案，除非用户明确授权。
- 不要在 `frontend/SPECS/API.md` 或 `backend/SPECS/API.md` 复制 API 正文。
- 不要把业务模块直接写进根目录；前端进 `frontend/`，后端进 `backend/`，跨端契约进 `SPECS/`。
- 不要把 `node_modules/`、`dist/`、真实 `.env` 当成模板合同的一部分。

## 验收

改完控制文件、workflow、tasks、API 契约或代码后，至少运行：

```sh
pnpm kit:check
```

改前端或后端代码后，再运行：

```sh
pnpm typecheck
pnpm build
```

无法运行时，在交付说明中写明原因和未覆盖风险。
