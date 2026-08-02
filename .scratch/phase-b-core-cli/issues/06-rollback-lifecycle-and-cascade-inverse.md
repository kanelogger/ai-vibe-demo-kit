# 06 — Rollback 生命周期与级联 inverse 计算

**What to build:** Rollback 是独立工作项类型，走自己的生命周期 initialized → planned → executing → executed → verified → acceptance-ready → close(outcome)，不伪装成 Bugfix、不允许绕过生命周期的直接 shell revert（FR-B01）。`harness rollback` 由 Developer 明确指定要回退的 accepted 工作项或 Slice 后：planned 从目标项与当前 accepted lineage 计算逆向集合——回退最新 accepted 项直接形成 inverse；回退更早项必须自动纳入全部后继 accepted 项并按逆序级联（FR-B02，验收场景 17）；有下游依赖时不宣称可单独安全 revert（FR-S09）。executing 用一个原子 Rollback Slice 应用完整 inverse/cascade diff，不让 Developer 面对不可运行中间状态（FR-B03）。关闭的 Rollback 工作项记录 rollbackOf[] 谱系链接，被回退的历史项保持不可变。

**Blocked by:** 01 — 统一 `harness` CLI façade 与表驱动 fixture 运行器

**Status:** done

- [x] 表驱动 fixture：Rollback 类型全部合法转换通过，非法跳转（如 planned 直接到 verified）被拒绝并返回稳定错误码
- [x] fixture：回退最新 accepted 工作项，inverse 集合恰好等于该项自身，不含其他项
- [x] fixture：回退历史项 A（其后有 accepted B、C），自动形成 C→B→A 逆序级联集合，与 accepted lineage 完全一致（验收场景 17）
- [x] fixture：目标项存在下游依赖时，拒绝生成"单独 revert 该项"的计划并说明级联原因
- [x] fixture：Rollback 计划产出单个原子 Rollback Slice，不要求实测任何中间状态
- [x] 关闭后 Rollback 工作项记录 rollbackOf[] 指向被回退项；被回退历史项 namespace 不被修改（FR-G08）
- [x] 有 active 工作项时发起 rollback，当前项先被原子 suspend 再 start Rollback 工作项（11.7）
