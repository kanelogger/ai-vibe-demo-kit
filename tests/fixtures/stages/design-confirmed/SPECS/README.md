# SPECS

`SPECS/` 保存长期有效的项目事实，与 `workflow/` 的本轮讨论过程分离。`workflow/` 文档完成后可以归档；`SPECS/` 必须随代码持续演进，是当前实现的约束。

- `ARCHITECTURE.md`：真实技术栈、模块边界、风险和恢复事实。机器可执行的验证命令以 `.harness/config.json` 为唯一登记处，本文件只解释和引用，不复制命令全文。
- `API.md` / `DATABASE.md`：前后端共享的唯一契约来源。任一存在即要求 `.harness/config.json` 的 `commands.contracts` 登记机器校验；项目没有对应契约时删除该文件并在 config 中写明显式说明。实现侧只引用本目录文件路径，不复制契约内容。
- `FEATURES/<feature-slug>/spec.md`：可观察行为、边界和验收标准。
- `FEATURES/<feature-slug>/tasks.md`：与 feature spec 对应的实现和验证任务。

项目需要设计系统或其他专项契约时，在本目录新增事实源，并从 `ARCHITECTURE.md` 建立索引。

目录或文档存在不代表实现已通过验收；验收以真实运行的验证报告为准。
