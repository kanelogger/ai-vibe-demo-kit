# 06 — 反馈 reopen 与失效传播

**What to build:** Review Session issue 按最早受影响事实层 reopen（PRD 10.3–10.5、原则 6）。`harness reopen --origin <origin>`：Feature 按 requirements → requirements-draft、design → requirements-confirmed、specification → solution-selected、implementation → 不 reopen 仅相关 Slice 新 revision 回 implementing（§10.3）；Bugfix 按 diagnosis → defect-confirmed、requirements/design → superseded 另开 Feature（§10.4、场景 9）；Maintenance 按 scope/invariant → initialized、外部行为变化 → close-and-start Feature 等（§10.5）。reopen 创建后继 Fact Revision，不覆盖旧文档（FR-G04）；上游 reopen 原子传播：所有下游 fact confirmations 标记当前无效、下游 Slices 进入 invalidated、Quick/Human Review/Reviewer/Full/Outcome Card 失效且只供审计（§10.8）。重新前进需要新的 Human Confirmation，历史原话不可复用（§10.8）；Reviewer finding 触发相关 Slice 新 revision、重新 Human Review 与 Full/reviews（场景 16）。

**Blocked by:** 04 — verified、聚焦 commit、done 与串行 Integration

**Status:** ready-for-agent

- [ ] 表驱动 fixtures：Feature 四类 origin 分别 reopen 到 §10.3 规定阶段；implementation origin 不 reopen Work Item
- [ ] fixtures：Bugfix 错误 diagnosis 回到 defect-confirmed，不在 Slice 内猜修（场景 9）；requirements/design origin 建议 supersede 为 Feature（§10.4）
- [ ] fixtures：Maintenance scope/invariant 错回 initialized；外部行为变化走 close-and-start Feature（§10.5）
- [ ] fixture：reopen 创建新 Fact Revision，旧 revision 保留可审计、不可再推进（FR-G04）
- [ ] fixture：requirements + implementation 同时有问题时 reopen 到 requirements-draft，全部下游 Slice invalidated（场景 8）
- [ ] fixture：失效传播是原子的——下游事实、Slices、Quick、Human Review、Full、Outcome Card 同事务标记失效（§10.8）
- [ ] fixture：reopen 后推进必须携带新的 Human Confirmation；复用 reopen 前的确认原话被拒绝（§10.8）
