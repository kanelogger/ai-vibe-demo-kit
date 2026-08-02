# Hooks

`.agents/hooks/` 是 Agent 平台适配层；唯一门禁逻辑仍在 `scripts/harness-check.mjs`，避免出现第二套规则。

- 会话启动后、开始实现前、提交前：平台 Hook 必须运行 `check-harness.mjs all` 并阻断非零退出码。
- 阶段推进：平台只能调用 `harness-stage.mjs advance`，不得直接写 `workflow-state.json`；脚本内部会执行候选状态 preflight。
- 验收前：必须先运行 `harness-verify.mjs full`，随后由 `harness-stage` 校验报告有效性。
- 不支持 Hooks 的环境：在相同节点直接运行上述脚本，退出码契约不变。
- 平台负责注册触发时机；本目录保持平台无关，`check-harness.mjs` 只透传唯一检查器的输出和退出码。
