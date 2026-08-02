# 02 — 六轴风险画像与 low allowlist 分类器

**What to build:** `harness start` 时工作项获得确定的风险画像：外部契约、数据可逆性、安全与权限语义、影响范围、共享契约、运行切换六个轴各标 low/medium/high，整体取最高轴；规则给出最低等级，Developer 可上调、不可降到规则下限以下（FR-U01）。严格 low allowlist：单 Slice、局部 exact/subtree Write Scope、无持久数据迁移、无安全/权限变化、无公开或共享契约破坏、复用既有行为模式、可单聚焦 commit 回退——任一 disqualifier 自动至少 medium（FR-U02）。任一 high trigger（破坏公开契约、改变安全/信任边界、持久数据不可逆风险、修改 Harness 控制面或状态 schema、Migration Cutover/Contracting、跨多数核心模块或无法经一次 Promotion 回退）强制 high（FR-U03）。风险等级决定后续是否允许进入 Brief 快路径，是三种 low 快路径的公共门禁。

**Blocked by:** 01 — 统一 `harness` CLI façade 与表驱动 fixture 运行器

**Status:** done

- [x] 同一 fixture 输入两次分类得到完全相同的最低等级（确定性，无模型判断）
- [x] 表驱动 fixtures 覆盖：六轴各取值的组合、Developer 上调生效、下调至规则下限以下被拒绝
- [x] low allowlist 每条 disqualifier 各有一个 fixture，命中即至少 medium 并说明是哪条 disqualifier
- [x] 每条 high trigger 各有一个 fixture，结果强制 high 且 Developer 不可下调
- [x] 非 low 且未命中 high trigger 的工作项分类为 medium
- [x] 分类结果写入工作项事实并可在 status 中读取；后续 `confirm` 快路径门禁读取同一结论（单一事实源）
