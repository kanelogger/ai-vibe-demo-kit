# 09 — 级联 Rollback 端到端

**What to build:** Rollback 从计划到恢复 accepted baseline 的完整闭环（PRD 7.9/11.7、场景 17 端到端）。在 Phase B 的 rollbackPlan（逆序级联集合、单原子 Rollback Slice）之上：executing 阶段的 Rollback Slice 实际应用完整 inverse/cascade diff（对级联中每个 accepted 项的集成 commit 计算并应用逆向，逆序进行），不让 Developer 面对不可运行中间状态（FR-B03）；Rollback Slice 仍经过 Quick、Human Review、非作者 review、Full 与 Promotion（§7.9）；verified 证明回退后的 tree 与目标先前 Accepted Baseline 等价；Promotion 后 Accepted Baseline 恢复到被回退项之前。被回退历史项 namespace 保持 immutable，Rollback Work Item 的 rollbackOf[] 谱系可在 status/history 反查（FR-G08）。

**Blocked by:** 08 — Promotion CAS 与 target drift

**Status:** ready-for-agent

- [ ] fixture：回退最新 accepted 项，Rollback Slice 应用 inverse 后经 Quick→实测→Full→Reviewer→Promotion，Accepted Baseline 恢复（端到端）
- [ ] fixture：回退历史项 A（后继 B/C），按 C→B→A 逆序应用级联 diff，中间不生成要求实测的不可运行状态（FR-B03、场景 17）
- [ ] fixture：Rollback Slice 跳过 Quick 或 Human Review 时不得进入 verified（与普通 Slice 同一门禁口径）
- [ ] fixture：verified 证明最终 tree 与目标先前 Accepted Baseline 等价；不等价被拒绝
- [ ] fixture：被回退项 namespace 未被修改；rollbackOf[] 谱系与级联顺序可反查（FR-G08、NFR-12）
- [ ] fixture：Rollback Work Item 以 outcome=accepted 关闭后自身进入 accepted lineage，可被后续 rollback 引用
