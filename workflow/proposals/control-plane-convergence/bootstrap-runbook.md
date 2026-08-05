---
status: proposed
activity: non-active-proposal
initiativeId: control-plane-convergence
selectedOptionId: rehearsed-guarded-bootstrap
executionAuthorized: false
---
# State Bootstrap Runbook

> 本 runbook 定义未来 Bootstrap Plan、独立克隆演练、live preflight、rollback window 和授权证据。它不是 Bootstrap Plan，不包含当前仓库 identity，也不授权执行任何命令。

## 目标

在不修改 bootstrap 前 Harness 代码、不重跑 Full、不双写状态的前提下，使用当前 migrator 将 accepted v1 历史映射为 closed v2 Work Item，使 stateRef 可以管理 P0-WI-01。真实 refs 变化前必须在独立克隆完成迁移与回退演练，真实执行必须绑定最终 Bootstrap Plan digest 和新的用户授权原话。

## 硬约束

1. 规划材料必须位于不移动 targetRef 的 planning branch；State Bootstrap 期间 targetRef 保持用户已验收代码的 commit/tree。
2. 当前 `workflow-state.json` 必须仍为 `accepted`，stateRef 与 `refs/heads/harness/state-migration-backup` 必须不存在。
3. Bootstrap Plan 生成后，targetRef、v1 原始字节、配置、selected solution 或 ref presence 任一变化都会使 Plan 与用户授权失效。
4. clone 与 live 必须运行同一个 `node scripts/harness/cli.mjs migrate-state --json`；不得在 runbook 中重新实现迁移映射。
5. Full 的 TTL/工作区漂移必须原样记录，不得为了 Bootstrap 把历史验收刷新成 current。
6. live migration 只有在 clone migration 与 rollback rehearsal 全部通过后才可请求授权。
7. P0-WI-01 启动即永久关闭 State Bootstrap rollback window；之后禁止直接删除 stateRef。

## 未来证据文件

真实执行准备阶段才创建以下文件，并全部记录 Source Register：

| 文件 | 职责 |
| --- | --- |
| `bootstrap-plan.md` | 精确输入 identities、预期映射、命令、风险、Plan SHA-256 |
| `bootstrap-rehearsal.md` | 独立克隆 migration 与 rollback 的命令、输出和 identity 对照 |
| `bootstrap-authorization.md` | 用户绑定 Plan SHA-256 的执行原话与时间 |
| `bootstrap-receipt.md` | live migration 结果、post-check、rollback window 状态和首个 Work Item 引用 |

这些文件在创建前不存在是正确状态；模板信息由下列字段契约提供，不提前落占位文件。

## Bootstrap Plan 字段契约

### 计划身份

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `planVersion` | integer | 固定为 1 |
| `initiativeId` | string | 固定为 `control-plane-convergence` |
| `selectedOptionId` | string | 固定为 `rehearsed-guarded-bootstrap` |
| `generatedAt` | RFC 3339 | 真实生成时间 |
| `planSha256` | SHA-256 | 对不含本字段的规范化 Plan bytes 计算 |

### 仓库与配置身份

| 字段 | 约束 |
| --- | --- |
| repository root | 规范化真实路径，仅作本地核对，不进入跨机器等价判断 |
| planning commit/tree | 包含已确认 requirements、selected solution 与 runbook 的聚焦提交；不得移动 targetRef |
| config path/SHA-256 | `resolveContext` 实际生效配置与原始字节摘要 |
| targetRef/commit/tree | 三者必须存在且在 rehearsal、授权、live apply 三次核对中完全一致 |
| stateRef | 记录配置值和“必须不存在”断言 |
| migration backup ref | 固定 ref 名和“必须不存在”断言 |

### Legacy 输入身份

| 字段 | 约束 |
| --- | --- |
| v1 source path | migrator 实际命中的候选路径 |
| v1 SHA-256 | 对原始文件 bytes 计算，禁止 parse/re-serialize 后摘要 |
| v1 stage | 必须为 `accepted` |
| history/confirmation/selection summary | 数量、最后原话、确认与选择引用，供 post-check 对照 |
| acceptance document | 从 v1 history/doc 指针解析到 baseline tree 中的路径 |
| historical report | report path、report ID、profile、status、generatedAt，只记录历史事实 |

### 预期迁移结果

| 字段 | 预期 |
| --- | --- |
| mode | `migrate-item` |
| workItemId | `wi-legacy-v1` |
| status/outcome/result | `closed / accepted / changed` |
| registry active item | `null` |
| migration source digest | 等于 v1 SHA-256 |
| Accepted Baseline | 等于 Plan 的 target commit/tree |
| backup ref target | 等于 Plan 的 target commit |
| audit | 包含 migration 与 legacy item 事件，registry/ledger 一致 |

### 健康事实

Plan 必须记录 `harness-check context`、`gates`、`evidence` 的逐项结果。已知的 report TTL 与 workspace drift 可以作为 expected 健康事实，但任何新增的 context/gates、配置解析、Git identity 或 state consistency 错误都会阻断。

## 阶段一：准备 Planning Identity

1. 将本提案、选定方案和 runbook 放入聚焦 planning branch commit，保持 `.harness/config.json` 的 targetRef 不移动。
2. 确认工作区不存在会影响 v1 bytes、配置、targetRef、migration 代码或验证入口的未提交变化；无关变化必须在 Plan 中列出。
3. 解析并记录 Plan 字段契约中的全部 identity。
4. 运行只读 context/gates/evidence 和 v2 status；记录原始退出码与输出。
5. 计算 Plan SHA-256。此时只允许请求“演练”，不得请求 live migration 授权。

## 阶段二：独立克隆演练

1. 创建不共享 refs 的本地克隆，检出精确 planning commit，并确认 targetRef、v1 bytes、配置 SHA-256 与 Plan 一致。
2. 运行迁移/CAS 专项验证：

```sh
node --check scripts/harness/lib/migrate-v1.mjs
node --check scripts/harness/lib/state-store.mjs
node --check scripts/harness/lib/git.mjs
node --test scripts/harness/test/migrate.test.mjs scripts/harness/test/state-store.test.mjs
```

3. 在 clone 中运行：

```sh
node scripts/harness/cli.mjs migrate-state --json
```

4. 对照 Plan 验证 stateRef、registry、legacy Work Item、audit、Accepted Baseline 和 backup ref；任何额外或缺失字段均判失败。
5. 专门验证 backup ref 创建失败补偿。如果无法在不修改生产代码的隔离实验中可靠触发，该缺口必须记录为 blocker，不得静默跳过。
6. 在尚未创建任何新 Work Item 时执行 rollback rehearsal。删除操作必须同时提供 expected OID，且只能在独立 clone 中执行：

```sh
git update-ref -d "$STATE_REF" "$MIGRATION_STATE_COMMIT"
git update-ref -d "$MIGRATION_BACKUP_REF" "$TARGET_COMMIT"
```

7. 验证 stateRef/backup ref 均不存在，targetRef、v1 bytes、配置、工作树和 planning commit 与演练前完全一致。
8. 把全部命令、退出码、关键输出、ref identity 和未覆盖风险写入 `bootstrap-rehearsal.md`，重新计算最终 Plan SHA-256。

## 阶段三：用户执行授权

只有最终 Plan 与 rehearsal 都通过后才请求用户原话。授权格式必须同时包含 Plan digest 和方案 ID：

```text
批准 State Bootstrap plan <plan-sha256>，使用 rehearsed-guarded-bootstrap
```

`bootstrap-authorization.md` 必须保存原话、时间、Plan digest、selected solution 和 rehearsal digest。任何缩写为“确认”“继续”或只重复方案名的回复都不具备执行权限。

## 阶段四：Live Preflight 与 Apply

1. 紧接授权后重新读取真实仓库，不复用 rehearsal 缓存。
2. 逐项比较 targetRef commit/tree、planning commit、v1 SHA-256、配置 SHA-256、stateRef/backup ref absence、selected solution 和 Plan digest。
3. 重新运行 context/gates/evidence；只有 Plan 已记录的 TTL/workspace 健康差异可以继续，其他差异全部使授权失效。
4. identity 完全一致时，运行唯一 live mutation：

```sh
node scripts/harness/cli.mjs migrate-state --json
```

5. 不根据 stdout 自报成功；读取并核对 stateRef、registry、legacy item、audit、Accepted Baseline、backup ref 和 targetRef identity。
6. 写入 `bootstrap-receipt.md`，记录 migration state commit、transaction ID、backup ref、post-check 和 rollback window=`open`。
7. 此时不得自动启动 P0-WI-01。

## Rollback Window

### Open 条件

- live migration 已完成；
- post-check 尚未全部接受，或用户尚未授权启动 P0-WI-01；
- registry 没有 active/suspended 新 Work Item；
- stateRef 仍精确指向 migration commit。

### Window 内回退

1. 重新确认 stateRef、backup ref、targetRef 和无 active/suspended 项。
2. 用户对精确 expected OID 的 rollback 提供单独原话。
3. 使用带 expected OID 的 CAS 删除 stateRef 与 backup ref；任一 identity 漂移立即停止。
4. 复核 targetRef、v1 bytes、配置和工作树不变，并把 receipt 标记为 `rolled-back`。

### Close 条件

post-check 全部通过后，用户必须另行授权关闭窗口并启动 P0-WI-01。启动成功的 state transaction ID 写入 receipt，rollback window=`closed`。

窗口关闭后，直接删除 stateRef 属于禁止操作；任何恢复必须通过 Canonical Control Plane 的 suspend/rollback 语义处理。

## 失败分流

| 失败点 | 动作 |
| --- | --- |
| Plan/rehearsal identity 不一致 | 废弃 Plan，重新生成；不请求授权 |
| clone 专项测试或 migration 失败 | 修复设计或记录 blocker；不触碰 live refs |
| backup 补偿无法验证 | 阻断 live migration |
| 授权后 live identity 漂移 | 授权失效，重新 Plan 与 rehearsal |
| live command 在 stateRef 创建前失败 | 证明 refs 未变化，记录失败 |
| live backup 创建失败 | 验证 current migrator 已补偿删除 expected stateRef；不满足则停止并升级为恢复事件 |
| live post-check 失败且 window open | 使用 expected OID rollback，经用户单独授权 |
| P0-WI-01 已启动后发现问题 | 禁止 bootstrap rollback；suspend active Work Item 并走 Canonical Control Plane 恢复 |

## State Bootstrap 完成判据

只有以下事实全部成立，State Bootstrap 才完成：

- 用户授权原话精确绑定最终 Plan SHA-256；
- clone migration 与 rollback rehearsal 通过；
- live preflight identity 无漂移；
- live migrator 成功，stateRef/backup/registry/item/audit/baseline 全部匹配；
- targetRef 与 v1 bytes 未被修改；
- Bootstrap Receipt 完整；
- rollback window 状态明确；
- P0-WI-01 的启动仍等待独立用户放行。

## Source Register

| 来源 | 用途 |
| --- | --- |
| `workflow/proposals/control-plane-convergence/solution-selected.md` | 选定方案与用户原话 |
| `workflow/proposals/control-plane-convergence/requirements.md` | State Bootstrap 需求与验收标准 |
| `scripts/harness/lib/migrate-v1.mjs` | 唯一 live migration 实现 |
| `scripts/harness/lib/state-store.mjs` | stateRef CAS 与账本事务 |
| `scripts/harness/lib/git.mjs` | ref identity 与 CAS 删除语义 |
| `scripts/harness/test/migrate.test.mjs`、`scripts/harness/test/state-store.test.mjs` | clone rehearsal 的最低专项验证集 |
