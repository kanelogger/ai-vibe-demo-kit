# Implementation Notes

## 修改 1：`source/specs/template.md`

- 决策：仅替换三问第 2、3 条两行为文章版（"这一版做什么 / 暂时不做什么"），第 1 条与定位说明句不动，`实现<SPEC>。在工作过程中……` 段落未劈开、未改写。
- 三问恢复理由（冗余论证）：执行版"怎样算完成 / 风险与回退"与 workflow 既有 exitConditions（`acceptance-observable`、`risk-classified`）重复，是冗余。
- 三问恢复理由（缺口论证）："做什么 / 不做什么"（范围边界）在现有 spec 契约中无任何出口条件覆盖——`scope-complete` 只在实现阶段检查"未越界"，不要求 spec 显式声明边界；文章版三问填补真实缺口。
- 偏差：无。

## 修改 2：`source/rules/testing.md`

- 决策：按 plan.md 第 1 节给定原文，在 `## Required Checks` 表格与 `## Reporting` 之间整节插入 `## 性能与结构审查`，既有两节零改动。
- 决策：节内第二条显式指向 git.md（"见 git.md"），与修改 3 新增规则呼应，避免两处规则漂移（rules/README.md 单一权威原则）。
- 偏差：无。

## 修改 3：`source/rules/git.md`

- 决策：按 plan.md 第 1 节给定原文，在"验证完成后再形成独立提交或等价的可回退记录。"之后新增一条并列规则，既有各条目原样保留。
- 决策：规则强调"删除旧路径与替换在同一需求内完成，并把删除后的关键路径验证纳入验收证据"，与本仓库"受治理变更证据同区间"纪律一致。
- 偏差：无。

## 修改 4：`plan.md`

- 决策：本工作项执行计划保留并随区间以 `docs` 提交，修复上轮"spec 引用 plan.md 但文件未提交"的 provenance 悬空。
- 偏差：无。

## 联动项

- `source/manifest.json`、`package.json`、`source/workflows/workflow-template.json`：零改动，`check-distribution` 输出 `distribution: valid`（见 quick-evidence.md）。
- 无其他范围外改动。
