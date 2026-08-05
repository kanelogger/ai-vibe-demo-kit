---
status: proposed
---
# Canonical Control Plane After Reversible State Bootstrap

The current Legacy Control Plane is accepted and cannot start another work cycle, while the Canonical Control Plane is not yet feature-complete. We propose a reversible State Bootstrap that imports and freezes the accepted legacy history so stateRef can manage the three P0 Work Items, followed by a separate Control Plane Cutover only after lifecycle and health parity are proven. This rejects both an untracked manual implementation exception and new throwaway v1 lifecycle code; after final cutover, legacy runtime paths are removed rather than retained as compatibility shims.

Source: user selections “先状态启动，后入口切换”, “先补能力再原子切换”, “三个顺序 Work Item”, and `workflow/proposals/control-plane-convergence/requirements.md`.
