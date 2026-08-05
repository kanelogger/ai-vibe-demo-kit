---
status: selected
activity: active-work-item-solution-options
initiativeId: control-plane-convergence
workItemId: wi-20260805-31b819fc
workItemStage: solution-selected
designRef: workflow/proposals/control-plane-convergence/lifecycle-completion-design.md
designConfirmedBy: user
designConfirmedAt: 2026-08-05T15:20:34.102Z
designConfirmationQuote: 确认 P0-WI-01 技术设计
recommendedOptionId: state-parent-anchor
selectedOptionId: state-parent-anchor
selectionConfirmed: true
optionsStateCommit: 60c1bd3f29997adb1c2b5d4f3ea8b16e7857d563
optionsTransactionId: tx-fe6cc58e-3412-470d-9afe-519987d2072c
optionsPublishedAt: 2026-08-05T15:28:36.180Z
selectedBy: user
selectedAt: 2026-08-05T15:30:27.539Z
selectionQuote: state-parent-anchor
selectionStateCommit: c4bb8e2ea8fa2f9c9ced6b8d68e62f1e2812d85b
selectionTransactionId: tx-d6712e1c-e32f-4e1a-816c-f6a20f1a7635
---
# P0-WI-01 Lifecycle Completion 方案选项

> 本文记录已完成的方案比较。用户选择 `state-parent-anchor`，Canonical Work Item 已进入 `solution-selected`；该选择不创建实现规格或 Slice，也不授权编码。

## 决策问题

选择 Promotion Pipeline 如何同时满足四项约束：

1. candidate commit/tree 在 stateRef mutation 成功后必须持久可达；
2. candidate reachability、Slice=`done`、pipeline pointer 与 audit 不得出现部分结果；
3. targetRef 在 P0-WI-01 全程不得移动；
4. Full 必须在精确 candidate 上隔离执行，并在记录前重新验证 identity。

技术设计已固定 Human Review、integration、Full、Promotion seal 和 stage gate 的领域语义。本轮只选择 Git reachability、merge、Full isolation、record ID 和 Hook event 的实现 bundle。

## 固定约束

所有方案都必须：

- 保留 `promotion-pipeline.mjs` 单一外部 seam；
- 使用 Git 原生 merge 语义和精确 mode/symlink identity；
- 让 `runnable → human-reviewed` 只由 approved review transaction 产生；
- 让 `verified → done` 只由成功 integration transaction 产生；
- 让 all-done + current Full 才能 seal Promotion Candidate；
- 让 CLI 与 Hook 调用同一 stage evidence interface；
- 保持 main、v1 bytes 和 Legacy Control Plane 不变；
- 失败时不留下可见 candidate ref、state pointer 或状态标签的半更新。

## 先行 Git 实验

2026-08-05 在 `/tmp/kit-test-state-parent-anchor` 做了独立 Git 实验：

1. baseline commit：`87a083b1afd07aa5b13e35f6b09fcd737ce873ec`；
2. candidate commit：`58d4a5eab4c1b235c556e9d5158a9a0de1e8dca2`；
3. state-0 commit：`12058238fc899ef5eea43e039de557cf0003ecf9`；
4. state-1 commit：`f24dc531383092b04b4a3062de441b41700c5e16`，parents 依次为 state-0、candidate；
5. 删除 candidate branch，只保留 state branch；
6. `git clone --no-local` 后，candidate commit 仍可 `cat-file`/`show`，内容为 `candidate`；
7. `git rev-list --first-parent refs/heads/state` 只返回 state-1 → state-0。

该实验只证明 Option A 的对象可达性与 first-parent 拓扑，不证明生产 merge、CAS、GC、Full 或失败恢复；这些仍必须由实现 Slice 的 fixtures 和 fault injection 验证。

## Option A：state-parent-anchor

**推荐。** 每个产生新 Integration Candidate 的 state commit 使用两个 parents：

```text
state S(n) parents: [state S(n-1), candidate C(n)]
candidate C(n) parent: candidate C(n-1)
```

stateRef 仍只 CAS 一个 ref。state commit 自身 tree 仍是 registry/Work Item/audit 状态树；candidate 只作为额外 parent 保持可达。所有状态读取和审计遍历显式使用 state commit tree 与 first-parent state history。

### Bundle

- Candidate merge：临时 Git index，使用 native three-way merge；source base、current candidate、source commit 三方合并。
- Candidate reachability：`StateTransaction.anchorCommit(candidateOid)`；`commitState` 保持 prior state 为第一 parent，candidate 为唯一额外 parent。
- Full isolation：独立 `git clone --no-local`，checkout 精确 candidate OID，运行登记命令、用户路径和清理后删除 clone。
- Review/full record IDs：review 使用调用方稳定 `reviewId`；Full attempt 使用 transaction-scoped ID，current pointer 绑定 immutable digest。
- Stage event envelope：`{version,eventId,workItemId,fromStage,toStage,stateCommit,actor,at}`；evidence 全由 module 从 stateRef 派生。

### 主要实现变化

| Module | Change |
| --- | --- |
| `git.mjs` | commit/tree/diff 校验、临时 index merge、candidate commit、额外 parent 支持 |
| `state-store.mjs` | transaction candidate anchor；限制零或一个额外 candidate parent |
| `promotion-pipeline.mjs` | Review/Integration/Full/Seal/Stage evidence 全部领域规则 |
| `slice.mjs` / `quick.mjs` | integration base 与 current review/Quick binding |
| `ops.mjs` / `cli.mjs` | 薄调用与稳定 JSON/error |
| `.agents/hooks/` | 单一 stage event Adapter |

### 优点

- 继续使用已经证明的单 stateRef CAS；没有第二个可见 ref 的部分更新窗口。
- state rollback 到 prior state commit 会同时失去 candidate anchor，恢复 identity 自然一致。
- 不提前实现 P0-WI-02 的 multi-ref target/state transaction，Work Item 边界清楚。
- candidate 是普通 commit/tree，可被 clone、checkout、Full 和未来 target Promotion 直接消费。
- 临时 candidate object 在 state CAS 失败时只是不可达对象，可由 Git GC 清理。

### 风险与成本

- stateRef commit 成为 merge commit；任何状态历史工具都必须明确 first-parent，不得假设单 parent。
- Full clone 会携带 stateRef 可达的 candidate history，磁盘/时间成本高于 worktree。
- 必须验证 fetch/clone、GC、shallow 操作和 state migration tooling 对额外 parent 的行为。
- P0-WI-02 仍需独立解决 targetRef + stateRef 原子 Promotion，不能误把本方案当作通用 multi-ref 答案。

## Option B：atomic-candidate-ref

为每个 Work Item 建立专用 ref：

```text
refs/heads/harness/candidates/<work-item-id>
```

Integration 预构建 state commit 与 candidate commit，然后使用 `git update-ref --stdin` transaction 同时 CAS candidate ref 和 stateRef。Full 使用受控 detached worktree checkout candidate ref/OID。

### Bundle

- Candidate merge：临时 index native three-way merge。
- Candidate reachability：atomic update-ref transaction 更新 candidateRef + stateRef。
- Full isolation：detached Git worktree，执行后强制 clean/remove/prune。
- Review/full record IDs 与 Stage event envelope：同 Option A。

### 优点

- candidate ref 直观，可用常规 Git 命令检查、checkout 和运维。
- state commit 保持单 parent，普通 `git log` 不需要 first-parent 约定。
- multi-ref CAS plumbing 可为 P0-WI-02 提供经验与部分基础设施。
- worktree 通常比 no-local clone 更快、占用更少。

### 风险与成本

- 扩大 `state-store` interface：一个 state mutation 开始拥有额外 refs、ref lifecycle 和 cleanup policy。
- dedicated ref 的创建、CAS drift、删除、suspend、abandon、rollback 和孤儿清理都成为新长期契约。
- P0-WI-02 的 target/state acceptance 还包含用户授权、Accepted Baseline 和恢复语义；提前抽象容易形成不合适的通用 transaction 层。
- worktree 共享对象库与 repo administrative state，Full 异常退出和并发操作需要更复杂清理/锁定。
- 任一实现若退化为顺序 update-ref 就违反已确认设计。

## Option C：state-owned-snapshot

把 candidate 文件树作为 stateRef tree 的子树保存，例如：

```text
work-items/<id>/promotion/candidate-tree/**
```

stateRef CAS 自然同时保存状态和候选内容；Full 将该子树 materialize 到临时目录，seal 时再生成 candidate commit。

### Bundle

- Candidate merge：在 state-owned file manifest 上合并。
- Candidate reachability：candidate tree 直接属于 stateRef tree。
- Full isolation：从 stateRef materialize/archive 到临时目录。
- Review/full records 与 candidate snapshot 共存于 state tree。

### 优点

- 单 ref、单 tree、单 CAS，逻辑上的原子范围最直观。
- 不引入 merge-parent 拓扑或 candidate ref lifecycle。
- 所有 evidence 和 candidate bytes 都从 stateRef 一个 tree 读取。

### 风险与成本

- 需要重新实现 Git tree 的 mode、symlink、delete、rename 和 merge semantics，重复 Git 已有能力。
- candidate 在 seal 前不是正常 commit，Full 中依赖 Git history/status 的命令无法真实运行。
- state snapshot 路径前缀会改变 tree identity；seal 时还需额外转换并证明 commit/tree 等价。
- 大仓库 stateRef tree 膨胀，state snapshot 读取成本与代码树大小耦合。
- 与技术设计的“精确 Integration Candidate commit/tree”语义最不自然，未来 Promotion 还要新增转换 seam。

## 对比矩阵

| Criterion | A state-parent-anchor | B atomic-candidate-ref | C state-owned-snapshot |
| --- | --- | --- | --- |
| 单一可见 mutation ref | 强 | 中：两个 refs 原子更新 | 强 |
| candidate 是普通 commit | 是 | 是 | seal 前不是 |
| 复用现有 state CAS | 最大 | 小 | 中 |
| 新长期 lifecycle surface | 小 | 大 | 大 |
| targetRef 保持不变 | 是 | 是 | 是 |
| Git 原生 mode/merge/history | 是 | 是 | 弱 |
| Full 隔离真实性 | clone，强 | worktree，强但共享 admin | materialize，弱 |
| rollback locality | state first-parent | state + candidate ref transaction | state first-parent |
| P0-WI-01 边界 | 最清楚 | 容易提前侵入 WI-02 | 引入旁路模型 |
| 运维直观性 | 中 | 强 | 弱 |
| 已验证的关键假设 | parent reachability 已实验 | 尚未 rehearsal | 尚未 rehearsal |
| 综合风险 | 中 | 中高 | 高 |

## 推荐

推荐 `state-parent-anchor`。

理由：它只深化现有 state transaction，不新增 candidate ref lifecycle，也不把 P0-WI-02 的 multi-ref acceptance 问题提前塞进 WI-01。candidate 仍是正常 Git commit，可直接用于 Full 与未来 Promotion。主要代价是非标准 merge-parent topology，但该行为已通过独立 clone 实验，且可以用“第一 parent 永远是 prior state、最多一个 candidate parent”的窄不变量控制。

`atomic-candidate-ref` 是可行备选；当团队明确要在 WI-01 就建立通用 multi-ref transaction，并接受扩大恢复/清理契约时才选。`state-owned-snapshot` 不推荐：它用自研树语义换取表面单 ref，降低 Git 真实性并增加未来转换。

## 选择后的确定事项

无论选择 A/B/C，后续 `solution-selected.md` 必须固定：

- reachability 与 CAS failure sequence；
- candidate merge 输入/输出和 scope drift 判定；
- Full isolation cleanup；
- immutable record path/ID；
- Stage event JSON；
- 五个实现 Slice 的依赖、Write Scope、Quick 和验收标准；
- rollback/fault-injection matrix。

选定方案后才能推进 `solution-selected`。仍须单独形成 implementation spec、进入 `implementation-ready` 并创建首个 Slice；本次选择不授权编码。

## Selection Gate

可选方案 ID：

- `state-parent-anchor`（推荐）
- `atomic-candidate-ref`
- `state-owned-snapshot`

## Source Register

| Source | Purpose |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | REQ-P0-006 至 REQ-P0-010 |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-design.md` | 已确认领域模型、module interface 与事务结果 |
| `scripts/harness/lib/state-store.mjs`、`git.mjs` | 当前 single-ref CAS 与 commit/tree plumbing |
| `scripts/harness/lib/slice.mjs`、`quick.mjs`、`ops.mjs` | integration base、evidence 与 transition 缺口 |
| `scripts/harness-verify.mjs`、`.harness/config.json` | Full command/user path/cleanup 现状 |
| 本文“先行 Git 实验”记录的命令结果与 OIDs | Option A candidate reachability 与 first-parent observation |
| stateRef transaction `tx-ba0801f6-57e4-4166-b178-2f02a9baab6f` | Design confirmation identity |
| stateRef transaction `tx-fe6cc58e-3412-470d-9afe-519987d2072c` | Developer transition to `solution-options`; quote intentionally null |
| stateRef transaction `tx-d6712e1c-e32f-4e1a-816c-f6a20f1a7635` | Exact user selection `state-parent-anchor` |
