# 生成项目 Agent 规则

本工作区由 ai-vibe-demo-kit v1 控制。根目录负责流程状态、阶段门、共享 API 契约、任务和决策记录。

先读 `TEMPLATE.md` 获取模板地图、扩展位置和文件边界；需要选择 skill 时读取 `.agents/skills.json`；再按任务类型读取 `rules/`、`frontend/AGENTS.md` 或 `backend/AGENTS.md`。

## 命令

- `pnpm kit:check`：校验当前流程状态。
- `pnpm kit:stage -- advance <stage> --by user --quote "<用户原话>"`：用户确认后，只推进一个阶段。

## 阶段顺序

阶段顺序固定，不得跳过：

```text
initialized
-> requirements-draft
-> requirements-confirmed
-> solution-options
-> solution-selected
-> implementation-ready
```

`workflow-state.json` 是当前阶段的机器可读事实源。不要手动编辑它，必须使用 `kit stage advance` 推进阶段。

## 硬停顿

- 提出澄清问题后，必须停止，直到用户回复。
- 没有进入 `requirements-confirmed` 前，不得创建方案文件。
- 没有进入 `solution-selected` 前，不得创建 implementation-ready 文件。
- 没有进入 `implementation-ready` 前，不得实现功能代码。
- 不得由 Agent 默认选择方案。用户选择必须是显式的。如果用户明确允许 Agent 代选，记录用户原话。

## 流程文件

- `workflow/requirements.md` 在 `requirements-draft` 阶段创建，并在推进到 `requirements-confirmed` 前更新为 `status: confirmed`。
- `workflow/solution-options.md` 只能在需求确认后创建，并且必须提供正好三个方案 id。
- `workflow/solution-selected.md` 记录用户选择的方案或自定义选择。
- `workflow/implementation-ready.md` 只能在方案已选择后创建。

`kit stage advance` 只校验目标产物存在且具备要求的 `status`。`kit check` 校验当前稳定阶段。

## 规格与 API 契约

- `SPECS/API.md` 是唯一的前后端共享 API 契约。
- `frontend/SPECS/API.md` 与 `backend/SPECS/API.md` 只能引用 `../../SPECS/API.md`。
- 前端 VO 字段和后端响应 JSON 字段都必须体现在根目录 `SPECS/API.md` 中。
- 前端工作限制在 `frontend/` 内，除非当前阶段明确要求更新根目录 workflow/API/tasks。
- 后端工作限制在 `backend/` 内，除非当前阶段明确要求更新根目录 workflow/API/tasks。

## 技能路由

`.agents/skills.json` 是技能别名、默认链路和阶段推荐的机器可读事实源。不要只凭本节文字选择 skill。

默认链路：

```text
requirement-clarification -> doc-iteration -> spec-lock -> solution-options
-> tech-plan-generator -> api-design -> shell-implementation -> tdd
-> webapp-testing -> code-review -> documentation
```

只有当触发条件明确，或任务确实需要时，才使用条件型技能。
