# Knowledge Index

知识库的正式导航入口。这里只登记可以被 Agent 稳定引用的知识；候选与个人内容单独列出，不参与默认路由。

## 全局知识

| Topic | Entry | Status | Owner | Evidence |
| --- | --- | --- | --- | --- |
| 项目公共语境 | `main/README.md` | official | Project maintainers | `README.md`、`ARCHITECTURE.md` |
| 架构与 Module 索引 | `ARCHITECTURE.md` | official | Project maintainers | `bin/`、`src/`、`scripts/`、`source/workflows/` |
| Runtime | `src/runtime/ARCHITECTURE.md` | official | Project maintainers | `src/runtime/` |
| Distribution | `src/distribution/ARCHITECTURE.md` | official | Project maintainers | `src/distribution/` |
| 严格多 Agent Orchestrator 边界 | `source/specs/multi-agent-orchestrator-rfc.md` | proposed | Project maintainers | context-package/v1、handoff/v1、OCI prototype gate |
| 架构决策 | `main/adr/README.md` | draft | Project maintainers | Accepted ADRs |

## 应用知识

| Application | Responsibility | Index | Architecture | Owner |
| --- | --- | --- | --- | --- |
当前仓库是单一 CLI Runtime，没有已登记的业务 Application。`applications/_template/` 仅供下游项目初始化使用。

## 非正式知识

- 待确认知识：`candidate/`
- 个人经验：`personal/`
- 写作模板：`templates/`
