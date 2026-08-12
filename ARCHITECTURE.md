# AI Vibe Demo Kit Architecture

## Responsibility

提供可安装、零依赖、可恢复的 Agent Workflow 控制层。Runtime 负责确定性校验、状态投影和人工 Gate；Distribution 负责完整 Source 与 Runtime 的 Manifest 驱动安装生命周期。

## Public Interfaces

- `ai-vibe-demo-kit <command>`：Distribution CLI。
- `./harness <command>`：源码仓库与下游仓库一致的 Runtime CLI。
- `runRuntimeCommand({ runtimeRoot, cwd, command })`：不接触进程 I/O 的 Runtime command Interface。
- `runDistributionCommand(...)`、`loadDistributionManifest(...)`、`exitCodeForStatus(...)`：Distribution Lifecycle Interface。

## Invariants

- Runtime 不执行 Stage、测试、Skill、Git 提交或外部系统写入。
- 项目只把 `source/.agents/skills.sources.json` 作为外部 Skill 推荐声明分发；不解析、锁定、安装、更新、物化或判断外部 Skill 就绪状态。
- CLI Adapter 只解析参数、格式化输出并转交退出码；领域决策位于 Runtime 或 Distribution Module。
- Runtime Mutation 与 Lifecycle Apply 共用 RepositoryGuard 的单一 PID 锁。
- 生命周期只写 Distribution Manifest 与安装账本授权的路径，并通过 canonical transaction 恢复。
- Workflow 在任务启动时绑定 Digest；结构错误不可 Override，Policy Failure 只能由人工精确接受。
- Doctor 只读取 Manifest 能力、managed 文件、Workflow 和 contract 事实，不检查 JavaScript 源码文本。

## Module Index

| Module | Entry | Responsibility | Dependencies |
| --- | --- | --- | --- |
| Distribution CLI Adapter | `bin/ARCHITECTURE.md` | 参数、JSON/文本格式、退出码；入口为 `bin/ai-vibe-demo-kit.mjs` | Distribution |
| Source Runtime shim | `harness` | 加载 `src/runtime/cli.mjs` | Runtime |
| Install projection shim | `payload/harness` | 加载 `.harness/runtime/cli.mjs` | Installed Runtime |
| Coding Agent Source | `source/manifest.json` | 知识、规则、规格、Workflow 与项目模板的唯一分发树 | Distribution、Agent 与人工调用方 |
| Production Source | `src/ARCHITECTURE.md` | Runtime、Distribution、Shared | Node.js 标准库 |
| Repository Scripts | `scripts/ARCHITECTURE.md` | 仓库、CI、发布检查 | Production facades |
| Tests | `test/` | Runtime 与 Distribution 黑盒/接口验证 | Public facades |

## Dependency Direction

```text
bin/ai-vibe-demo-kit.mjs -> src/distribution/lifecycle.mjs -> src/distribution/sync.mjs -> npm/npx
                                                \-------> src/shared/
source/manifest.json ----> src/distribution/lifecycle.mjs -> target/source/
harness -> src/runtime/cli.mjs -> src/runtime/runtime.mjs -> runtime internals + src/shared/
payload/harness -> .harness/runtime/cli.mjs -> installed runtime/shared projection
scripts/ and test/ -> public production facades
```

## Verification

```sh
node --test test/runtime/*.test.mjs test/distribution/*.test.mjs
node scripts/validate-bundled-skill.mjs
node scripts/check-distribution.mjs
./harness check --json
./harness version --json
```
