# Decisions

记录简单、当前有效且跨需求仍有价值的决定。新决定覆盖旧决定时，明确写出被替代项和原因；被覆盖的条目保留在原地并标注 `superseded-by`，形成可追溯谱系。

## 条目格式

```text
### <date> <decision title>
- Status: active | superseded-by <date> <new title>
- Decision:
- Reason:
- Source:（用户原话、文档或代码位置；没有来源时写明“无来源”及原因）
```

重要架构决策进入 `memory/adr/`，ADR 同样使用 `Status: proposed | accepted | superseded-by ADR-NNNN` 表达覆盖关系。

### 2026-08-03 目录上下文使用统一门禁
- Status: active
- Decision: 选择 `unified-guard`；`.harness-index.json` 的解析、传递上下文闭包、摘要和会话回执集中在单一 Context Guard Module，统一 CLI、检查器和 Hook Adapter 复用该模块；不绑定 v2 stateRef 迁移或 active Slice。
- Reason: 在实现索引目录硬阻断的同时保持一个控制面和一个错误契约，并让具体项目接入后立即可用；stateRef 级审计可在未来需求中沿现有 Interface 增加。
- Source: 用户选择原话“unified-guard”；`workflow/solution-options.md`。
