# Project Agent Harness Architecture

## Responsibility

提供可安装到 Git 仓库的零依赖控制层，把项目治理模板、Workflow、Evidence 契约、确定性 Gate 和人工决策组织成可校验资产。

## Interface

调用者通过根目录 `harness` 命令使用 Runtime。仓库治理入口是 `AGENTS.md` 和 `project.yml`；长期知识从 `knowledge/INDEX.md` 渐进加载。

## Invariants

- Runtime 不执行 Stage、测试、Skill、Git 提交或外部写入。
- 所有状态 Mutation 使用 Expected Revision、PID 锁和原子 Rename。
- Workflow 在任务启动时绑定 Digest；漂移后禁止继续解释旧状态。
- 本地 Artifact 和 Evidence 必须位于仓库内、真实存在且不经过 Symlink。
- 结构错误不可 Override；Policy Failure 只能由人工精确接受风险。

## Module Index

| Module | Interface | Responsibility | Dependencies |
| --- | --- | --- | --- |
| CLI Adapter | `bin/harness.mjs` | 参数、输出、稳定退出码和 Runtime 编排 | Harness Library |
| Repository Scripts | `scripts/ARCHITECTURE.md` | Harness Library、测试和仓库检查脚本 | Node.js、Git |
| Workflow Assets | `workflows/` | 默认状态图、Stage Result 和 Evidence 模板 | Validator contracts |
| Governance | `AGENTS.md`、`project.yml`、`rules/` | Agent 冷启动、环境、权限和验证规则 | Repository facts |
| Knowledge | `knowledge/INDEX.md` | 稳定项目知识和渐进路由 | Code evidence |

## Dependency Direction

```text
harness -> CLI Adapter -> Harness Library -> Node.js standard library
Workflow Assets -------------------------> Validator
Governance/Knowledge --------------------> Agent and human callers
```

CLI Adapter 可以依赖 Library；Library 不依赖 CLI、治理文档或平台能力。

## Verification

```sh
node --test scripts/harness/test/*.test.mjs
./harness check --json
./harness version --json
```

