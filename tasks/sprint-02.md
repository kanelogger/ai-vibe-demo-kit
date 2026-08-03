# 迭代 02：Project Write Enforcement

## 目标

- 交付一个可独立运行的切片：`context-guard-enforcement`，让检查器、Hook Adapter 与本仓库代码索引复用 Context Guard。
- 首要不确定性：静态检查和写事件适配能否不复制索引、闭包或回执规则。
- 明确的非目标：平台专属注册文件、stateRef 审计、active Slice/Write Scope 绑定、import 自动发现。

## 任务

- [ ] 确认前驱 `context-guard-cli` 已验证并提交。
- [ ] 把静态索引校验接入 `harness-check context`。
- [ ] 实现平台中立 Hook Adapter 并透传 Context Guard 结果。
- [ ] 配置本仓库 Code Roots 和共置 Directory Index。
- [ ] 实际运行 Hook 首次阻断与同会话重试放行路径。
- [ ] 运行 Slice quick、Harness quick 和 full 验证。
- [ ] 清理验证回执并记录回退步骤。
- [ ] 提交只含 Slice 2 的聚焦改动并记录提交哈希。

## Verification Report

- Machine report:
- Commands:
- Results:
- Executed at:
- User-path evidence:
- Uncovered risks:
- Cleanup performed:
- Rollback steps:
- 提交哈希:
