---
status: selected
activity: non-active-proposal
selectionType: option
selectedOptionId: rehearsed-guarded-bootstrap
selectedBy: user
selectedAt: 2026-08-05T14:29:07Z
selectionQuote: rehearsed-guarded-bootstrap
requirementsConfirmationQuote: 我确认
---
# State Bootstrap 选定方案

> 该选择只确定 State Bootstrap 的准备与执行方式，不授权创建真实 Bootstrap Plan、修改 Git ref、执行 migration、启动 Work Item 或实现 P0。

## 决策

选择 `rehearsed-guarded-bootstrap`：使用当前 `migrateState` 作为唯一迁移实现，先在绑定精确 planning commit、targetRef、v1 bytes 和配置 digest 的独立本地克隆中完成迁移与 rollback rehearsal；随后对真实仓库重新执行 identity 门禁，只有用户对最终 Bootstrap Plan digest 提供单独授权原话后，才运行同一 migrator。

## 理由

- 复用当前已通过行为测试的迁移 Module，不在 State Bootstrap 前特批 Harness 代码变更。
- 独立克隆先验证 accepted 映射、stateRef/audit、Accepted Baseline、backup ref 和恢复步骤，降低首次真实迁移的不确定性。
- live identity 复核让 clone 结果只在 targetRef、v1 原始字节、配置和 refs 全部未漂移时可用。
- Plan digest 把用户授权绑定到精确输入，避免把方案选择误当成执行授权。
- 不引入第三个长期状态源，也不在一次性 runbook 中复制 state commit 构造规则。

## 未选择方案

- `direct-guarded-bootstrap`：步骤最少，但第一次执行即修改真实 refs，且当前没有 migration rollback CLI；backup 创建补偿分支也缺少现有自动化覆盖。
- `offline-prepared-bootstrap`：可用多 ref transaction 原子安装，但绕过统一 Harness CLI，要求一次性 runbook 复制对象传输和 Git ref 发布规则；正式多 ref Interface 应由 P0-WI-02 交付。

## 执行边界

1. Bootstrap Plan 必须由 `bootstrap-runbook.md` 规定的身份字段和证据生成。
2. clone rehearsal、rollback rehearsal 和 live preflight 任一失败，都不得请求执行授权。
3. 用户必须使用绑定最终 Plan SHA-256 的新原话授权；本文件中的选择原话不具备执行权限。
4. live migration 后、P0-WI-01 启动前存在唯一 rollback window；关闭后禁止直接删除 stateRef 回到 v1。
5. State Bootstrap 只钉住 legacy state digest 与 Accepted Baseline tree；report、Sprint 和过程文档在 P0-WI-03 前显式索引和归档。
6. 当前 stale Full 只作为健康事实记录，不通过重跑 Full 伪装成新的历史验收。

## 已知风险

- live migrator 仍采用 stateRef CAS 后顺序创建 backup ref、失败补偿删除 stateRef；它不是多 ref 原子事务。
- 独立克隆无法排除真实仓库在演练后的漂移，因此 live identity 复核必须 fail closed。
- rollback window 内仍需要带 expected OID 的 Git ref 删除；当前没有仓库自有 migration rollback 命令。
- current migration suite 未覆盖 backup ref 创建失败分支；rehearsal 必须补足该证据或显式阻断 live migration。

## Source Register

| 来源 | 用途 |
| --- | --- |
| 用户选择 `rehearsed-guarded-bootstrap` | 方案选择原话 |
| 用户选择“基线钉住，切换前再索引” | legacy 证据迁移时点 |
| `workflow/proposals/control-plane-convergence/requirements.md` | 已确认需求与激活门槛 |
| `workflow/proposals/control-plane-convergence/solution-options.md` | 三方案比较、收益、代价和风险 |
| `scripts/harness/lib/migrate-v1.mjs` | 当前 migrator 原子与补偿边界 |
| `scripts/harness/test/migrate.test.mjs`、`scripts/harness/test/state-store.test.mjs` | 已运行的迁移/CAS 行为证据 |

## 下一关卡

按 `bootstrap-runbook.md` 生成真实 Bootstrap Plan 与 clone rehearsal 证据。用户随后必须另行确认 Plan digest；在此之前保持 v1 `accepted`、v2 `migrated:false`，不执行迁移。
