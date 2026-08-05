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

## 非活动提案

当前状态机无法激活新一轮工作、但团队需要先收敛后续需求时，可以把材料放在 `workflow/proposals/<initiative-id>/`。该目录按同样的前置顺序保存 requirements、solution options、用户选择、roadmap 与 bootstrap planning evidence；只能在上一步由用户原话解锁后创建下一类文档。所有文件必须明确标记 `non-active` / `proposed`，文件存在不改变机器阶段，也不得作为 State Bootstrap 或实现放行证据。

提案激活时必须把已确认事实导入当时的 Canonical Control Plane，并按正式阶段重新保存用户原话；原提案随后转为只读来源或归档。不得让活动状态与 proposal 同时拥有同一事实。

## 放行规则

- 用户提供原话后运行 `harness-stage.mjs advance`。命令先生成候选状态并运行 `context + gates + evidence`；全部通过后才原子替换正式状态。
- 每次推进在 `history` 中保存 from/to/advancedBy/advancedAt/quote/doc；frontmatter、放行记录和 history 必须一致。
- Agent 可以准备文档和证据，但不得直接修改状态文件或伪造用户原话。
- UI 的 `design-confirmed` 必须登记可运行原型命令、原型文件和操作证据。
- `implementation-ready` 后使用 `harness-verify.mjs quick|full` 形成真实反馈闭环。
- `accepted` 必须依赖当前 `full` 报告、通过的关键路径与清理结果、完整 Sprint 摘要和用户验收原话。
- 需求、方案和实现放行文档必须维护 Source Register；没有来源时显式写明“无来源”及原因。

使用 `node scripts/harness-check.mjs gates` 校验阶段状态、文档前置和放行证据。
