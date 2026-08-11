# Implementation Notes

## 修改 1：`source/specs/template.md`

- 决策：按修订点 B 将 `## 需求简报` 置于文件最顶部，原 `实现<SPEC>。在工作过程中……` 段落完整保留在其后，未劈开、未改写。
- 决策：定位说明写明时序——"alignment 阶段的产物，先于下方实现指令确认并冻结；spec 交付物 = 简报 + 实现指令"，implementation-notes 语义仍归实现阶段。
- 三问措辞采用祈使句式（解决什么问题 / 怎样算完成 / 风险与回退），与原文件单段祈使风格一致。
- 偏差：无。

## 修改 2：`source/rules/git.md`

- 决策：在既有"受治理变更必须……"条目内追加同区间约束，不新增条目，保持单条规则完整语义。
- 决策：措辞以 `scripts/check-completion-evidence.mjs` 实际行为为准——`work/` 非 GOVERNED_PATHS；任何含 governed 变更的 `base..HEAD` 区间若缺少同区间 `work/requirements/<work-id>/acceptance-result.json` 变更即退出码 1。明确写出"不存在先推内容、下轮补证据的选项"。
- 偏差：无；既有同目录 `workflow.json` 优先校验语义原样保留。

## 修改 3：`source/agents_template.md`

- 决策：在"完成条件"小节既有段落之后新增一段证据链纪律，`{填写：…}` 占位保持不动——下游项目仍需自填完成状态，证据链三条为固定要求。
- 决策：指向 `source/rules/git.md` 而非复制规则全文，避免两处规则漂移（rules/README.md 的单一权威原则）。
- 偏差：无。

## 联动项

- `source/workflows/workflow-case-zh.md`：按计划默认跳过（line 90 为 stageRuns 表格行，非自由文本）。
- `source/manifest.json`、`package.json`、`source/workflows/workflow-template.json`：零改动（manifest 无哈希联动，已确认）。
