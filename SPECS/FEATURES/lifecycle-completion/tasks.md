# Lifecycle Completion Slice DAG

> 本计划只定义 implementation-ready 后可创建的 Slice。当前未授权实现；所有状态、提交和验证字段在执行前保持未完成。

## Shared Rules

- Canonical Work Item：`wi-20260805-31b819fc`。
- Selected solution：`state-parent-anchor`。
- 五个 Slice 严格顺序；前一 Slice `done` 并形成 candidate 后才创建下一 Slice。
- 每次创建 Slice 时计算并固定当前 `spec.md`、confirmed design、selected solution 和 dependency commit digests；不得复制本文件中的未来摘要占位符。
- 每个 Slice 使用一个独立 source commit、Human Review、integration transaction、Quick report 和回退记录。
- targetRef 必须始终为 `4173b4ac0639eb8db0623659798363854cde8d25`。
- 共享文件只有在前一 Slice `done` 释放 scope 后才由下一 Slice 重新占用。
- Slice 1 code完成后、任何 Review/integration 前，必须把本文件 raw-byte digest、`spec.md` digest、五个 ordered IDs 和 implementation-ready transaction 冻结为 stateRef Implementation Plan；后续 create/Full/seal 只认该集合。

## Slice 1 — Human Review Evidence

**Slice ID:** `human-review-evidence`

**Depends on:** none

**What it delivers:** Promotion Pipeline deep module 的首个可运行 interface；approved/changes-requested Human Review 绑定当前证据，另交付只接受 `current candidate == integration base` 的 exact-base integration kernel，使本 Slice 可用新规则自审查、自验证、自集成并真实进入 `done`。

**Primary uncertainty:** Review 事务与最窄 state-parent anchor integration 能否在同一个深 module 中自举：新代码必须先证明自身 Quick/Review，再用 exact-base source commit 原子产生 candidate + done，且无任何旧的“标签即证据”例外。

**Non-goals:** candidate 已推进时的 three-way merge、scope-outside 并行合并、Work Item Full、Promotion seal、stage Hook。

**Implementation workspace prerequisite:** 从 planning evidence commit materialize confirmed proposal、`CONTEXT.md`、ADR、Harness/architecture updates 和本 Feature Spec 到 base-main Work Item worktree；这些文件随本 Slice source commit进入 candidate。

**Write Scope — subtrees:**

- `workflow/proposals/control-plane-convergence`
- `SPECS/FEATURES/lifecycle-completion`
- `memory/adr`

**Write Scope — exact files:**

- `CONTEXT.md`
- `HARNESS.md`
- `.harness/manifest.json`
- `SPECS/architecture.md`
- `workflow/README.md`
- `scripts/harness/lib/git.mjs`
- `scripts/harness/lib/state-store.mjs`
- `scripts/harness/lib/audit.mjs`
- `scripts/harness/lib/facts.mjs`
- `scripts/harness/lib/promotion-pipeline.mjs`
- `scripts/harness/lib/slice.mjs`
- `scripts/harness/lib/quick.mjs`
- `scripts/harness/lib/ops.mjs`
- `scripts/harness/lib/errors.mjs`
- `scripts/harness/cli.mjs`
- `scripts/harness/README.md`
- `scripts/harness/test/promotion-review.test.mjs`
- `scripts/harness/test/promotion-bootstrap.test.mjs`
- `scripts/harness/test/promotion-plan.test.mjs`
- `scripts/harness/test/state-store.test.mjs`
- `scripts/harness/test/migrate.test.mjs`
- `scripts/harness/test/cases/review-cases.mjs`
- `scripts/harness/test/cases/plan-cases.mjs`
- `scripts/harness/test/table-fixtures.test.mjs`

**Acceptance criteria:**

- Review input rejects missing/unknown fields, unsafe reviewId, unpinned evidence and invalid disposition.
- changes-requested appends immutable attempt/feedback and remains runnable.
- approved writes record/current pointer/audit and advances to human-reviewed atomically.
- missing/failed/stale Quick, wrong revision/base/content/config/contract binding fail closed.
- exact reviewId replay is no-op; conflicting body is stable error.
- generic advance to human-reviewed cannot bypass Review.
- scope revision clears current Review and requires a new attempt.
- planning evidence paths referenced by the Feature Spec exist in the candidate tree.
- exact-base kernel只接受单 parent=integration base 的 source commit，生成 candidate 并以 state commit 第二 parent 保持可达。
- current candidate 一旦不同于 integration base，Slice 1 kernel 硬拒绝；通用 three-way merge 留给 Slice 2。
- `human-review-evidence` 实际使用新 review/verified/integrate commands 自身进入 `done`，禁止旧 generic advance 冒充 integration。
- Implementation Plan 绑定真实 task/spec digests 与 implementation-ready transaction；重排、遗漏、重复、错误 pin 和不同 replay 全部拒绝。
- Full/Seal 在计划五个 Slice 未全部存在且 done 时拒绝，不能把“当前已创建项”当完整集合。

**verification.quick:**

```text
node --check scripts/harness/lib/promotion-pipeline.mjs && node --check scripts/harness/lib/git.mjs && node --check scripts/harness/lib/state-store.mjs && node --check scripts/harness/lib/facts.mjs && node --check scripts/harness/lib/slice.mjs && node --check scripts/harness/lib/quick.mjs && node --check scripts/harness/lib/ops.mjs && node --check scripts/harness/cli.mjs && node --test scripts/harness/test/promotion-plan.test.mjs scripts/harness/test/promotion-review.test.mjs scripts/harness/test/promotion-bootstrap.test.mjs scripts/harness/test/state-store.test.mjs scripts/harness/test/migrate.test.mjs scripts/harness/test/slice.test.mjs scripts/harness/test/quick.test.mjs scripts/harness/test/table-fixtures.test.mjs
```

**Rollback:** Canonical rollback/suspend from this Slice source/integration commit; first-parent state recovery removes its evidence and candidate anchor together. main remains unchanged.

## Slice 2 — Slice Integration Done

**Slice ID:** `slice-integration-done`

**Depends on:** `human-review-evidence`

**What it delivers:** 把 Slice 1 的 exact-base self-integration kernel 深化为通用 native three-way merge：允许 current candidate 在 owned scope 外演进，完整覆盖 mode/symlink/delete/rename、冲突和 candidate chain。

**Primary uncertainty:** 多 candidate object 能否在 single stateRef CAS 中与 done/pipeline/audit 一起变为可达，并在 scope drift、merge conflict 或 CAS drift 时不留下可见部分结果，同时保持 Slice 1 exact-base 行为兼容。

**Non-goals:** Work Item Full、Promotion seal、stage Hook、targetRef Promotion。

**Write Scope — exact files:**

- `SPECS/FEATURES/lifecycle-completion/spec.md`
- `SPECS/FEATURES/lifecycle-completion/tasks.md`
- `scripts/harness/lib/promotion-pipeline.mjs`
- `scripts/harness/lib/git.mjs`
- `scripts/harness/lib/state-store.mjs`
- `scripts/harness/lib/audit.mjs`
- `scripts/harness/lib/slice.mjs`
- `scripts/harness/lib/quick.mjs`
- `scripts/harness/lib/ops.mjs`
- `scripts/harness/lib/errors.mjs`
- `scripts/harness/cli.mjs`
- `scripts/harness/README.md`
- `scripts/harness/test/promotion-integration.test.mjs`
- `scripts/harness/test/state-store.test.mjs`
- `scripts/harness/test/migrate.test.mjs`
- `scripts/harness/test/cases/integration-cases.mjs`
- `scripts/harness/test/table-fixtures.test.mjs`

**Acceptance criteria:**

- ready→implementing captures current candidate; Quick binds that base.
- source commit parent/type/path/content requirements are deterministic and fail closed.
- native merge preserves regular/executable/symlink modes, deletes and renames.
- scope-outside candidate progress merges; scope-inside drift and conflicts reject.
- integration state commit parents are exactly prior state then candidate.
- deleted direct candidate branch does not break no-local clone reachability.
- stateRef CAS failure leaves target/state refs unchanged and no visible candidate ref.
- integration writes done/pipeline/Slice/audit atomically and is idempotent for exact replay.
- ordinary state transactions/migration remain single-parent compatible.

**verification.quick:**

```text
node --check scripts/harness/lib/promotion-pipeline.mjs && node --check scripts/harness/lib/git.mjs && node --check scripts/harness/lib/state-store.mjs && node --check scripts/harness/lib/ops.mjs && node --check scripts/harness/cli.mjs && node --test scripts/harness/test/promotion-integration.test.mjs scripts/harness/test/state-store.test.mjs scripts/harness/test/migrate.test.mjs scripts/harness/test/table-fixtures.test.mjs
```

**Rollback:** Revert the source commit through Canonical recovery; state first-parent recovery removes candidate anchor. Never delete candidate objects or stateRef directly.

## Slice 3 — Work Item Full Verification

**Slice ID:** `work-item-full-verification`

**Depends on:** `slice-integration-done`

**What it delivers:** 在精确 candidate no-local clone 中执行 full static/test/contracts/user paths/cleanup，报告与 candidate/config/dependencies 绑定并存入 stateRef。

**Primary uncertainty:** 长时外部执行能否用 snapshot→execute→CAS-record 模式在任何 candidate/state/config drift 后拒绝背书，同时总能清理隔离 clone。

**Non-goals:** Promotion seal、acceptance-ready gate、targetRef Promotion、Baseline Health。

**Write Scope — exact files:**

- `SPECS/FEATURES/lifecycle-completion/spec.md`
- `SPECS/FEATURES/lifecycle-completion/tasks.md`
- `scripts/harness/lib/promotion-pipeline.mjs`
- `scripts/harness/lib/context.mjs`
- `scripts/harness/lib/ops.mjs`
- `scripts/harness/lib/errors.mjs`
- `scripts/harness/cli.mjs`
- `scripts/harness-runtime.mjs`
- `scripts/harness/README.md`
- `scripts/harness/test/promotion-full.test.mjs`
- `scripts/harness/test/cases/full-cases.mjs`
- `scripts/harness/test/table-fixtures.test.mjs`

**Acceptance criteria:**

- Full refuses before all Slices done or when target/base/candidate bindings mismatch.
- clone checks out exact candidate tree and reads candidate config.
- registered static/test/contracts/user path/cleanup each actually execute and report bounded output/duration/exit.
- cleanup runs after failures; dirty clone or cleanup failure makes report failed.
- clone always removed; failure to clean is surfaced and not hidden.
- live state drift after execution prevents report becoming current.
- current passing unexpired exact report reuses without state transaction; expiry or binding drift reruns.
- failed current-identity report remains audit evidence but cannot seal.
- v1 report/Sprint/workflow-state files are not mutated.

**verification.quick:**

```text
node --check scripts/harness/lib/promotion-pipeline.mjs && node --check scripts/harness/cli.mjs && node --check scripts/harness-runtime.mjs && node --test scripts/harness/test/promotion-full.test.mjs scripts/harness/test/table-fixtures.test.mjs
```

**Rollback:** Revert Slice source/integration commit; immutable failed/passed reports remain only in reverted state history. Remove any leaked temp clone as an incident before retry.

## Slice 4 — Promotion Candidate

**Slice ID:** `promotion-candidate`

**Depends on:** `work-item-full-verification`

**What it delivers:** all-done + current Full 的不可变 Promotion Candidate seal，以及 `implementation-ready → acceptance-ready` 的统一 evidence gate；targetRef 保持不变。

**Primary uncertainty:** seal 与阶段推进能否对 candidate/Full/config/contracts/target identity 做同一判断，并在重复、漂移和并发场景下保持唯一。

**Non-goals:** Hook Adapter、用户 Acceptance、targetRef CAS、Accepted Baseline。

**Write Scope — exact files:**

- `SPECS/FEATURES/lifecycle-completion/spec.md`
- `SPECS/FEATURES/lifecycle-completion/tasks.md`
- `scripts/harness/lib/promotion-pipeline.mjs`
- `scripts/harness/lib/ops.mjs`
- `scripts/harness/lib/errors.mjs`
- `scripts/harness/cli.mjs`
- `scripts/harness/README.md`
- `scripts/harness/test/promotion-candidate.test.mjs`
- `scripts/harness/test/cases/promotion-cases.mjs`
- `scripts/harness/test/table-fixtures.test.mjs`

**Acceptance criteria:**

- missing/non-done Slice、candidate mismatch、Full missing/failed/stale、config/contract drift、target drift 全部拒绝。
- seal writes one immutable candidate and audit event without code-ref mutation.
- exact seal replay is no-op; different identity conflict is stable error.
- generic advance to acceptance-ready requires current candidate through the same evaluator.
- stage evaluator rejects wrong active Work Item/from/to/state commit.
- targetRef remains exact base commit after seal and gate operations.

**verification.quick:**

```text
node --check scripts/harness/lib/promotion-pipeline.mjs && node --check scripts/harness/lib/ops.mjs && node --check scripts/harness/cli.mjs && node --test scripts/harness/test/promotion-candidate.test.mjs scripts/harness/test/table-fixtures.test.mjs
```

**Rollback:** Revert Slice source/integration commit; no targetRef rollback exists because WI-01 never moves it.

## Slice 5 — Stage Evidence Hook

**Slice ID:** `stage-evidence-hook`

**Depends on:** `promotion-candidate`

**What it delivers:** 平台事件到唯一 `harness gate stage` interface 的薄 Hook Adapter、静态文档/manifest/config 注册和 CLI/Hook parity 证据。

**Primary uncertainty:** Adapter 能否只做 event normalization 并在所有 success/refusal/usage paths 上保持与直接 CLI 完全一致，不复制 Promotion rules。

**Non-goals:** 平台厂商专属注册、public Control Plane Cutover、legacy Hook 删除。

**Write Scope — exact files:**

- `.harness/config.json`
- `.harness/manifest.json`
- `.agents/hooks/.harness-index.json`
- `.agents/hooks/README.md`
- `.agents/hooks/stage-evidence.mjs`
- `HARNESS.md`
- `SPECS/architecture.md`
- `SPECS/FEATURES/lifecycle-completion/spec.md`
- `SPECS/FEATURES/lifecycle-completion/tasks.md`
- `scripts/harness/lib/promotion-pipeline.mjs`
- `scripts/harness/lib/ops.mjs`
- `scripts/harness/lib/errors.mjs`
- `scripts/harness/cli.mjs`
- `scripts/harness/README.md`
- `scripts/harness/test/stage-evidence.test.mjs`
- `scripts/harness/test/context-index-check.test.mjs`
- `scripts/harness/test/cases/stage-evidence-cases.mjs`
- `scripts/harness/test/table-fixtures.test.mjs`

**Acceptance criteria:**

- event schema/unknown/missing/stale fields produce stable CLI errors.
- Adapter invokes only unified CLI, contains no lifecycle/evidence rule and passes output/exit status through.
- direct CLI and Adapter produce identical JSON/error for matching events.
- implementation advance rechecks the same rule inside CAS transaction.
- Code Root index, context checker and manifest include the Adapter.
- critical user path executes one allow and representative refusal through the real Adapter.
- full current candidate verification passes and one real dogfood Promotion Candidate exists.
- main remains `4173b4ac0639eb8db0623659798363854cde8d25`.

**verification.quick:**

```text
node --check scripts/harness/lib/promotion-pipeline.mjs && node --check scripts/harness/cli.mjs && node --check .agents/hooks/stage-evidence.mjs && node --test scripts/harness/test/stage-evidence.test.mjs scripts/harness/test/context-index-check.test.mjs scripts/harness/test/table-fixtures.test.mjs
```

**Rollback:** Revert Slice source/integration commit; restore config/manifest/index/Adapter atomically within the candidate. Do not switch public legacy entrypoints.

## Work Item Exit Verification

After Slice 5 is done:

- run Canonical `harness verify full` on the exact Integration Candidate;
- seal the Promotion Candidate;
- compare direct stage gate and Hook Adapter on the same event identities;
- prove targetRef/main unchanged;
- record uncovered risk, clone/index cleanup and each source/integration/state commit;
- request separate user acceptance only through the future P0-WI-02 acceptance model; WI-01 itself stops with a Promotion Candidate.
