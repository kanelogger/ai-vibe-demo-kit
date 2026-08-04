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

