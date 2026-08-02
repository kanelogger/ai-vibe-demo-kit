# 05 — 并行 Slice worktrees 与 Contract Baseline

**What to build:** 真实并行 frontier 的物理隔离（PRD 6.5/9.4、原则 9）。frontier 有两个及以上无依赖、无 scope 冲突的 writer 时，每个 Slice 使用独立 Git worktree/branch；Worker 不提交最终 commit，Orchestrator 验证内容摘要后创建/接受聚焦 commit 并串行集成（§9.4、FR-A04）。medium/high 或跨 Slice 的候选 `SPECS/` 与共享契约在 implementation-ready 前形成单独 Contract Baseline commit，所有并行 Slice branches 从同一 Contract Baseline 派生（§6.5）；未固定共享契约的 Slice 拒绝进入 frontier（§9.3）。并行 fixtures 证明：不同 worktree 实现、集成串行、无 HEAD/fingerprint 污染（FR-S10、场景 11）；同一 worktree 不运行两个可写 Slice（FR-A04）。

**Blocked by:** 04 — verified、聚焦 commit、done 与串行 Integration

**Status:** ready-for-agent

- [ ] fixture：两个无依赖 Slice 分别在独立 worktree/branch 实现，集成串行进行，无相互污染（场景 11）
- [ ] fixture：同一 worktree 上第二个可写 Slice 被拒绝（FR-A04）
- [ ] fixture：Contract Baseline commit 在 implementation-ready 前形成，两个并行 Slice branch 派生自同一 commit（§6.5）
- [ ] fixture：共享契约未固定时相关 Slice 不进入 frontier（§9.3）
- [ ] fixture：Worker 侧不出现最终 commit；聚焦 commit 由 Orchestrator 在验证内容摘要后创建（§9.4）
- [ ] fixture：串行/并行选择由 frontier writer 数决定——单 writer 不建额外交互 worktree，多 writer 才建（FR-S10）
- [ ] 并行 writer 的 assignment 声明输入、输出、依赖、revision、scope、验证与禁止事项，缺任一项不进入并行 frontier（FR-A03）
