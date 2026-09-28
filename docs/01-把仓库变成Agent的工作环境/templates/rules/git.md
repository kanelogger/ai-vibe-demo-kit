# Git Rules

- 开始前检查并保留用户已有改动。
- 每一行改动都应能追溯到当前需求。
- 不擅自推送、发布、改写历史或执行破坏性清理。
- 验证完成后报告变更清单和验证结果；不自动创建提交，是否提交、何时提交由用户决定。
- 提交与推送统一通过 `git-commit-push` Skill 执行：暂存边界、敏感信息审查、提交消息生成和推送核验以 Skill 流程为准；本文件只补充 Skill 未覆盖的约束，冲突时以 Skill 为准。
- 并行实现只是迁移手段：替换验证通过后必须删除旧路径，旧实现不得与替换实现永久共存；
  删除旧路径与替换在同一需求内完成，并把删除后的关键路径验证纳入验收证据。
- 用户要求提交时，一个逻辑变更形成一个提交；实现、测试和直接相关文档必须在同一个提交中。
- 提交前运行 `node source/tools/check-commit-messages.mjs <base-ref> HEAD`，CI 只检查当前变更引入的新提交。
- `feat`、`fix` 只要修改项目配置的行为路径，同一 commit 必须新增或更新测试；CI 使用 `source/tools/check-change-tests.mjs` 逐 commit 校验，不接受豁免。
- 受治理变更必须在 `work/requirements/<work-id>/` 提交 acceptance Stage Result、verification report 和生成该结果的 `workflow.json`，且证据提交必须与受治理内容提交落在同一 `<base-ref>..HEAD` 区间——`work/` 本身非 governed 路径，任何包含 governed 变更却缺少同区间验收证据的推送区间都会失败，不存在"先推内容、下轮补证据"的选项；CI 优先用同目录 Workflow 校验，缺失时才回退默认 Workflow，并运行 `node source/tools/check-completion-evidence.mjs <base-ref> HEAD`。
- 只读任务不创建空提交；未通过的检查必须明确报告。
