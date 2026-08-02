# harness v2 — Phase A：Domain 与 stateRef

统一 `harness` CLI 的状态根基。实现 PRD Phase A：Project Registry、Work Item namespace、
Audit Ledger、stateRef 原子事务、六类型生命周期表、v1→v2 一次性迁移与 rollback ref。

依据：`docs/full-gate-product-requirements.md`（Confirmed v2.0）、ADR-0007、ADR-0010～0015、
ADR-0016。`CONTEXT.md` 是领域语言唯一来源。

## 范围边界

本阶段只交付状态根基。以下属于后续 Phase，刻意不在此实现：

- Brief 批量确认、reopen 表、风险矩阵（Phase B）
- Slice DAG、Write Scope、Quick/Human Review、Promotion、targetRef 更新（Phase C）
- Hooks、Skill 路由、Claude Adapter（Phase D）

v1 公共脚本（`harness-check.mjs`、`harness-stage.mjs`、`harness-verify.mjs`、`skills-sync.mjs`）
在 Phase B cutover 前保持原样；本目录与它们不共享状态文件。

## stateRef 树布局（ADR-0016）

```text
refs/heads/harness/state
  registry.json                  # Project Workflow Registry（唯一项目级真相）
  audit.ndjson                   # 权威 Audit Ledger（所有事件，按事务追加）
  work-items/<work-item-id>/
    state.json                   # Work Item 外壳：status × outcome × result + 类型阶段
    audit.ndjson                 # 派生视图：根账本按 workItemId 过滤，随 namespace 冻结
    facts/  slices/  reports/  reviews/  sources/   # Phase B/C 填充
```

`registry.json`：

```json
{
  "version": 2,
  "targetRef": "refs/heads/main",
  "stateRef": "refs/heads/harness/state",
  "activeWorkItemId": null,
  "suspendedWorkItemIds": [],
  "lastAcceptedBaseline": { "commit": "…", "tree": "…" },
  "sequence": 0,
  "lastTransactionId": null,
  "migration": null
}
```

## 不变量

1. `accepted` 是关闭结果（outcome），不是阶段；阶段表见 `lib/lifecycle.mjs`。
2. 同一项目最多一个 active Work Item；suspended 可多个。
3. 每个 mutation 恰好一个 state commit：registry、Work Item、根账本、per-item 派生视图同事务。
4. 事务内所有事件共享 `sequence`（registry.sequence+1）与 `transactionId`；
   registry 与账本末尾不一致 → `E_STATE_INCONSISTENT`，阻断一切推进。
5. ref 更新只走 compare-and-swap（`git update-ref <ref> <new> <old>`）；并发漂移 → `E_REF_DRIFT`，绝不半更新。
6. 关闭项 namespace 冻结；后继关系写在新项与 registry，不改历史项。
7. status 永远只读；默认离线，不调用模型，不联网。

## CLI（Phase A 子集）

```text
harness status [--json]                       # 只读：active/suspended/baseline/允许动作
harness migrate-state [--json]                # v1→v2 一次性迁移；幂等；失败不半更新
harness start --type <t> --quote "<原话>"
harness advance --to <stage> [--quote "<原话>"]
harness suspend --reason "<原因>"
harness resume <work-item-id>
harness close --outcome <o> [--result <r>] [--quote "<原话>"]
harness suspend-and-start --type <t> --quote "<原话>" --reason "<原因>"
harness close-and-start --outcome <o> --type <t> --quote "<原话>" [--result <r>]
```

退出码：0 成功；1 领域门禁拒绝（`ERROR <code>` + `REPAIR:`）；2 用法/IO/Git 错误。
配置：`.harness/config.json` 的 `git.targetRef` / `git.stateRef`（默认 `refs/heads/main` 与
`refs/heads/harness/state`）。

## 迁移语义

- 无 v1 文件：初始化 v2 空 registry（显式 idle），不建 backup ref。
- v1 `initialized` + 空历史：迁移为 idle；创建 `refs/heads/harness/state-migration-backup`
  指向迁移前 targetRef tip，registry.migration 记录来源路径与 SHA-256。
- v1 中间阶段：迁移为 active `wi-legacy-v1`（type=feature），v1 history/confirmation/selection
  保留在 item `legacy` 字段，可沿 feature 生命周期继续推进。
- v1 `accepted`（v1 误把 accepted 当阶段）：迁移为 closed(outcome=accepted, result=changed)。
- backup ref 创建失败 → 补偿删除 stateRef，target/state 与旧工作区保持原样（场景 28）。

## 测试

```bash
node --test 'overlay/scripts/harness/test/*.test.mjs'
```

覆盖：六类型转移表（允许/拒绝/accepted-非阶段）、事务 CAS 漂移、账本一致性阻断、
迁移幂等与 rollback ref、CLI 全流程与退出码契约。
