# CLI Adapter Architecture

## Responsibility

把 Distribution 生命周期和 Runtime 控制命令适配为各自 Library Interface，并输出稳定的文本、JSON 和退出码。

## Interface

Distribution 入口是 `ai-vibe-demo-kit <command>`；Runtime 入口是 `harness <command>`。`check-environment` 校验项目环境 Manifest 的结构完成度，`check-result` 提供不读取控制状态的完成 Evidence 检查。

## Invariants

- 公共路径参数必须是仓库相对路径且不得经过 Symlink。
- 只由 Mutation 命令写入 Git 私有 Harness 状态。
- CLI 不复制 Validator 规则；环境、`signal` 和无状态 Evidence 检查必须使用对应的 Validator Interface。

## Files

| File | Responsibility |
| --- | --- |
| `ai-vibe-demo-kit.mjs` | Distribution 参数、统一 JSON envelope、生命周期编排和退出码 |
| `harness.mjs` | 参数解析、命令编排、输出与退出码 |

## Verification

```sh
node --test scripts/harness/test/cli.test.mjs
node --test scripts/harness/test/lifecycle.test.mjs
```
