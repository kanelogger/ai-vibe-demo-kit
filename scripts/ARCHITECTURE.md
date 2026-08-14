# Repository Scripts Architecture

## Responsibility

保存仓库、CI 与发布投影检查。生产 Runtime、Distribution 和 Shared 实现全部位于 `src/`。

## Module Index

| Script | Responsibility |
| --- | --- |
| `check-distribution.mjs` | Source 完整性、Manifest 自举、package files 与 tarball 投影校验 |
| `validate-bundled-skill.mjs` | `workflow-runner` 与 `kit-lifecycle` 的 frontmatter、职责边界和 metadata 校验 |

## Invariants

- 检查脚本只读取发行投影和工作树事实；可分发 Git/Evidence 检查器位于 `source/tools/`。
- 脚本不实现 Runtime 或 Lifecycle 领域规则，不修改业务文件或 Git 历史。

## Verification

```sh
node --test test/distribution/*.test.mjs
```
