# Hooks

`.agents/hooks/` 是 Agent 平台的适配层，不包含任何门禁逻辑。

- `check-harness.mjs`：在支持 Hooks 的 Agent 环境中由平台触发，只调用 `scripts/harness-check.mjs` 并把输出和退出码完整透传给 Agent。
- 不支持 Hooks 的环境：直接运行 `node scripts/harness-check.mjs all`，两者退出码一致。
- 平台接入方式（何时触发、如何注册）由各 Agent 平台自行决定；本目录不做平台假设。
