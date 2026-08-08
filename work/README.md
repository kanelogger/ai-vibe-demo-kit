# Work Items

这里保存单次需求从输入、澄清、分析、应用拆解、实现校验到交接和知识回补的全过程。文件可以跨会话读取，聊天记录不作为唯一状态来源。

## 需求目录

```text
work/requirements/<requirement-id>/
├── source/
│   ├── input.md
│   └── materials.yml
├── clarification.md
├── analysis.md
├── execution-plan.md
├── status.yml
├── knowledge-backfill.md
└── applications/
    └── <application-id>/
        ├── requirement.md
        ├── implementation-check.md
        └── handoff.md
```

## 状态原则

- 每个需求的 `status.yml` 是当前阶段的唯一机器来源。
- Markdown 解释为什么推进，YAML 表达现在允许什么。
- 人工批准记录原始确认文本、确认人和时间。
- 多应用需求为每个应用建立独立 `requirement.md`。
- 实现可以中断，`implementation-check.md` 与 `handoff.md` 必须让新会话能够继续。
