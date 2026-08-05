---
status: proposed
---
# Separate Acceptance Outcome From Current Health

Acceptance Outcome is an immutable user decision, while Accepted Baseline identifies the exact promoted commit and evidence; Baseline Health and Workspace State are read-only derived facts. User acceptance and targetRef Promotion must commit atomically, report TTL may degrade health to verification-stale without revoking acceptance, and risk-relevant workspace changes are reported separately from unrelated changes. This avoids both accepted-but-unpromoted partial state and the current behavior where time or an unrelated file silently invalidates historical acceptance.

Source: user selections “历史结果 + 当前健康度”, “验收与 Promotion 原子提交”, “过期降健康度，不撤销验收”, “基线与工作区分离”, “风险相关分级”, and `workflow/proposals/control-plane-convergence/requirements.md`.
