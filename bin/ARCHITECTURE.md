# CLI Adapter Architecture

## Responsibility

把命令行参数和仓库文件适配为 Harness Library 的 Interface 调用，并输出稳定的文本、JSON 和退出码。

## Interface

公共入口是 `harness <command> [options]`。`check-result` 提供不读取控制状态的完成 Evidence 检查。结构与 I/O 错误返回 2，Gate、Policy 或 completion route Refusal 返回 1，成功返回 0。

## Invariants

- 公共路径参数必须是仓库相对路径且不得经过 Symlink。
- 只由 Mutation 命令写入 Git 私有 Harness 状态。
- CLI 不复制 Validator 规则；`signal` 和无状态检查必须使用同一校验 Interface。

## Files

| File | Responsibility |
| --- | --- |
| `harness.mjs` | 参数解析、命令编排、输出与退出码 |

## Verification

```sh
node --test scripts/harness/test/cli.test.mjs
```
