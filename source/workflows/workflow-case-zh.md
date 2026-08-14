# Workflow v4 示例：动态能力回退

对应机器可读示例：`source/workflows/workflow-case.json`。

这个 implementation 示例展示两条公开契约：

1. Stage Result 的 `skills[]` 只包含默认 Workflow 声明的 `implementation.workflow-runner` 回执，并引用该 Stage 的全部 required artifacts。
2. 动态领域能力、选择理由、失败尝试和替代执行全部写入 `execution-trace/v1`，不会伪装成 Workflow Catalog 中的 Skill 回执。

示例中 Runner 先选择 `tdd`，但 Agent Host 没有向当前会话暴露该能力，因此把失败原因如实记录。随后 Runner 选择最小替代组合 `agent-native-and-node-test`，完成修改和 focused tests，并引用 implementation notes、test impact 和测试日志。

Harness 对这段记录只做确定性检查：Stage、ID、引用、Evidence 路径、覆盖关系和状态一致性。它不会扫描 `skills.sources.json`，也不会证明 `tdd` 是否安装、过期、已鉴权或远程健康。

完整控制流仍是：

```text
alignment → Human Gate → implementation → acceptance
                                      ↑          |
                                      └ changes-requested

acceptance accepted → Human Gate → complete
```

implementation 内包含编码、focused tests 与 `test-impact/v1`；Phase 1 不增加独立 Test Stage。acceptance 的规格与回归条件只对 `accepted` outcome 强制，cleanup 对所有 outcome 强制，因此真实失败可以用 `changes-requested` 自动回到 implementation。
