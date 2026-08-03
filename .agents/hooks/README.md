# Hooks

`.agents/hooks/` 是 Agent 平台适配层；领域门禁分别由 `scripts/harness-check.mjs` 和 `scripts/harness/lib/context-guard.mjs` 唯一实现，Adapter 不复制规则。

- 会话启动后、开始实现前、提交前：平台 Hook 必须运行 `check-harness.mjs all` 并阻断非零退出码。
- 每次 edit/write 受管路径前：平台调用 `guard-write-context.mjs --file <path> --session <stable-id>`。首次退出 `1` 会返回完整前置并取消写入；同一 session 重试只有在回执仍 current 时放行。
- 阶段推进：平台只能调用 `harness-stage.mjs advance`，不得直接写 `workflow-state.json`；脚本内部会执行候选状态 preflight。
- 验收前：必须先运行 `harness-verify.mjs full`，随后由 `harness-stage` 校验报告有效性。
- 不支持 Hooks 的环境：在相同节点直接运行对应统一 CLI，退出码契约不变。
- 平台负责把自身事件字段映射为 `--file` 与稳定 `--session`；`HARNESS_PROJECT_ROOT` 只用于 Adapter 指定安装项目根。
