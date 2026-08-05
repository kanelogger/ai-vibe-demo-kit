---
status: proposed
activity: non-active-proposal
initiativeId: control-plane-convergence
requirementsStatus: confirmed
requirementsConfirmationQuote: 我确认
optionIds:
  - direct-guarded-bootstrap
  - rehearsed-guarded-bootstrap
  - offline-prepared-bootstrap
recommendedOptionId: rehearsed-guarded-bootstrap
---
# State Bootstrap 方案选项

> 本文只形成方案选项。任何选项都不授权迁移、Git ref 修改、提交、Work Item 启动或代码实现；用户必须另行选择方案并授权精确的 State Bootstrap 操作。

## Source Register

| 来源 | 用途 |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | 已确认的 State Bootstrap 行为、边界与验收标准 |
| `workflow/proposals/control-plane-convergence/roadmap.md` | State Bootstrap 与三个 P0 Work Item 的顺序 |
| `CONTEXT.md` | State Bootstrap、Legacy/Canonical Control Plane 与 Accepted Baseline 术语 |
| `scripts/harness/lib/migrate-v1.mjs` | 当前迁移映射、stateRef 提交、source digest、backup ref 和补偿行为 |
| `scripts/harness/lib/state-store.mjs` | stateRef 单 commit、账本和单 ref CAS 事务 |
| `scripts/harness/lib/git.mjs` | 当前单 ref CAS 与 CAS 删除能力；无多 ref transaction 封装 |
| `scripts/harness/test/migrate.test.mjs` | 初始化、accepted/中间阶段映射、幂等和已有 stateRef 拒绝测试 |
| `scripts/harness/README.md` | v1/v2 状态语义、迁移边界和已声明恢复行为 |
| 实际命令，2026-08-05 | v2 `migrated:false`；`refs/heads/harness/state-migration-backup` 不存在 |
| 用户选择 | “先状态启动，后入口切换”“基线钉住，切换前再索引” |

## 已确认边界

所有方案必须满足：

1. 使用当前已经过测试的 `migrateState` 映射，不在 State Bootstrap 前修改 Harness 代码或 v1 状态。
2. State Bootstrap 前，`stateRef` 与 migration backup ref 必须不存在；targetRef、v1 状态原始字节和配置身份必须固定。
3. v1 accepted 历史映射为 closed accepted Work Item；registry Accepted Baseline 钉住执行时的 target commit/tree。
4. 报告、Sprint 与过程文档不在 Bootstrap 当场复制，通过 baseline tree 保持精确可追溯，并在 P0-WI-03 前强制索引与归档。
5. 迁移成功后只允许 stateRef 管理新 Work Item；legacy 状态保持冻结，不发生双写。
6. 当前 Full 的 TTL/工作区漂移作为已知健康事实记录，不通过重跑 Full 冒充重新验收。
7. State Bootstrap 与首个新 Work Item 之间必须保留一个明确 rollback window；一旦 P0-WI-01 开始，禁止直接删除 stateRef 回到 v1。
8. 用户必须对绑定精确 commit/tree/ref/digest 的 Bootstrap Plan 提供单独授权原话。

## 当前实现事实与缺口

- `migrateState` 在 stateRef 不存在时构建一个 state commit，并以单 ref CAS 发布；已有有效 registry 时幂等 no-op，已有非 Harness stateRef 时拒绝覆盖。
- accepted v1 被映射为 `wi-legacy-v1`、`status=closed`、`outcome=accepted`，legacy 字段保留 v1 history、confirmation 和 selection。
- registry migration 只保存 v1 状态文件路径与 SHA-256；Accepted Baseline 保存 target commit/tree。
- backup ref 在 stateRef CAS 成功后顺序创建；失败时按 expected state commit 补偿删除 stateRef。它不是多 ref 原子事务。
- 当前 CLI 没有 plan、dry-run 或 migration rollback 子命令，也不接收用户授权原话。
- 当前迁移测试没有覆盖 backup ref 创建失败后的补偿分支；该风险必须由 Bootstrap rehearsal 或 State Bootstrap 前的专项实验覆盖。

## 方案 A：direct-guarded-bootstrap

### 做法

1. 在当前仓库生成一次人工可审查的 Bootstrap Plan，记录 targetRef commit/tree、v1 文件路径与 SHA-256、stateRef/backup ref 缺失、预期 legacy 映射、当前 evidence 健康状态和 rollback window。
2. 用户对该 Plan 的 digest 提供授权原话。
3. 立即复核所有 identity 未漂移，直接运行现有 `harness migrate-state --json`。
4. 校验 registry、legacy Work Item、stateRef、backup ref、audit 和 Accepted Baseline；通过后启动 P0-WI-01。
5. 校验失败且 P0-WI-01 尚未启动时，按 expected ref identity 删除 stateRef 与 backup ref。

### 收益

- 完全复用当前 CLI 与实现，步骤最少。
- 不新增代码、临时 ref 或替代状态源。
- 执行时间短，适合可轻易重建的低风险仓库。

### 代价与风险

- 第一次真实执行就是生产仓库迁移，没有独立演练证据。
- rollback 依赖人工 Git plumbing，当前没有仓库自有 migration rollback CLI。
- backup 创建补偿分支未被现有测试实际覆盖，操作风险最高。

### 退出证据

Bootstrap Plan、用户授权原话、迁移 JSON 输出、ref identities、legacy 映射核对和 rollback window 关闭记录。

## 方案 B：rehearsed-guarded-bootstrap（推荐）

### 做法

1. 在不移动 targetRef 的规划分支形成 Bootstrap Plan，记录与方案 A 相同的全部 identity、预期映射和 rollback 命令。
2. 从精确规划 commit 与 refs 创建独立本地克隆；确认 clone 中 targetRef、v1 原始字节和配置 digest 与 Plan 一致。
3. 在独立克隆运行当前 migrator，核对 accepted 映射、audit、source digest、Accepted Baseline 和 backup ref；随后执行一次 rollback rehearsal，证明 clone 恢复到迁移前 ref/tree identity。
4. 把 rehearsal 输入、输出、结果和未覆盖风险写入 Bootstrap Plan；用户对最终 Plan digest 提供授权原话。
5. 在真实仓库重新复核 targetRef、v1 digest、配置、stateRef/backup ref 缺失和工作区边界，任何漂移都使授权失效。
6. 运行现有 `harness migrate-state --json`，逐项核对结果；在 P0-WI-01 启动前保持 rollback window，验证通过后显式关闭该 window 并启动 Work Item。

### 收益

- 不修改 bootstrap 前代码，也不绕过当前 migrator。
- 在真实 refs 变更前验证映射与恢复步骤，能暴露 backup、配置、历史文档或环境差异。
- Plan digest 把用户授权绑定到精确输入，审计性明显高于直接执行。
- 复杂度集中在一次性操作流程，不进入长期 Harness Interface。

### 代价与风险

- 需要维护独立克隆和一份 Bootstrap Plan，执行步骤多于方案 A。
- live migration 仍使用当前“stateRef CAS 后创建 backup、失败补偿”的语义，不是多 ref 原子更新。
- 独立克隆不能证明真实仓库在执行瞬间不漂移，因此 live identity 复核仍是硬门禁。

### 退出证据

Bootstrap Plan 与 digest、clone rehearsal 报告、rollback rehearsal、用户授权原话、live identity 复核、迁移输出、post-migration 核对和 rollback window 关闭记录。

## 方案 C：offline-prepared-bootstrap

### 做法

1. 在独立克隆基于精确 targetRef 与 v1 bytes 运行 migrator，得到已验证的 state commit 和 backup target。
2. 把 state commit 对象传入真实仓库，但先不创建 canonical stateRef。
3. 使用 Git `update-ref --stdin` transaction，在核对 expected refs 后一次创建 stateRef 与 backup ref。
4. 校验 registry 内嵌的 targetRef/stateRef、legacy 映射、audit 和对象 identity，然后启动 P0-WI-01。

### 收益

- stateRef 与 backup ref 可以作为一个 Git ref transaction 发布，原子性强于当前 migrator 的补偿模型。
- 全部状态内容在真实仓库 ref 变化前已经生成并审查。
- rollback 可以在启动 P0-WI-01 前以对应多 ref transaction 完成。

### 代价与风险

- 绕过统一 Harness CLI，在一次性 runbook 中复制 state commit 传输和 ref 发布规则。
- 当前 `git.mjs`、测试和错误契约没有多 ref transaction Interface；操作依赖专家级 Git plumbing。
- 独立克隆的对象、配置与 canonical ref 名必须严格一致，任何遗漏都可能生成内部自洽但指向错误环境的状态。
- 为一次 bootstrap 提前采用 P0-WI-02 才计划正式实现的多 ref 原子能力，顺序倒置且维护成本最高。

### 退出证据

离线 state commit manifest、对象传输校验、多 ref transaction 输入/输出、post-install registry/audit 核对和 rollback transaction rehearsal。

## 比较

| 维度 | A 直接受控执行 | B 演练后受控执行 | C 离线准备后原子安装 |
| --- | --- | --- | --- |
| 复用当前 CLI | 完全 | 完全 | 仅生成阶段 |
| bootstrap 前代码改动 | 无 | 无 | 无，但有额外 Git runbook |
| 独立演练 | 无 | 有 | 有 |
| live ref 发布 | 单 CAS + 补偿 | 单 CAS + 补偿 | 多 ref transaction |
| 用户授权绑定 | Plan digest | Plan + rehearsal digest | state commit manifest |
| 操作复杂度 | 低 | 中 | 高 |
| 规则复制风险 | 低 | 低 | 高 |
| 恢复把握 | 中 | 高 | 高，但依赖手工 plumbing |
| 推荐度 | 不推荐 | 推荐 | 不推荐 |

## 推荐结论

推荐 `rehearsed-guarded-bootstrap`。它保持现有迁移 Module 为唯一实现，通过独立克隆与 live identity 复核降低首次真实迁移风险，并避免在没有活动 Work Item 时特批代码或引入第三个事实源。方案 C 的多 ref 原子发布更强，但应由 P0-WI-02 形成正式深 Interface 后用于 Acceptance/Promotion，不应以一次性 Git runbook 提前复制。

## 选择后的下一关卡

1. 用户明确选择一个 option ID；本文才可生成 `solution-selected.md`。
2. 选定方案形成精确 Bootstrap Plan 模板、rehearsal 清单和 rollback window，不执行命令。
3. 用户另行确认 Bootstrap Plan 与授权原话后，才允许 State Bootstrap。
4. State Bootstrap 成功后，P0-WI-01 仍需独立进入 implementation-ready；本方案选择不授权功能实现。
