# Harness Control Plane

`cli.mjs` 是唯一生命周期入口，`lib/control.mjs` 是唯一状态机。没有 registry、Work Item 集合、Slice DAG、audit ledger 或迁移读取路径。

```text
idle -> alignment -> implementation -> acceptance -> idle
```

普通任务跳过两个人工停顿；高风险任务通过 digest 绑定的 alignment 与 acceptance 确认停顿。`check` 执行 Quick，`finish` 对干净且已提交的候选执行 Full，`abort` 只清理活动状态。

状态固定写入 `.git/harness/control.json`：

```json
{
  "version": 1,
  "revision": 0,
  "active": null,
  "last": null
}
```

写入由 `<control.json>.lock` 串行化，临时文件与目标同目录，最终原子 rename。旧 `refs/heads/harness/state` 永不读取。

## 测试

```sh
node --test scripts/harness/test/control.test.mjs scripts/harness/test/state.test.mjs scripts/harness/test/context-guard.test.mjs
node --test scripts/harness/test/*.test.mjs scripts/skills-sync-links.test.mjs
```

用例使用真实临时 Git 仓库，覆盖生命周期、证据失效、原子状态、Context Guard 和三平台 Hook 输入契约。
