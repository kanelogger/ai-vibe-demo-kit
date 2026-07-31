# 工作流

`workflow/` 保存本轮需求如何确认、考虑过哪些方案以及用户如何放行。它是过程文档，不是长期生效契约；长期有效事实固化到 `SPECS/`，本轮完成后 `workflow/` 文档可以归档。

## 阶段与文档

```text
initialized
-> requirements-draft        workflow/requirements.md         (status: draft)
-> requirements-confirmed    workflow/requirements.md         (status: confirmed)
-> design-confirmed          workflow/design.md               (status: confirmed；仅 hasUserInterface 为 true 的项目)
-> solution-options          workflow/solution-options.md     (status: proposed)
-> solution-selected         workflow/solution-selected.md    (status: selected)
-> implementation-ready      workflow/implementation-ready.md (status: ready)
-> accepted                  workflow/acceptance.md           (status: accepted)
```

## 放行规则

- 阶段推进是人工放行动作：用户提供原话证据后，由人运行 `node scripts/harness-stage.mjs advance --to <stage> --by user --quote "<用户原话>"` 推进。该命令是 `workflow-state.json` 的唯一写入入口，只允许单步推进，且目标阶段文档必须已存在。
- 每次推进在 `history` 中留下 from/to/advancedBy/advancedAt/quote/doc 完整证据链；"用户已确认"不是布尔值，是可审计记录。
- Agent 可以准备文档和证据，但不得修改状态文件推进阶段，不得伪造用户原话。
- 每个阶段的 frontmatter `status` 必须与目标阶段一致；模板见同目录 `*.template.md`。
- `design-confirmed` 只对 `.harness/config.json` 中 `project.hasUserInterface` 为 true 的项目启用；非 UI 项目从 `requirements-confirmed` 直接进入 `solution-options`。
- `accepted` 是验收门禁：验证报告完成、关键用户路径实际运行后，由用户原话放行。
- 需求、方案和实现放行文档必须维护 Source Register；没有来源时显式写明“无来源”及原因。

使用 `node scripts/harness-check.mjs gates` 校验阶段状态、文档前置和放行证据。
