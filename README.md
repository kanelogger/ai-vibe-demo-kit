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
└── SPECS/                           # 长期有效的实现规格模板
```

## 两类权威信息

| 信息 | 权威位置 | 说明 |
| --- | --- | --- |
| 项目身份与开发环境 | `project.yml` | 由 `project-template.yml` 初始化；已有工具配置文件仍是版本事实源 |
| 长期知识与架构决策 | `knowledge/`、`SPECS/` | 按索引渐进加载，候选结论不得冒充正式事实 |
