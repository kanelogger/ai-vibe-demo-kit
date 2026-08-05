---
status: proposed
---
# Keep Project Data And Skill Execution Outside The Core

Harness core owns Project Profile contracts, deterministic Skill Plans, Skill Run evidence validation, and workflow gates; external Project Profiles provide project-specific source Adapters and semantic knowledge, while Agent Adapters execute Skill nodes and submit evidence. Context coverage is declared by a Profile and enforced by the core, rather than inferred from language imports or embedded as TAPD, Figma, simulator, or product-specific dependencies. This preserves a portable control plane while allowing article-grade domain workflows to become installable data planes.

Source: user selections “核心契约 + 外部 Profile”, “计划归核心，执行归 Adapter”, “Profile 驱动覆盖门禁”, and `workflow/proposals/control-plane-convergence/roadmap.md`.
