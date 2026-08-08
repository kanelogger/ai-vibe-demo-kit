# Project Agent Harness

面向具体软件项目的 Coding Agent 装甲层。

它将项目知识、可执行技能、工作流与交付契约组织成一套可加载、可组合、可审计的项目资产，使不同 Coding Agent 能在同一工程语境、规则和质量标准下稳定工作。

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
├── ARCHITECTURE.md                  # Harness 模块地图与依赖方向
├── knowledge/                       # 长期有效的项目与业务知识
├── workflows/                       # 可复用的工作流定义
├── work/                            # 单次需求的过程、状态和交接产物
├── rules/                           # 测试、安全、Git 等主题规则
├── schemas/                         # Workflow 与 Artifact 契约
└── SPECS/                           # 长期有效的实现规格模板
```

## 四类权威信息

| 信息 | 权威位置 | 说明 |
| --- | --- | --- |
| 项目身份与开发环境 | `project.yml` | 由 `project-template.yml` 初始化；已有工具配置文件仍是版本事实源 |
| 长期知识与架构决策 | `knowledge/`、`SPECS/` | 按索引渐进加载，候选结论不得冒充正式事实 |
| 可复用执行协议 | `workflows/`、`skills/` | Workflow 编排阶段，Skill 提供能力 |
| 单次需求状态 | `work/requirements/<id>/status.yml` | 每个需求只有一个机器可读状态源 |

## 建议启用顺序

1. 将 `project-template.yml` 复制为项目的 `project.yml`，填写真实环境和命令。
2. 从 `AGENTS_template.md` 生成项目根目录的 `AGENTS.md`。
3. 填写 `knowledge/INDEX.md` 和 `knowledge/ROUTING.md`，只登记已有证据的知识。
4. 从 `work/requirements/_template/` 创建一个真实需求目录。
5. 人工跑通一条 Workflow 后，再实现自动调度、重试和复杂 Hooks。

目录本身不代表系统有效。一个无历史上下文的新 Agent 应能只读仓库回答：项目是什么、当前需求在哪个阶段、允许做什么、按什么流程做、如何验证、经验写到哪里。
