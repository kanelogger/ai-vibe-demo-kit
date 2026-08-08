# Workflow Roles

默认使用 Coding Agent 自带的 primary agent 和 subagent。只有以下条件至少满足一项时才新增 Role：

- 需要隔离上下文，避免实现者同时担任独立复核者。
- 需要不同的文件、命令、网络或外部系统权限。
- 需要稳定且可机器校验的专用输出契约。

Role 描述职责、上下文、权限、能力和输出，不以人格设定为主要内容。Workflow 通过 `executor.role_ref` 可选引用 Role；值为 `null` 时使用宿主内建行为。
