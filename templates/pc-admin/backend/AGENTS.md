# 后端 Agent 规则

工作范围限制在 `backend/` 内。

## 职责

- 维护 `backend/SPECS/` 下的后端本地规格。
- 读取 `../SPECS/API.md` 中的共享 API 契约。
- 保持 `backend/SPECS/API.md` 只引用 `../../SPECS/API.md`。
- 不要修改前端代码。
- 根目录阶段进入 `implementation-ready` 前，不得实现功能代码。

## 本地规格

后续预期文件：

- `backend/SPECS/PRD.md`
- `backend/SPECS/ARCHITECTURE.md`
- `backend/SPECS/API.md`
- `backend/SPECS/FEATURES/<feature-slug>/spec.md`
- `backend/SPECS/FEATURES/<feature-slug>/tasks.md`

后端响应 JSON 字段必须与根目录 `SPECS/API.md` 中记录的前端 VO 字段一致。
