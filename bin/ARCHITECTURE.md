# Distribution CLI Adapter Architecture

## Responsibility

`ai-vibe-demo-kit.mjs` 把公共 Lifecycle 与 sync 命令适配为 Distribution Interface 调用，并输出稳定 JSON、文本和退出码。

## Invariants

- 仅解析参数、调用 `runDistributionCommand`、格式化结果并设置进程退出码。
- 不复制 Ownership、Transaction、Recovery 或 Doctor 规则。
- `bin/` 不包含 Runtime 生产实现；Runtime 源码入口是根目录 `harness`。

## Verification

```sh
node --test test/distribution/distribution-cli.test.mjs test/distribution/lifecycle.test.mjs
```
