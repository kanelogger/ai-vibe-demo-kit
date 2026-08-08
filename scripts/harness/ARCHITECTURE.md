# Harness Architecture

## Responsibility

提供零依赖的仓库内控制层：校验 Workflow 和 Stage Result，维护单个活动任务，执行确定性 Gate 转换并保存人工决策。它不执行 Stage、Skill、测试、业务写入或 Git 操作。

## Interface

调用者只使用根目录 `harness` CLI。内部主 Interface 是 `applyControl({ state, workflow, command }) -> { state, decision }`；相同输入产生相同状态转换，时间和 ID 由调用者注入。

## Invariants

- 所有 Mutation 只增加一次 Revision，并通过 PID 短锁和原子 Rename 持久化；仅可证明 owner 已死亡的锁可以自动回收，Git 私有控制路径禁止 Symlink。
- Workflow 在 Start 时绑定内容 Digest；漂移后只允许只读命令和 Abort。
- 结构错误不可 Override；策略失败只有在用户精确接受全部风险后才能继续。
- Redirect、Reject 和 Override 保留旧证据，失效结果标记为 `superseded`。
- 本地 Artifact 位于仓库内、真实存在且不经过 Symlink。

## Modules

| Module | Interface | Responsibility |
| --- | --- | --- |
| ControlKernel | `applyControl`、`inspectState` | 纯状态转换、Gate 和 Human Control |
| Validator | `validateWorkflow`、`validateStageResult`、`validateControlState`、`validateStateAgainstWorkflow` | 可执行结构契约、引用完整性、状态绑定与策略事实提取 |
| FileStore | `loadState`、`mutateState` | Git 私有路径、锁、Revision、原子写入和归档 |
| Installer | `installHarness` | 清单预检、幂等复制和冲突拒绝 |
| CLI Adapter | `harness <command>` | 参数、JSON/文本输出和稳定退出码 |

## Verification

```sh
node --test scripts/harness/test/*.test.mjs
./harness check --json
```
