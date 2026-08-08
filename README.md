# Project Agent Harness

面向具体软件项目的 Coding Agent 装甲层。

它将项目知识、可执行技能、工作流与交付契约组织成一套可加载、可组合、可审计的项目资产，使不同 Coding Agent 能在同一工程语境、规则和质量标准下稳定工作。

代码本身同时是产品与项目记忆。目标项目通过 `project.yml#architecture_memory.code_roots` 声明代码范围；该范围内的每个目录都使用 `ARCHITECTURE.md` 保存职责、接口、依赖和变更导航。项目治理目录不自动纳入该范围。

项目遵循三条核心原则：

- 知识有事实源，避免项目配置与文档重复失真。
- 能力有契约，明确输入、输出、权限与运行要求。
- 流程可恢复、可审计，保留阶段状态、验证证据与人工决策。

## 项目结构

```text
.
├── AGENTS_template.md               # Agent 冷启动入口模板
├── CODING_AGENT_RULES_template.md   # 项目编码规则模板
├── project-template.yml             # 项目身份、环境和权威入口
├── knowledge/                       # 长期有效的项目与业务知识
├── rules/                           # 测试、安全、Git 等主题规则
├── workflows/                       # 声明式协调模板与执行案例
└── SPECS/                           # 长期有效的实现规格模板
```

## 两类权威信息

| 信息 | 权威位置 | 说明 |
| --- | --- | --- |
| 项目身份与开发环境 | `project.yml` | 由 `project-template.yml` 初始化；已有工具配置文件仍是版本事实源 |
| 长期知识与架构决策 | `knowledge/`、`SPECS/` | 按索引渐进加载，候选结论不得冒充正式事实 |

## Workflow 协调模板

`workflows/workflow-template.json` 定义固定的 `idle -> alignment -> implementation -> acceptance -> idle` 生命周期，以及每个阶段的 Skill 调用、输入、输出、人工门禁和退出条件。`abort` 可以从任一活动阶段回到 `idle`。`workflows/workflow-case.json` 用一个已完成的高风险任务展示批准记录、条件跳过、成功回执、产物引用和最终验收。

Skill 来源以 `.agents/skills.sources.json` 为准。执行 Workflow 前，应先通过项目已有的 Skills 同步流程准备所需 Skill；模板不复制来源，也不检查 Skill 是否安装。涉及 issue tracker 写入、Git commit、发布、生产写入或不可逆操作的 Skill，必须先记录对应的人工批准。

每个被触发且标记为 `required` 的 Skill 都必须在案例状态中留下 `succeeded` 回执，并引用实际产物；`failed` 会让 Workflow 停留在当前阶段，因条件未触发而 `skipped` 时必须记录原因。阶段 `instruction` 只是交给 Agent 的任务上下文，其优先级低于平台指令、项目规则和 Skill 自身指令，不能替代或覆盖 System Prompt。

v1 只提供声明和审计约定，没有运行时、JSON Schema 或静态校验器，因此不能强制执行或防止回执被修改。活动状态未来保存在 `.git/harness`；规格、验证摘要和 handoff 等可审计产物进入 `work/requirements/`。Workflow 自有 Subagent 功能目前仅预留 feature 标志，不定义角色、Prompt、调度或合并协议；Skill 内部是否使用 Subagent 仍由该 Skill 自身负责。
