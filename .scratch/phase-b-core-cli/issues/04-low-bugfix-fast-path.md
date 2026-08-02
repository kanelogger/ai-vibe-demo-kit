# 04 — Low Bugfix 快路径

**What to build:** 严格满足 low allowlist 的单 Slice Bugfix 复用 03 的 Brief 批量确认机制：一份 Fix Brief 一次确认已确认缺陷（既有契约/不变量 + 可复现偏差）、已确认诊断（证据支持的因果解释，非症状描述）、单一修复方案、单 Slice 与验证计划，原子按序写入后进入 implementation-ready。defect-confirmed 必须同时引用既有契约与可复现偏差；diagnosis-confirmed 必须有证据化因果解释，缺任一条件对应阶段不得确认。当所引问题没有任何既有承诺（契约、不变量或已验收行为）时，start 即拒绝按 Bugfix 建立，并给出明确建议改立 Feature（验收场景 2）。

**Blocked by:** 03 — Low Feature 快路径端到端（复用其 Brief 批量确认、不可变事实与停顿计数机制）

**Status:** done

- [x] 表驱动 fixture：low Bugfix 一份 Fix Brief 批量确认 defect、diagnosis、单一方案、Slice 与验证计划后进入 implementation-ready
- [x] defect 缺既有契约引用或可复现偏差时，defect-confirmed 被拒绝并说明缺失项
- [x] diagnosis 只描述症状、无证据化因果解释时，diagnosis-confirmed 被拒绝
- [x] 无既有承诺的问题无法 start 为 Bugfix；错误输出建议 Feature 并给出首选修复命令
- [x] Bugfix 快路径全流程人工停顿 ≤3 次，与 Feature 共用同一计数口径
- [x] 快路径写入的 defect/diagnosis 事实同样为不可变 revision，重复确认被拒绝
