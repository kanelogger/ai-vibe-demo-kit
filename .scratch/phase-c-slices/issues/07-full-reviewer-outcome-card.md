# 07 — Full、双轴 Reviewer 与 Outcome Card

**What to build:** Work Item 级收尾证据（PRD 16.2/16.3/16.6）。`harness verify full` 在所有当前 Slice done 后对 Integration Baseline 执行完整风险覆盖：所有 code change 至少全局 smoke，low 跑受影响检查+关键路径+全局 smoke，medium/high 按 risk profile 增加回归/恢复演练/数据契约检查；报告必须解释未运行项与原因（FR-E02）。所有 code-changing Work Item 必须有 Standards 与 Intent/Contract 双轴审查：low 一个非作者 Reviewer 同时输出双轴，medium/high 两个独立 Reviewer 并行（FR-E03、FR-A06）；evidence-only/no-code 记录 not-applicable 原因可跳过。Full 与 reviews 默认在 immutable Integration Baseline 上并行、绑定同一 tree（FR-E04）。全绿后生成 Outcome Card：承诺行为、实际走查、Quick/Full 摘要、双轴结论、changed/no-change、未覆盖风险、清理、回退、exact Integration tree 与 target baseline、Developer 最终原话——一页可读并链接底层证据（FR-E07）。任一 finding 按最早事实层 reopen，修复使相关证据失效（§11.6）。

**Blocked by:** 04 — verified、聚焦 commit、done 与串行 Integration

**Status:** ready-for-agent

- [ ] fixture：low Work Item 的 Full 至少包含受影响检查、关键路径与全局 smoke；报告列出未运行项与原因（FR-E02）
- [ ] fixture：acceptance-ready 必须持当前有效的 Full；Slice done 不要求未来的 Full（FR-E01）
- [ ] fixtures：low 一个非作者 Reviewer 输出双轴结论；medium/high 需要两个独立 Reviewer（FR-E03/FR-A06）
- [ ] fixture：Full 与 reviews 绑定同一 immutable tree，默认并行（FR-E04）
- [ ] fixture：evidence-only/no-code Work Item 记录 not-applicable 后跳过 code review（FR-E03）
- [ ] fixture：Outcome Card 包含 §16.6 全部要素且一页可读，Developer 无需读原始 JSON 即可判断（FR-E07）
- [ ] fixture：Reviewer finding 触发 reopen 路径并使相关 Human Review/Full/reviews 失效（场景 16）
