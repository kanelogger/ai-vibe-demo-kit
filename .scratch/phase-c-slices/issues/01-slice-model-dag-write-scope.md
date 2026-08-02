# 01 — Slice 模型：六态、DAG/frontier、Write Scope、revision

**What to build:** Work Item 的开发进度以 Slice 为单位表达：`harness slice` 子命令创建/列出 Slice，每个 Slice 走六态正常路径 ready → implementing → runnable → human-reviewed → verified → done，外加异常态 invalidated（PRD 9.1）。Slice 声明 `dependsOn[]`，只有前驱 Slice 全部 done 才进入 frontier；环依赖、未知引用、Write Scope 重叠或未固定共享契约的 Slice 被拒绝（§9.3、FR-S07）。Write Scope 只有 exact file 与 directory subtree 两种语法，rename 必须同时拥有 source 与 destination，新文件只能落在 owned subtree；scope 随 revision 冻结，扩缩 scope 必须创建新 revision 并使既有 Quick/Human Review 失效（FR-S06、§9.3）。每个 Slice 记录 primaryUncertainty、nonGoals、acceptanceCriteria 与验证计划（§9.2），跳过状态被拒绝（FR-S01）。

**Blocked by:** None — 可立即开始（前置：Phase A/B 的 stateRef、Work Item 与 CLI 已可用）。

**Status:** done

- [x] 表驱动 fixtures：六态全路径允许；跳过 runnable/Human Review/verified 的推进被拒绝并返回稳定错误码（FR-S01）
- [x] fixture：dependsOn 前驱未 done 时 Slice 不进入 frontier；前驱 done 后进入（FR-S07）
- [x] fixtures：环依赖、未知 dependsOn 引用、两个 Slice Write Scope 重叠分别被拒绝并说明原因（§9.3）
- [x] fixtures：glob 语法 scope 被拒绝；rename 只有 source 或只有 destination 被拒绝；新文件落在非 owned subtree 被拒绝（NFR-06 路径层）
- [x] fixture：扩大或缩小 scope 创建新 revision，旧 revision 的 Quick/Human Review 标记失效（FR-S06）
- [x] Slice 最小字段齐全（§9.2）；Slice 状态存于 stateRef 的 Work Item namespace 下，单一事实源
