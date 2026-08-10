# Repository Scripts Architecture

## Responsibility

保存 Harness Library、仓库级确定性检查脚本及其测试入口。

## Module Index

| Module | Interface | Responsibility |
| --- | --- | --- |
| Harness Runtime | `harness/ARCHITECTURE.md` | 状态、校验、生命周期和路径安全 |
| Distribution Check | `check-distribution.mjs` | Manifest 自举、身份、files 投影和 tarball 校验 |
| Bundled Skill Check | `validate-bundled-skill.mjs` | 内置 Skill 与 OpenAI metadata 的零依赖校验 |
| Commit Message Check | `check-commit-messages.mjs <base> <head>` | 校验新增提交主题 |
| Completion Evidence Check | `check-completion-evidence.mjs <base> <head>` | 使用 acceptance Result 同目录 Workflow（缺失时回退默认 Workflow）校验受治理变更 Evidence |

## Invariants

- 检查脚本只读取 Git 和工作树事实。
- 脚本通过稳定退出码表达结果，不修改业务文件或 Git 历史。
- Harness Library 只依赖 Node.js 标准库。

## Verification

```sh
node --test scripts/harness/test/*.test.mjs
```
