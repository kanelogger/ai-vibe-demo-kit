# 03 — Low Feature 快路径端到端

**What to build:** 严格满足 low allowlist 的单 Slice Feature 走完整快路径：Developer 给出明确任务原话即 provisional start（不重复询问"是否开始"）；Orchestrator 形成一份 Implementation Brief（范围、Design Fact、单一有依据方案、风险画像、内嵌 spec/验收、单 Slice、Write Scope、Quick/Full 与回退）；Developer 一次确认后，CLI 在一个事务内按序原子写入全部前置事实（requirements → design → solution → implementation-ready），状态历史完整可见而非跳过状态（FR-U04）。每个确认过的事实冻结为不可变 revision 并带内容摘要。流程内嵌人工停顿计数：从首次明确任务原话起，阻塞式人工停顿（Brief 确认、实测、最终验收）不超过三次，状态推进、manifest、提交等确定性步骤不产生额外停顿（FR-U05、NFR-13）。这是第一条端到端快路径，Brief 批量确认与停顿计数机制在此建立，04/05 复用。

**Blocked by:** 01 — 统一 `harness` CLI façade 与表驱动 fixture 运行器；02 — 六轴风险画像与 low allowlist 分类器

**Status:** done

- [x] 表驱动 fixture：low Feature 从明确任务原话到 implementation-ready 只经历一次 Brief 确认，且状态历史包含全部逻辑阶段（验收场景 1）
- [x] Brief 确认是原子写入：任一事实写入失败则整体不落盘，不留半推进状态
- [x] 每条已确认事实为不可变 revision，带独立内容摘要；重复确认同一 revision 被拒绝
- [x] 非 low（任一 allowlist disqualifier）的 Feature 无法使用 Brief 批量确认，被要求走分阶段路径
- [x] 人工停顿计数 fixture 证明全流程 ≤3 次阻塞式停顿，超出时给出超预算原因记录
- [x] 非法转换（如从 initialized 直接 advance 到 acceptance-ready）被拒绝并返回稳定错误码与修复命令（FR-G03）
