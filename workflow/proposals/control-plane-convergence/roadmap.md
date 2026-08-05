---
status: active
activity: active-work-item
initiativeId: control-plane-convergence
draftAuthorizedBy: user
draftAuthorizedAt: 2026-08-05T14:06:27Z
draftAuthorizationQuote: 确认并写文档
activatedBy: user
activatedAt: 2026-08-05T15:02:55.142Z
activationQuote: 启动
activeWorkItemId: wi-20260805-31b819fc
activeStage: solution-options
lastStageAt: 2026-08-05T15:28:36.180Z
lastStageQuote: null
lastStageStateCommit: 60c1bd3f29997adb1c2b5d4f3ea8b16e7857d563
lastStageTransactionId: tx-fe6cc58e-3412-470d-9afe-519987d2072c
---
# Harness Control Plane Convergence 路线图

> 本路线图表达依赖、交付结果和退出标准。State Bootstrap 已完成，P0-WI-01 已进入 `solution-options`；尚未由用户选择方案或授权实现。P0 需求以 `requirements.md` 为准；P1/P2 必须在各自启动时重新形成并确认需求。

## Source Register

| 来源 | 用途 |
| --- | --- |
| `workflow/proposals/control-plane-convergence/requirements.md` | P0 行为、边界和验收标准 |
| `CONTEXT.md` | 统一领域语言 |
| `scripts/harness/README.md` | v2 已实现能力与后续 Phase 边界 |
| `.agents/skills.json` | Skill Plan、completion 声明和 Adapter 路由现状 |
| `SPECS/FEATURES/directory-context-guard/spec.md` | Context Guard 声明完整性与当前非目标 |
| `private-docs/AI代码生成率94%_我们用一个Skill跑通需求开发全流程.md` | Project Profile、领域语义桥、覆盖校验、运行时验证和度量启发 |
| 用户 grilling 选择 | P0 三 Work Item、外部 Profile、Skill Run、来源硬门禁、Profile 覆盖和分阶段指标 |
| `workflow/proposals/control-plane-convergence/bootstrap-receipt.md` | State Bootstrap 完成、rollback window 关闭与首个 Work Item 身份 |
| 用户原话 `启动` | 单独放行 P0-WI-01；state transaction 保存时间与审计 |
| 用户原话 `继续` | 推进 `initialized → requirements-draft`；未确认需求 |
| 用户原话 `确认 P0-WI-01 需求基线` | 推进 `requirements-draft → requirements-confirmed`；未确认设计 |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-design.md` | P0-WI-01 Promotion Pipeline 领域模型、module interface 与事务边界草案 |
| 用户原话 `确认 P0-WI-01 技术设计` | 推进 `requirements-confirmed → design-confirmed`；未选择方案 |
| `workflow/proposals/control-plane-convergence/lifecycle-completion-solution-options.md` | Candidate reachability、merge、Full isolation 与 stage event 的三方案对比 |
| stateRef transaction `tx-fe6cc58e-3412-470d-9afe-519987d2072c` | 无用户 quote 的 developer transition 到 `solution-options` |

## 规划原则

1. 正确性优先：P0 先证明唯一事实源、无证据丢失、无部分事务和可回退，再讨论效率。
2. 顺序依赖只表达真实前置；无依赖的 Work Item 可以并行规划，但同一项目仍遵守单 active Work Item 约束。
3. Harness 核心拥有状态、契约、验证和证据判断；Agent Adapter 与 Project Profile 提供执行和项目专用数据面。
4. 每个 Work Item 只交付一种主要能力，必须独立运行、验证、审查、回退和用户放行。
5. P1/P2 不得反向扩大 P0；任何新行为先进入自己的需求确认流程。

## Initiative DAG

```text
State Bootstrap
  -> P0-WI-01 Lifecycle Completion
  -> P0-WI-02 Baseline Evidence Model
  -> P0-WI-03 Control Plane Cutover
       -> P1-WI-01 Local Source Integrity
       -> P1-WI-02 Skill Run Evidence
            -> P1-WI-03 Project Profile Contract
                 -> P1-WI-04 Profile Context Coverage
       -> P2-WI-01 Measurement Contract

P1-WI-01 + P1-WI-04 + P2-WI-01
  -> P2-WI-02 Reference Profile And Benchmark
```

## Bootstrap：State Bootstrap

**Outcome:** 使用现有可回退 migration 将 accepted v1 历史冻结为 closed Work Item，使 stateRef 可以管理新的 P0 Work Item；公共入口尚不切换。

State Bootstrap 只显式导入 v1 状态摘要与 legacy history/confirmation/selection，并钉住 Accepted Baseline commit/tree；报告、Sprint 和过程文档从该 tree 保持可追溯，显式索引与归档延后到 P0-WI-03。

选定方案：`rehearsed-guarded-bootstrap`。完整选择证据见 `solution-selected.md`，操作边界见 `bootstrap-runbook.md`。

**Preconditions:**

- 本提案需求已由用户明确确认。
- migration 的 accepted fixture、幂等、backup ref、补偿和 dry-run 证据当前有效。
- 用户确认精确迁移命令、预期 stateRef identity 和 rollback 命令。

**Exit:**

- stateRef registry 显示 legacy accepted history 已关闭且可审计。
- legacy 状态保持冻结；新状态只写 stateRef。
- P0-WI-01 可由 Canonical Control Plane 正式启动。

## P0：控制面收敛

### P0-WI-01 Lifecycle Completion

**Depends on:** State Bootstrap

**Active Work Item:** `wi-20260805-31b819fc`，stage=`solution-options`，risk=`high`。三方案已形成，推荐 `state-parent-anchor`；尚待用户选择。

**Outcome:** Canonical Control Plane 能把一组 Slice 从实现推进到唯一、已 Full 验证的 Promotion Candidate，但不更新 targetRef。

**Primary uncertainty:** Human Review、集成事实、Full 和阶段 Hook 能否绑定同一 Work Item/Slice/revision/candidate identity，并在任一漂移后 fail closed。

**Planned Slices:**

| Slice | 交付结果 | 关键验证 |
| --- | --- | --- |
| `human-review-evidence` | Human Review 记录绑定 Slice revision、Quick 和审查基线 | 证据缺失、错 revision、Quick 漂移、重复审查 |
| `slice-integration-done` | done 代表依赖满足、当前证据通过且内容已进入唯一 integration candidate | DAG 顺序、scope 冲突、集成失败、重复执行 |
| `work-item-full-verification` | Full 绑定 candidate/config/contracts/user paths/cleanup | 命令失败、摘要漂移、清理失败、报告复用 |
| `promotion-candidate` | 生成精确 candidate commit/tree 与报告身份，targetRef 不变 | 多候选、base 漂移、candidate 内容漂移 |
| `stage-evidence-hook` | 平台事件通过 Adapter 调用唯一阶段门禁 | CLI/Hook 一致性、缺参、稳定错误、无规则复制 |

**Exit criteria:**

- 所有 Slice 的正常与拒绝路径通过行为测试。
- 一个真实 dogfood Work Item 形成 Promotion Candidate 和 current Full。
- targetRef 未被 WI-01 修改。
- 未覆盖风险、清理和 rollback 记录完整。

### P0-WI-02 Baseline Evidence Model

**Depends on:** P0-WI-01

**Outcome:** 用户验收与 Promotion 原子建立 Acceptance Outcome 和 Accepted Baseline；状态查询独立派生 Baseline Health 与 Workspace State。

**Primary uncertainty:** targetRef 与 stateRef 能否在同一可恢复事务中提交，以及 TTL/target/workspace 变化能否只影响正确的派生事实。

**Planned Slices:**

| Slice | 交付结果 | 关键验证 |
| --- | --- | --- |
| `acceptance-baseline-schema` | Acceptance Outcome、Accepted Baseline 和审计字段契约 | schema、不可变性、历史读取、缺失证据 |
| `atomic-acceptance-promotion` | 用户原话授权多 ref CAS；失败无部分结果 | target/state CAS 漂移、报告过期、故障注入 |
| `baseline-health` | current/stale/diverged/integrity 派生状态 | TTL、target 前进/回退、配置/契约/报告损坏 |
| `workspace-state` | clean/relevant-dirty/unrelated-dirty 分类与明细 | tracked/untracked、混合变化、scope/config/contracts |
| `status-and-check-semantics` | CLI/checker 同时报告历史结果和当前健康度 | 只读、离线、稳定 JSON、人类输出一致性 |

**Exit criteria:**

- 原子成功与每个故障点均有可重复实验；任何失败不改变 refs。
- TTL 到期不撤销 Acceptance Outcome；刷新 Full 不新增验收事件。
- 私有文档等无关改动不会把 Accepted Baseline 判为 diverged。
- status、checker、审计和报告对同一状态给出一致结论。

### P0-WI-03 Control Plane Cutover

**Depends on:** P0-WI-02

**Outcome:** Cutover Readiness 通过后，公共 CLI、Hook、检查器、配置和文档原子切换到 Canonical Control Plane；legacy 证据归档，legacy runtime 删除。

**Primary uncertainty:** 切换、历史核对、旧路径删除和 rollback 能否作为一个可恢复操作完成，而不留下混合入口或证据缺口。

**Planned Slices:**

| Slice | 交付结果 | 关键验证 |
| --- | --- | --- |
| `cutover-readiness` | 机器检查 v2 等价闭环、健康度、Hook 和恢复证据 | 任一能力缺失硬拒绝、报告漂移 |
| `legacy-evidence-reconciliation` | stateRef 导入与 v1 原话/history/reports/docs 逐项核对 | 数量、顺序、原文、digest、报告 ID |
| `atomic-entrypoint-cutover` | 一次切换公共命令、Hook、配置和文档 | 故障注入、无混合入口、重复执行 |
| `legacy-archive-and-removal` | 只读归档历史，删除 v1 runtime、状态职责、别名与活跃引用 | 全仓引用检查、archive 例外、无 shim |
| `cutover-rollback-rehearsal` | fixture 与 dogfood 可恢复到切换前 identity | refs、tree、配置、入口、报告、工作区精确匹配 |

**Exit criteria:**

- 只有一个公共 Workflow Control Plane 和一个可变状态源。
- `harness-check all` 与新的完整生命周期关键路径通过。
- legacy runtime 不存在；归档只能通过 historical 查询读取。
- rollback rehearsal、未覆盖风险、清理和用户最终验收完整。

## P1：证据与项目数据面

### P1-WI-01 Local Source Integrity

**Depends on:** P0-WI-03

**Outcome:** Source Register、canonical 文档和 Skill catalog 声明的本地事实源不存在时，阶段门禁硬失败；外部 URL 只校验登记与格式，不依赖实时网络。

**Exit:** 已知的缺失本地引用（如 `docs/` 与历史 ADR）已修复或明确归档，`CONTEXT.md` 等现有事实源保持可发现；fixture 覆盖必需、可选、archive、外部和越界引用。

### P1-WI-02 Skill Run Evidence

**Depends on:** P0-WI-03

**Outcome:** 核心生成 Skill Plan，Agent Adapter 提交绑定 plan/node/input/output/artifact digest 的 Skill Run；阶段门禁验证 required nodes 和 completion evidence。

**Exit:** Harness 不执行模型，但可以确定性证明必需 Skill 节点完成、证据当前且 Adapter 没有修改工作流规则。

### P1-WI-03 Project Profile Contract

**Depends on:** P1-WI-02

**Outcome:** 核心定义可安装 Profile 的 schema、capability、来源锁定、装载、冲突、验证和卸载契约；TAPD/Figma/Glossary/Token/用户路径等实现留在外部 Profile。

**Exit:** 无 Profile 时现有行为不变；至少一个 fixture Profile 可安装、路由、验证和移除，核心无新增项目专用依赖。

### P1-WI-04 Profile Context Coverage

**Depends on:** P1-WI-03

**Outcome:** Profile 可声明文件/模块覆盖清单、review digest 和 stale policy；核心确定性执行 `needs-review` 门禁，同时保留 Context Guard 对已声明依赖的完整性职责。

**Exit:** 新增、删除、大改和知识更新场景可复现；核心不自动推断 import 或语义依赖。

## P2：度量与参考闭环

### P2-WI-01 Measurement Contract

**Depends on:** P0-WI-03

**Outcome:** 定义不依赖代码生成率的机器指标：交付周期、人工停顿、命令/Skill 重试、Review 修改量、验收失败、rollback 和逃逸缺陷；记录采样边界与分母。

**Exit:** 指标能从审计和报告确定性计算，缺失数据显式 unknown，不允许用体感或模型估算补值。

### P2-WI-02 Reference Profile And Benchmark

**Depends on:** P1-WI-01、P1-WI-04、P2-WI-01

**Outcome:** 在独立参考项目完整演示“需求来源 → Profile 收料/语义桥 → 规格 → Slice → Context Guard → Quick/Full → 真实用户路径 → 原子验收/Promotion → 接力”，并记录基线对照数据。

**Exit:** 至少一条新功能和一条 bugfix 路径端到端通过；报告公开样本、分母、失败、人工介入、返工和未覆盖风险，不使用“94%”类无定义指标替代结果。

## 分阶段成功指标

| 阶段 | 首要指标 | 必须为零 |
| --- | --- | --- |
| State Bootstrap | 导入事实逐项一致、rollback 可执行 | 部分 ref、丢失原话、双写 |
| P0 | 单一可变状态源、原子事务、状态无歧义、可恢复 | 混合入口、accepted 被 TTL 撤销、证据冒充集成 |
| P1 | required Skill/Profile/Source/Context 证据可确定性验证 | 核心项目专用依赖、规则复制、静默缺源 |
| P2 | 周期、停顿、重试、返工、失败和缺陷均有明确分母 | 伪造数据、体感替代、只报成功样本 |

## 激活与更新规则

- 当前状态：P0-WI-01 active；Canonical Work Item 为 `wi-20260805-31b819fc`，stage=`solution-options`。
- P0-WI-01 必须继续通过 v2 生命周期确认需求、方案和实现门禁；启动原话不得解释为跳阶段或编码授权。
- 每个 P1/P2 Work Item 启动时必须重新形成三句话简报、Source Register、需求确认和方案选择。
- 新证据推翻依赖或边界时，先更新需求事实源，再更新本 DAG；不得从任务文件反向改写需求。
