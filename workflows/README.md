# Workflows

Workflow 描述可复用的研发协议：阶段依赖、执行者、能力、输入输出、验证和人工门禁。单次需求的实际状态写入 `work/requirements/<id>/`。

## v1 支持面

- 有向无环的阶段依赖
- `primary_agent`、`subagent`、`human` 三种执行者
- 通过 capability 选择 Skill 或宿主内建能力
- 默认使用宿主内建 subagent；只有上下文、权限或输出契约确实不同才引用自定义 Role
- 文件化输入和 Artifact 输出
- 入口、出口与人工门禁
- 策略和审计类 lifecycle hooks

第一版不定义循环、自动修复、动态安装 Skill 或任意代码表达式。出现真实需求后再扩展 Schema。

## Stage 与 Hook

- Stage 承担需求分析、实现、验证和交接等业务动作。
- Hook 承担权限检查、格式检查、状态记录和审计等横切动作。

Hook 失败必须阻止阶段推进并留下证据。高风险命令和外部写入必须要求人工批准。

自定义 Role 放在 `roles/`，生命周期 Hook 的约束放在 `hooks/`。两者都是可选扩展，缺省时由宿主 adapter 使用内建能力。
