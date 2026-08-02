# 05 — Low Maintenance 快路径

**What to build:** 严格满足 low allowlist 的单 Slice Maintenance 复用 03 的 Brief 批量确认机制：一份 Maintenance Brief 一次确认 scope（目标、保持不变量、风险画像、回退边界）、单一方案、内嵌验收与单 Slice，原子按序写入后经 scope-confirmed、solution-selected 进入 implementation-ready。快路径不制造重复文档：spec 内嵌 Brief、单 Slice 直接引用 Brief 锚点，不生成独立 Feature spec 或 Slice Markdown（验收场景 3）；缺 scope 声明的不变量或回退边界时不得确认。Maintenance 发现实际属于其他类型时的 close-and-start 重分类不在本票范围（属后续阶段）。

**Blocked by:** 03 — Low Feature 快路径端到端（复用其 Brief 批量确认、不可变事实与停顿计数机制）

**Status:** done

- [x] 表驱动 fixture：low Maintenance 一份 Brief 批量确认 scope、方案与验证计划后进入 implementation-ready
- [x] scope 缺目标、保持不变量、风险画像或回退边界任一项时，scope-confirmed 被拒绝并列出缺失项
- [x] fixture 证明快路径产物只有 Brief 与状态记录，不生成重复 spec 或 Slice Markdown
- [x] 声明会改变外部产品契约的 Maintenance 无法留在 low 快路径（风险门禁升级为至少 medium）
- [x] Maintenance 快路径全流程人工停顿 ≤3 次，与 Feature/Bugfix 共用同一计数口径
- [x] 确认后的 scope/方案事实为不可变 revision，重复确认被拒绝
