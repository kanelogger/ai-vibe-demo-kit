# 08 — Promotion CAS 与 target drift

**What to build:** 把 acceptance-ready 的精确 Integration tree 原子设为新的 Accepted Baseline（PRD 6.6）。`harness advance --to acceptance-ready` 后由最终确认触发 Promotion：检查 targetRef 仍指向 Work Item 绑定的 Accepted Baseline；检查 Outcome Card、Full、Reviewer 结果与 Developer 最终确认绑定同一 tree；以 Git ref transaction 原子更新 targetRef 与 stateRef——任一 ref 漂移或证据 mismatch 两者都不更新（FR-G07、NFR-02）。targetRef 漂移时保持 acceptance-ready，执行 rebase、依赖失效判断、必要重验与新最终确认后再提升（§6.6、场景 14）。Promotion 不 push、不 deploy。evidence-only/no-change Work Item 不更新 targetRef，只原子关闭状态并保持当前 Accepted Baseline（FR-G06、场景 15）；零 Slice 成功仍有风险匹配验证、实际使用与 Outcome Card。最终验收是 low 快路径第三次阻塞式人工停顿（NFR-13）。

**Blocked by:** 07 — Full、双轴 Reviewer 与 Outcome Card

**Status:** ready-for-agent

- [ ] fixture：证据绑定同一 tree 且 targetRef 未漂移时，targetRef 与 stateRef 原子更新为新 Accepted Baseline（FR-G07）
- [ ] fixture：Outcome Card/Full/Review/最终确认绑定不同 tree 时，两个 ref 都不更新（FR-G07）
- [ ] fixture：targetRef 漂移时不更新任何 ref；rebase、重验、新最终确认后 Promotion 成功（场景 14）
- [ ] fixture：no-change Work Item 只关闭状态，targetRef 与 Accepted Baseline 保持不变（FR-G06、场景 15）
- [ ] fixture：evidence-only 零 Slice 路径仍有风险匹配验证、实际使用与 Outcome Card（FR-G06）
- [ ] fixture：Promotion 不执行 push/deploy；ref 更新走 compare-and-swap 事务（NFR-02）
- [ ] fixture：low 快路径最终验收计入第三次人工停顿，全程 ≤3 次（NFR-13）
