# Repository Scripts Architecture

## Responsibility

保存仓库、CI 与发布投影检查。生产 Runtime、Distribution 和 Shared 实现全部位于 `src/`。

## Module Index

| Script | Responsibility |
| --- | --- |
| `check-distribution.mjs` | Source 完整性、Manifest 自举、package files 与 tarball 投影校验 |
| `validate-bundled-skill.mjs` | 内置 Skill 和 metadata 校验 |
| `check-commit-messages.mjs` | 校验指定 Git 范围的提交主题 |
| `check-completion-evidence.mjs` | 使用公开 Runtime CLI 校验 acceptance Evidence |

## Invariants

- 检查脚本只读取 Git、发行投影和工作树事实。
- 脚本不实现 Runtime 或 Lifecycle 领域规则，不修改业务文件或 Git 历史。

## Verification

```sh
node --test test/distribution/*.test.mjs
```
