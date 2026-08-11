# Knowledge Base

这里保存跨需求仍然有效的项目与业务知识。单次需求的讨论、执行状态和交接记录属于 `work/`。

## 分层

- `main/`：跨应用、跨模块的公共语境和全局约束。
- `applications/`：单个应用的职责、业务能力、差异方案、基础索引和技术约束。
- `candidate/`：有证据但尚未确认的候选知识。
- `personal/`：个人经验与排障草稿，不能代表团队正式结论。
- `templates/`：知识和架构文档模板。

## 读取顺序

1. 读取 `INDEX.md` 了解正式知识范围。
2. 按 `ROUTING.md` 从需求线索定位应用和知识文件。
3. 先读应用总览与索引，再读取相关 product、solution、base 或 tech 文档。
4. 对易变化的签名、字段、状态、Topic、开关和路径回到当前代码核对。

## 写入流程

```text
personal -> candidate -> review -> main/applications -> deprecated
```

详细准入规则见 `KNOWLEDGE-RULES.md`。
