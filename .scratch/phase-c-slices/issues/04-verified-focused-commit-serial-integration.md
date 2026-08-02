# 04 — verified、聚焦 commit、done 与串行 Integration

**What to build:** Slice 收尾链路（PRD 9.1/9.4/9.5）。human-reviewed → verified 要求 Quick、Review Session、内容摘要与事实 revision 全部一致、所有反馈关闭、风险检查当前有效；verified → done 要求聚焦 commit 与已验证内容一致、由 Orchestrator 无修改地串行进入 Integration Baseline 并记录 dependency-aware 回退方式；只有 branch commit 不得宣称 done（FR-S08）。串行（单一 writable frontier）时 Orchestrator 直接在 Integration Worktree 实现，不额外创建 Slice worktree（FR-S10、§6.5）。聚焦 commit 内容被 formatter、pre-commit 或冲突解决改变时必须重新 Quick 与 Human Review（§9.5）。当前 Integration Baseline 只在未触及 Slice 声明的 contract/dependency 时可前移；相关依赖变化必须 rebase、重新 Quick 和重新 Human Review（§9.4）；依赖 Slice 只有在前驱 done 且 Integration Baseline 包含前驱集成 commit 后才进入 frontier（FR-S07、场景 12）。

**Blocked by:** 03 — Review Session 与反馈 issues

**Status:** ready-for-agent

- [ ] fixture：human-reviewed → verified 在 Quick/Review/digest/revision 一致且反馈全关闭时通过；任一不一致被拒绝
- [ ] fixture：verified → done 必须串行集成进 Integration Baseline；只有 Slice branch commit 时 done 被拒绝（FR-S08）
- [ ] fixture：聚焦 commit 内容与 verified 内容不一致（formatter 改写）时要求重新 Quick + Human Review（§9.5）
- [ ] fixture：单 writer 快路径直接在 Integration Worktree 工作，不创建多余 Slice worktree（FR-S10）
- [ ] fixture：Integration Baseline 前移未触及 Slice 声明依赖时证据保留；触及声明依赖时要求 rebase + 重新 Quick + 重新实测（§9.4）
- [ ] fixture：依赖 Slice B 在 A done 且 baseline 包含 A 的集成 commit 后才进入 frontier（场景 12）
- [ ] done Slice 记录可执行回退方式（dependency-aware rollback 引用，§9.1）
