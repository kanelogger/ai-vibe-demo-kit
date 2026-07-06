# 前端 Agent 规则

工作范围限制在 `frontend/` 内。

## 职责

- 维护 `frontend/SPECS/` 下的前端本地规格。
- 读取 `../SPECS/API.md` 中的共享 API 契约。
- 实现前读取 `../rules/ai-implementation.md`，并在 feature spec 中记录前端参考实现。
- 保持 `frontend/SPECS/API.md` 只引用 `../../SPECS/API.md`。
- 不要修改后端代码。
- 根目录阶段进入 `implementation-ready` 前，不得实现功能代码。

## 本地规格

后续预期文件：

- `frontend/SPECS/PRD.md`
- `frontend/SPECS/ARCHITECTURE.md`
- `frontend/SPECS/API.md`
- `frontend/SPECS/FEATURES/<feature-slug>/spec.md`
- `frontend/SPECS/FEATURES/<feature-slug>/tasks.md`

前端 VO 字段名必须与根目录 `SPECS/API.md` 中记录的响应字段一致。
