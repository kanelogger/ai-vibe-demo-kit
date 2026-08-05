---
status: confirmed
activity: active-work-item
initiativeId: control-plane-convergence
draftAuthorizedBy: user
draftAuthorizedAt: 2026-08-05T14:06:27Z
draftAuthorizationQuote: 确认并写文档
confirmedBy: user
confirmedAt: 2026-08-05T14:17:44Z
confirmationQuote: 我确认
lastAmendedBy: user
lastAmendedAt: 2026-08-05T14:24:47Z
lastAmendmentQuote: 基线钉住，切换前再索引
activatedBy: user
activatedAt: 2026-08-05T15:02:55.142Z
activationQuote: 启动
activeWorkItemId: wi-20260805-31b819fc
---
# Harness Control Plane Convergence 需求

> 本文是已确认需求。State Bootstrap 已完成，用户原话“启动”已通过 Canonical Control Plane 创建 P0-WI-01 `wi-20260805-31b819fc`；Legacy `workflow-state.json` 保持 accepted 且冻结。当前 Work Item 仍处于 `initialized`，该原话不等于 Brief 确认、阶段推进或实现放行。

## 简报

- 解决什么问题：当前仓库同时存在已验收但不可开始下一轮工作的 Legacy Control Plane，以及尚未迁移、能力未闭环的 v2 stateRef 控制面；`accepted` 还混合了历史用户决策、验证时效和工作区变化，导致事实源和状态含义冲突。
- 这一版做什么：通过可回退 State Bootstrap 和三个顺序 Work Item，补齐生命周期闭环，建立 Acceptance Outcome、Accepted Baseline、Baseline Health 与 Workspace State，并在 Cutover Readiness 通过后原子切换公共入口、归档历史和删除旧运行路径。
- 暂时不做什么：不在本提案中迁移状态或修改代码；不实现 Project Profile、Skill Run、来源引用门禁、上下文覆盖策略、基准指标或参考 Profile；不实现 reopen 级联和自动 import 推断。

## 用户请求

> 按照建议写需求和规划
>
> 我确认

本轮 grilling 的用户选择：

- “路线图 + P0 详规”
- “历史结果 + 当前健康度”
- “先补能力再原子切换”
- “等价闭环 + 健康度”
- “基线与工作区分离”
- “三个顺序 Work Item”
- “迁入 stateRef 并归档”
- “核心契约 + 外部 Profile”
- “计划归核心，执行归 Adapter”
- “本地事实源硬门禁”
- “Profile 驱动覆盖门禁”
- “正确性优先，分阶段度量”
- “验收与 Promotion 原子提交”
- “过期降健康度，不撤销验收”
- “风险相关分级”
- “非活动提案包”
- “先状态启动，后入口切换”
- “确认并写文档”
- “基线钉住，切换前再索引”

## Source Register

| 来源类型 | 位置 / 原话 | 用途 | 状态 |
| --- | --- | --- | --- |
| 用户请求 | 上述用户原话和 grilling 选择 | 范围、术语、切换策略和成功口径 | 已确认需求 |
| 当前 v1 状态 | `workflow-state.json`、`workflow/acceptance.md` | 证明当前为 accepted，且保存已有用户验收与报告引用 | 当前事实 |
| v1/v2 架构 | `SPECS/architecture.md`、`scripts/harness/README.md` | 证明两套控制面并存、状态不共享和 v2 未完成边界 | 当前事实 |
| v2 实现 | `scripts/harness/cli.mjs`、`scripts/harness/lib/` | State Bootstrap、Work Item、Slice、Quick、CAS 与审计现状 | 当前实现 |
| 验收校验 | `.harness/config.json`、`scripts/harness-check.mjs` | 24 小时 TTL、工作区指纹和 accepted 报告校验现状 | 当前实现 |
| 实际命令 | `harness status --json`、`harness-check context|gates|evidence`，2026-08-05 | v2 `migrated:false`；context/gates 通过；evidence 因 TTL 和工作区漂移失败 | 本轮观察 |
| 对比材料 | `private-docs/AI代码生成率94%_我们用一个Skill跑通需求开发全流程.md` | Project Profile、Skill 证据、上下文覆盖和指标路线图来源 | 后续路线图输入 |
| 领域语言 | `CONTEXT.md` | 本提案的统一术语 | 本轮形成 |
| 规划 | `workflow/proposals/control-plane-convergence/roadmap.md` | Work Item 依赖、交付边界与退出标准 | 本轮形成 |

## 领域模型

统一语言以 `CONTEXT.md` 为准。核心关系：

1. State Bootstrap 把已 accepted 的 Legacy Control Plane 历史导入 stateRef，使 Canonical Control Plane 成为后续 Work Item 的唯一可变状态源，但不立即切换公共 CLI、Hook 和文档入口。
2. Lifecycle Completion 产生带当前 Full 证据的 Promotion Candidate。
3. 用户原话授权一次原子事务；该事务同时 CAS 更新 targetRef，并写入 Acceptance Outcome、Accepted Baseline 和审计事件。
4. Baseline Health 与 Workspace State 都是只读派生事实；两者都不得修改 Acceptance Outcome。
5. Cutover Readiness 通过后，Control Plane Cutover 才能切换公共入口、归档 legacy 文档并删除 legacy runtime。

## 当前问题

1. `workflow-state.json` 已为 `accepted` 且没有下一阶段，新一轮工作无法由 v1 正式授权。
2. v2 stateRef 尚未迁移；Human Review 证据、Slice done 集成、Work Item Full、Acceptance/Promotion、targetRef 更新和阶段 Hook 尚未形成完整闭环。
3. v1 与 v2 不共享状态，长期并存会产生两个候选事实源。
4. accepted 同时被用作历史决策与当前有效认证；TTL 或任意工作区变化会使已验收仓库重新失败，但修复提示仍要求“验收前重跑”。
5. 当前工作区指纹不区分风险相关改动和无关未提交文件。
6. 直接切换到当前 v2 会降低现有闭环能力；继续扩展 v1 又会制造即将删除的临时代码。

## 目标

1. 在 P0 结束后只保留一个可变 Workflow Control Plane 和一套公共命令、Hook、状态与错误契约。
2. 使用现有可回退迁移能力解决 accepted 后无法启动新 Work Item 的 bootstrap 死锁，全程禁止双写。
3. 在切换公共入口前补齐 v1 等价闭环及新的健康度语义。
4. 保留全部用户原话、阶段历史、验证报告引用、Sprint 证据和审计谱系。
5. 让验收、Promotion、状态迁移和 Cutover 在失败时不产生部分结果。
6. 让状态查询明确区分历史 Acceptance Outcome、Accepted Baseline、Baseline Health 和 Workspace State。
7. 为后续 Project Profile、Skill Run 证据、来源完整性和上下文覆盖提供稳定控制面。

## 非目标

- 本草案不授权运行 `migrate-state`、推进阶段、修改状态或实现代码。
- P0 不实现 reopen 表、下游失效级联或完整 rollback lineage 执行。
- P0 不把 TAPD、Jira、Figma、设计 Token、模拟器或领域 Glossary Adapter 放入 Harness 核心。
- P0 不让 Harness 直接执行模型或 Skill；Skill Run 证据属于后续 Work Item。
- P0 不自动猜测 Code Root、import 图或 Context Guard 前置依赖。
- 不保留可写 v1 兼容层、双写、别名命令或长期 deprecated 路径。
- 不用代码生成率作为 P0 成功指标。

## 需求条目

### State Bootstrap 与唯一状态源

| ID | 需求 | 证据 |
| --- | --- | --- |
| REQ-P0-001 | State Bootstrap 必须是显式用户动作；执行前保持 v1 为当前事实源，本文档不得隐式触发迁移。 | 用户选择“非活动提案包” |
| REQ-P0-002 | State Bootstrap 必须从当前 accepted v1 状态生成可审计的 closed Work Item，保存 v1 状态原始字节摘要、legacy history、confirmation、selection，并钉住当时的 target commit/tree。报告、Sprint 与过程文档无需在 Bootstrap 当场复制，但必须可从该 baseline tree 精确追溯，并在 Control Plane Cutover 前逐项索引、核对和归档。 | 用户选择“基线钉住，切换前再索引” |
| REQ-P0-003 | State Bootstrap 必须创建可验证的 rollback ref，并以 CAS/补偿语义保证失败时 v1、stateRef 和 targetRef 均不产生部分变化。 | 现有 migration 契约 |
| REQ-P0-004 | State Bootstrap 成功后，stateRef 成为新 Work Item 的唯一可变状态源；legacy 状态保持冻结，任何路径不得双写两套状态。 | 单一事实源目标 |
| REQ-P0-005 | P0 必须按 `Lifecycle Completion → Baseline Evidence Model → Control Plane Cutover` 三个 Work Item 顺序交付；每项独立验证、审查、回退并由用户单独放行。 | 用户选择“三个顺序 Work Item” |

### Lifecycle Completion

| ID | 需求 | 证据 |
| --- | --- | --- |
| REQ-P0-006 | Human Review 证据必须绑定 Work Item、Slice、revision、当前 Quick、审查基线和审查者；任一绑定漂移后不得进入后续状态。 | Cutover Readiness 选择 |
| REQ-P0-007 | Slice `done` 必须代表当前 revision 已通过 Quick、Human Review 与验证，并已按依赖顺序集成到唯一 Promotion Candidate；状态标签不得代替集成事实。 | v2 未完成边界 |
| REQ-P0-008 | Work Item Full 必须实际执行登记的静态、测试、契约、关键用户路径和清理，并绑定 Promotion Candidate、配置及依赖摘要；失败或漂移不得进入验收。 | 现有 Full 契约与用户选择 |
| REQ-P0-009 | 阶段 Hook Adapter 必须只规范化平台事件并调用唯一领域门禁；不得复制生命周期、证据或 Promotion 规则。 | 现有 Adapter 原则 |
| REQ-P0-010 | Lifecycle Completion 完成时必须产出一个精确、不可歧义、可复核的 Promotion Candidate，targetRef 此时仍不得改变。 | 原子验收前置 |

### Acceptance、Baseline 与 Workspace

| ID | 需求 | 证据 |
| --- | --- | --- |
| REQ-P0-011 | `accepted` 必须建模为不可变 Acceptance Outcome，而非可过期的活动阶段；TTL、目标分支或工作区变化不得撤销历史用户决策。 | 用户选择“历史结果 + 当前健康度” |
| REQ-P0-012 | Accepted Baseline 必须记录精确 commit/tree、配置与契约身份、Full 报告、Acceptance Outcome 和用户原话。 | 领域模型 |
| REQ-P0-013 | 用户验收必须授权一次原子事务：复核 Promotion Candidate 与 Full 后，CAS 更新 targetRef，并同时写入 Acceptance Outcome、Accepted Baseline 和审计事件；任一步失败全部不生效。 | 用户选择“验收与 Promotion 原子提交” |
| REQ-P0-014 | Baseline Health 至少必须区分 `current`、`verification-stale`、`target-diverged` 和 `integrity-failed`；具体序列化 schema 在方案阶段确定。 | 用户选择“历史结果 + 当前健康度” |
| REQ-P0-015 | Full 超过 TTL 时 Baseline Health 变为 `verification-stale`；重新 Full 可刷新健康度，不要求重新验收，也不得改写 Acceptance Outcome。 | 用户选择“过期降健康度，不撤销验收” |
| REQ-P0-016 | Workspace State 必须独立于 Baseline Health，至少区分 `clean`、`relevant-dirty` 和 `unrelated-dirty`；同时存在两类改动时 relevant 优先并保留分类明细。 | 用户选择“风险相关分级” |
| REQ-P0-017 | relevant 范围必须由当前 Work Item/Slice Write Scope、Code Roots、契约、配置和验证入口等仓库事实确定；不得由模型临时判断。 | 确定性派生原则 |
| REQ-P0-018 | status、Baseline Health 和 Workspace State 查询必须只读、离线、确定性，不调用模型或网络。 | 现有 status 不变量 |

### Control Plane Cutover

| ID | 需求 | 证据 |
| --- | --- | --- |
| REQ-P0-019 | Cutover Readiness 必须证明 Human Review、done 集成、Work Item Full、原子 Acceptance/Promotion、targetRef CAS、Baseline Health、阶段 Hook 和恢复路径均已实际通过；reopen 级联不在门槛内。 | 用户选择“等价闭环 + 健康度” |
| REQ-P0-020 | Control Plane Cutover 必须在一个可恢复操作中切换公共 CLI、Hook、检查器、文档和配置入口；切换失败不得留下混合公共入口。 | 用户选择“先补能力再原子切换” |
| REQ-P0-021 | Cutover 必须把 legacy 原话、状态、报告和过程文档与已导入 stateRef 逐项核对后移入只读归档；归档不是活动事实源。 | 用户选择“迁入 stateRef 并归档” |
| REQ-P0-022 | Cutover 成功后必须删除 `workflow-state.json` 的运行时职责、v1 mutation/verify/stage 公共入口及其专属规则、别名和活跃文档引用；不得保留兼容 shim。 | clean cutover 原则 |
| REQ-P0-023 | Cutover 前必须在隔离 fixture 和仓库 dogfood 场景完成 rollback rehearsal；rollback 后 refs、公共入口、状态、报告与工作树必须恢复到操作前身份。 | 恢复要求 |
| REQ-P0-024 | post-cutover 检查必须拒绝任何非归档文件继续引用或调用 legacy runtime；归档引用必须明确标注 historical。 | 单一控制面目标 |

## 验收标准

### State Bootstrap

- [ ] 在 accepted v1 fixture 上执行 State Bootstrap 后，closed Work Item 精确保留 v1 状态摘要、全部 history、用户原话与选择，Accepted Baseline 精确钉住 target commit/tree；报告与文档可从该 tree 追溯。
- [ ] migration 重跑幂等；注入 stateRef/backup ref/CAS 失败时，无部分 ref 或工作区变化。
- [ ] Bootstrap 后能由 v2 启动首个 P0 Work Item，legacy 状态保持冻结且没有双写路径。

### Work Item 1：Lifecycle Completion

- [ ] Slice 从 ready 到 done 的真实路径要求 current Quick、绑定 Human Review 和可验证集成结果；漂移后确定性拒绝。
- [ ] 所有 Slice done 后形成唯一 Promotion Candidate；Full 实际覆盖登记命令、关键路径与清理，并绑定 candidate identity。
- [ ] 阶段 Hook 与 CLI 对相同输入返回相同决策和稳定错误。

### Work Item 2：Baseline Evidence Model

- [ ] Acceptance/Promotion 成功时 targetRef、stateRef、Acceptance Outcome、Accepted Baseline 和审计事务一致。
- [ ] 任一 CAS、报告复核或写入失败时，targetRef 与 stateRef 都保持原身份。
- [ ] TTL 到期只产生 `verification-stale`；重新 Full 恢复 `current` 且不增加用户验收事件。
- [ ] targetRef 漂移、证据损坏和 relevant/unrelated 工作区变化分别产生预期的只读状态。

### Work Item 3：Control Plane Cutover

- [ ] Cutover Readiness 未全部通过时，公共入口切换被硬拒绝。
- [ ] legacy 文档与 stateRef 导入结果逐项匹配后进入只读归档，用户原话和报告 ID 无丢失。
- [ ] Cutover 后只有 Canonical Control Plane 可改变工作流状态；无 v1 shim、双写或活跃引用。
- [ ] 隔离 fixture 与仓库 dogfood 均完成 cutover/rollback rehearsal，恢复结果按 commit/tree/ref/digest 精确匹配。
- [ ] 当前项目配置登记的静态、测试、契约、关键路径和清理全部通过 Full；用户另行提供最终验收原话。

## 延后到方案阶段的决定

- Control Plane Cutover 的具体 CLI 名称和 JSON schema；State Bootstrap 继续使用现有 `migrate-state`，额外身份与授权事实由选定 runbook 的 Bootstrap Plan 保存。
- 多 ref 原子更新采用的 Git plumbing 细节及失败注入接口。
- legacy 归档的最终路径、文件命名和只读校验实现。
- Baseline Health、Workspace State 的最终序列化字段和显示格式。
- relevant path 分类的优先级细节与大型仓库性能预算。

## 激活条件

1. [x] 用户已用原话“我确认”明确确认本需求。
2. [x] 用户已选择 `rehearsed-guarded-bootstrap`，执行边界与 rollback window 由 `bootstrap-runbook.md` 定义。
3. [x] 用户已显式授权 State Bootstrap，并以单独原话“启动”通过 v2 Work Item 生命周期放行 P0-WI-01。
4. 当前目录是 P0-WI-01 的 confirmed requirements source；Work Item 进入 `implementation-ready` 前不得作为编码授权证据。
