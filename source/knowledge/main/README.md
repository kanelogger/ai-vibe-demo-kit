---
id: KB-MAIN-OVERVIEW
type: domain-overview
status: OFFICIAL
owner: "Project maintainers"
updated_at: "2026-08-09"
source_type: official
confidence: high
stability: stable
evidence:
  - "README.md"
  - "ARCHITECTURE.md"
  - "src/runtime/ARCHITECTURE.md"
---

# Global Knowledge

## AI 使用摘要

- 适用场景：需要理解跨应用术语、全局流程或共同约束时。
- 关键入口：`../INDEX.md`、`../ROUTING.md`。
- 使用前必须核对：涉及具体应用实现时，继续读取应用索引并回到代码确认。

## 核心术语

| Term | Definition | Scope | Evidence |
| --- | --- | --- | --- |
| Runtime-ready | Harness Runtime 已安装，默认 Workflow 可校验和运行。 | Distribution Lifecycle | `README.md` |
| Governance-ready | 项目已填写 Agent、环境、架构、知识与规则入口。 | Repository governance | `README.md`、`AGENTS.md` |
| Completion-evidence-ready | Agent 和 CI 可以对 acceptance Stage Result 与验证报告执行同一无状态检查。 | Delivery workflow | `source/workflows/workflow-template.json` |
| Gate | Transition 上的自动或人工推进许可。 | ControlKernel | `src/runtime/kernel.mjs` |
| Policy Failure | 必需 Condition 或 Skill 未满足形成的可人工精确接管状态。 | Workflow policy | `src/runtime/kernel.mjs` |

## 跨应用流程

Agent 或 CI 执行 Stage 内容并产生 Evidence；Validator 校验结构、引用和 policy facts；ControlKernel 根据结果进入下一 Stage、Policy Block 或 Human Gate；人工决定最终批准、拒绝、暂停、重定向、接管或终止。

## 全局约束

- Runtime 保持零 npm 依赖并支持 Node.js 22+。
- Git 私有状态不进入工作树或远程 CI；可携带的 Stage Result 和 Artifact 承担无状态校验职责。
- Harness 不执行测试或清理外部资源，只校验证据声明及其内部一致性。
