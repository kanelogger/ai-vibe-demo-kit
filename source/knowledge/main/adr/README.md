# Architecture Decision Records

重要架构选择使用编号文件记录，例如 `0001-use-event-driven-correction.md`。

每条 ADR 必须声明当前状态和替代关系：

- `proposed`：等待确认。
- `accepted`：当前有效。
- `superseded`：已被新 ADR 替代，并链接替代项。
- `rejected`：已评估但未采用。

新决定覆盖旧决定时，同时更新两份记录，避免 Agent 读取到互相冲突的“有效决定”。
