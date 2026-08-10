# AI Vibe Demo Kit Architecture

## Responsibility

提供可安装到 Git 仓库的零依赖控制层，把项目治理模板、Workflow、Evidence 契约、确定性 Gate 和人工决策组织成可校验资产。

## Interface

维护者和用户通过 npm `ai-vibe-demo-kit` 使用安装生命周期；目标仓库中的 `./harness` 是 Runtime Interface。仓库治理入口是 `AGENTS.md` 和 `project.yml`；安装后的 `AI_ENVIRONMENT_template.md` 提升为 `AI_ENVIRONMENT.md` 后提供环境与能力操作契约；长期知识从 `knowledge/INDEX.md` 渐进加载。

## Invariants

- Runtime 不执行 Stage、测试、Skill、Git 提交或外部写入。
- 所有状态 Mutation 使用 Expected Revision、PID 锁和原子 Rename。
- Runtime Mutation 与 Distribution Lifecycle Apply 共用 RepositoryGuard 的单一锁。
- 生命周期只按 Distribution Manifest 和安装账本授权写入，并通过 canonical transaction 恢复。
- Workflow 在任务启动时绑定 Digest；漂移后禁止继续解释旧状态。
- 本地 Artifact 和 Evidence 必须位于仓库内、真实存在且不经过 Symlink。
- 结构错误不可 Override；Policy Failure 只能由人工精确接受风险。

## Module Index

| Module | Interface | Responsibility | Dependencies |
| --- | --- | --- | --- |
| Distribution CLI Adapter | `bin/ai-vibe-demo-kit.mjs` | init/upgrade/doctor/uninstall/recover/version、稳定 JSON 与退出码 | Lifecycle Module |
| CLI Adapter | `bin/harness.mjs` | 参数、输出、稳定退出码和 Runtime 编排 | Harness Library |
| Repository Scripts | `scripts/ARCHITECTURE.md` | Harness Library、测试和仓库检查脚本 | Node.js、Git |
| Workflow Assets | `workflows/` | 默认状态图、Stage Result 和 Evidence 模板 | Validator contracts |
| Governance | `AGENTS.md`、`project.yml`、`AI_ENVIRONMENT_template.md`、`rules/` | Agent 冷启动、环境、能力、权限和验证规则 | Repository facts |
| Knowledge | `knowledge/INDEX.md` | 稳定项目知识和渐进路由 | Code evidence |

## Dependency Direction

```text
ai-vibe-demo-kit -> Distribution CLI Adapter -> Lifecycle -> RepositoryGuard
harness ----------------> Runtime CLI Adapter -> Harness Library -> RepositoryGuard
Workflow Assets ------------------------------------------> Validator
Governance/Knowledge -------------------------------------> Agent and human callers
```

两个 CLI Adapter 可以依赖 Library；Library 不依赖 CLI、治理文档或平台能力。

## Verification

```sh
node --test scripts/harness/test/*.test.mjs
node scripts/validate-bundled-skill.mjs
node scripts/check-distribution.mjs
./harness check --json
./harness version --json
```
