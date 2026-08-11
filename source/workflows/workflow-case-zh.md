# 工作流案例中文翻译：异步取消预检修复（async-cancellation-precheck-fix）

> 原文：`source/workflows/workflow-case.json`（caseVersion 1，caseKind `illustrative-completed-run`·示例性已完成运行）
> 技能名称对照：`source/workflows/skills-list.json`（目录中 9 个可用技能）

| 字段 | 值 |
|---|---|
| 案例 ID | `async-cancellation-precheck-fix` |
| 模板引用 | `source/workflows/workflow-template.json` |
| 技能目录 | `source/workflows/skills-list.json` |
| 关闭时间 | 2026-08-08T12:05:00Z |

## 1. 工作项（workItem）

| 字段 | 值 |
|---|---|
| ID | `wi-async-cancellation-precheck` |
| 类型 | bugfix（缺陷修复） |
| 意图 | 在任何 outbox（发件箱）写入**之前**拒绝不合格的订单取消，同时保留已验证的既有（legacy）确认状态与历史时间字段行为。 |
| 主要不确定性 | 取消资格判定应该放在 outbox 接缝之前，还是放在下游消费者侧。 |
| 特征 | 变更领域模型 ✓ 变更模块接口 ✓ 多任务 ✓ 测试先行 ✓ 触碰稳定核心 ✓ 需集成测试 ✓ 需交接 ✓ |

**验收标准**

| 编号 | 内容 | 类型 |
|---|---|---|
| AC-1 | 不合格取消返回指定拒绝响应，且不产生任何 outbox 记录。 | spec |
| AC-2 | 合格取消恰好产生一次 accepted 状态迁移和一条 outbox 记录。 | spec |
| AC-3 | 针对 legacy carrier-intercept 状态与历史时间字段的基线夹具，保持已确认行为。 | regression |
| AC-4 | 真实取消路径在真实数据库和 outbox 上执行，之后移除全部测试记录。 | operational |

**任务引用**：contract-test（ORD-241 · 契约测试）、implementation（ORD-242 · 实现）、acceptance（ORD-243 · 验收）

## 2. 状态机（state）

迁移链：`idle →(align 09:00) alignment →(complete 10:00) implementation →(finish 11:10) acceptance →(accept 12:05) idle`

- 基线：`example/main` @ `example-baseline-8f31c2a`
- 候选：`example/fix/cancellation-precheck` @ `example-candidate-4db79e1`，验证期间候选未发生变更

## 3. 风险（risk）

- **等级：高**；信号：`cross-core-module-change`（跨核心模块变更）
- 理由：该变更把业务规则决策移动到了"持久化 outbox 副作用"这一（事务）接缝之上。
- **回滚**：禁用预检路径，回退 `example-candidate-4db79e1`，恢复基线 handler 顺序；无需数据迁移。

## 4. 事实来源（factSources）

**知识层**
- **KF-1**（confirmed-intent，基线已验证）：取消资格判定必须发生在持久化副作用之前。
- **KF-2**（confirmed-intent，基线已验证）：carrier-接管状态与历史时间字段存在必须保留的兼容行为。

**代码层**
- **CF-1**（verified）：基线 handler 先写 outbox 记录，再由下游消费者评估资格——即缺陷所在。
- **CF-2**（verified）：基线夹具已编码被接受的 legacy 状态与时间字段行为。

**冲突 | FC-1**：知识源（KF-1）要求先判定后写，而当前代码先产生副作用（CF-1）。
**解析**：以知识源为已确认的产品意图，以基线代码为缺陷的权威证据。→ 已解决

**定案事实**（resolvedFacts）
- **RF-1**：资格判定必须在调用 OutboxWriter 之前返回决策。
- **RF-2**：legacy 兼容性以通过确认的基线夹具为准，而不是未经核实的文字重建。

## 5. 约束台账（constraintLedger）

| 约束 | 类型 | 内容 | 关联验收 |
|---|---|---|---|
| CON-ORDER-01 | 顺序不变量 | 不合格取消必须产生零次持久化 outbox 写入。 | AC-1 |
| CON-COMPAT-01 | 兼容性不变量 | legacy carrier-接管与历史时间字段夹具必须维持基线行为。 | AC-3 |
| CB-01 | 实现上下文（澄清既有约束） | `CancellationPolicy.evaluate` 必须在 `OutboxWriter.append` 可达之前返回决策。（在 attempt-1 恢复期新增，**非新业务决策**） | — |

传播范围：切入 spec、tdd-evidence、constraint-backfill、implementation-notes。

## 6. 确认与审批（confirmations / approvals）

- 对齐确认（用户，09:58）：「确认前置outbox 接缝、兼容性约束与回滚方案。」
- 验收确认（用户，12:05）：「接受未经变化的候选，记录发布与回滚条件。」
- 审批通过项：发布规格书（09:46·issue-tracker-write）、发布任务（09:52·issue-tracker-write）、候选提交（11:05·git-commit）。

## 7. 阶段执行记录（stageRuns）

### 阶段 1 · 对齐（alignment）09:00–10:00 · 成功

| 步骤（技能） | 时间 | 摘要 | 产物 |
|---|---|---|---|
| diagnosing-bugs（诊断） | 09:00–09:12 | 复现：不合格取消在拒绝前写出了 1 条 outbox 行。 | diagnosis.md |
| prototype（原型） | 09:12–09:22 | 对比"前置"与"下游"两条路径：只有前置路径保持零写入不变量。 | prototype-evidence.md |
| domain-modeling（领域建模） | 09:22–09:30 | 确认取消决策与 legacy 兼容术语；不重新定义基线行为。 | domain-decisions.md |
| codebase-design（代码库设计） | 09:30–09:40 | 把 `CancellationPolicy.evaluate` 放到 OutboxWriter 接缝之前，并让返回的决策成为接口测试面。 | module-design.md |
| to-spec（规格化） | 09:40–09:50 | （等待审批 → 09:46 批准 → 成功）发布顺序、兼容、回滚与可观测的验收契约。 | spec / requirement.md |
| to-tickets（任务拆分） | 09:50–09:56 | （等待审批 → 09:52 批准 → 成功）拆分契约测试、实现、验收三个 tracer-bullet。 | ORD-xxx 任务 |

**退出条件全部满足**：已触发的必跑技能全部成功 · 必选产出已记录 · 权威事实已解决 · 已确认约束已传播 · 验收标准可观测 · 风险已分类 · 高风险对齐已确认。

### 阶段 2 · 实现（implementation）10:00–11:10 · 成功（含 2 次尝试）

| 步骤 | 时间 | 摘要 | 产物 |
|---|---|---|---|
| tdd（测试先行） | 10:00–10:15 | 先建立**失败**的接口契约与数据库集成检查：顺序、单次写入、legacy 兼容。 | tdd-evidence.md |
| implement（实施 · 尝试 1） | 10:15–10:35 | ✗ **失败**（规格不匹配）：策略已提取但仍在 `OutboxWriter.append` 之后调用；集成检查观测到"拒绝仍有 1 条 outbox"。违反 CON-ORDER-01 / AC-1；可重试。 | attempt-1-checks.md |
| TODO（恢复） | 10:35–10:40 | 恢复策略＝方差为 stay-in-stage（停留本阶段重试）；澄清既有约束 CB-01（非新业务决策），约束回填。 | constraint-backfill.md |
| implement（尝试 2） | 10:40–11:03 | ✓ 将 `CancellationPolicy.evaluate` 前移到 `OutboxWriter.append` 之前；focused + quick 验证通过。 | attempt-2-checks.md / candidate-commit |
| 审批 → 提交 | 11:05 → 11:10 | 用户批准候选提交；提交 `git:example-candidate-4db79e1`。 | implementation-notes / architecture-impact / quick-evidence |

**退出条件**：必跑技能成功 · 产出已记录 · 失败尝试全部保留 · 候选已提交 · quick 证据最新且通过。

### 阶段 3 · 验收（acceptance）11:10–12:05 · 成功

| 步骤 | 时间 | 摘要 | 产物 |
|---|---|---|---|
| code-review（代码评审） | 11:10–11:28 | 对固定基线做标准/规格双维复查，无阻塞发现。 | code-review.md |
| verification（快速 + 完整验证） | 11:28– | 验证矩阵 **AC-1..AC-4 全部 passed**，证据为当前候选。 | verification-report（implementation-check） |
| 关键用户路径（实跑） | — | ①**拒绝先于 outbox**：真实测试库建不合格订单 → 走应用入口 → 观察拒绝响应 → 真实 outbox 查 0 行；②**legacy 兼容**：装夹具 → 走入口 → 与冻结基线比对。均为实际执行 ✓ | verification-report |
| 清理（cleanup） | — | 移除测试订单、outbox 行、临时数据库夹具。 | cleanup-evidence.md |
| 发布计划 | — | 发布执行 out-of-scope；回滚预案与风险方案一致；可观测信号：取消拒绝率 / 每单 outbox 行数 / 消费者错误率。 | release-plan.md |
| handoff（交接） | 11:42–11:47 | 临时交接 → 正式交接，指向发布/回滚/验证/知识回填证据。 | session-handoff / handoff.md |
| 知识回填候选 | — | 状态「候选、待 owner 复核」；待代码中回验：状态枚举名、时间字段名、handler 与 outbox 接口名。 | knowledge-backfill-candidate.md |

**退出条件**：全证据最新且通过 · 关键用户路径真实执行 · 清理通过 · 发布计划已记录 · 知识候选已记录 · 候选未变 · 高风险验收已确认。

## 8. 验证与交付（verification / delivery）

- quick & full 验证：passed，均为 current。
- 验收矩阵：AC-1 ✓ AC-2 ✓ AC-3 ✓ AC-4 ✓。
- 清理：移除 `测试订单 / outbox 行 / 临时数据库夹具`。
- 发布：`releaseExecution: out-of-scope`；回滚预案匹配风险方案。
- 知识回填：候选状态，待 owner 复核（`cancel-*` 状态枚举名 / 时间字段名 / handler 与 outbox 接口名 需回到代码中再核验）。

## 9. 产物索引（artifactIndex）

共 24 项：diagnosis（报告）、prototype-evidence（实验）、domain-decisions（决策）、module-design（决策）、spec（规格书）、ticket-contract/implementation/acceptance（任务）· tdd-evidence（测试证据）、attempt-1-checks（失败检查）、constraint-backfill（约束映射）、attempt-2-checks（测试证据）、candidate-commit（Git 提交）、implementation-notes（报告）、architecture-impact（报告）、quick-evidence（验证）、review-evidence（评审）、verification-report(实现检查)、session-handoff（临时交接）、delivery-handoff（交接）、cleanup-evidence（清理）、release-plan（发布计划）、knowledge-backfill-candidate（知识候选）。全部位于 `work/requirements/wi-async-cancellation-precheck/`。

## 10. 技能对照（来自 skills-list.json）

| 案例中的技能 | 中文释义 | catalog 能力分类 |
|---|---|---|
| diagnosing-bugs | 诊断疑难缺陷/回归并保护修复 | diagnosis |
| prototype | 用一次性原型给关键设计问题提供可运行证据 | discovery |
| domain-modeling | 明确领域术语、规则与持久决策 | domain |
| codebase-design | 设计深模块与窄接口（seams/基于测试面） | architecture |
| to-spec | 把确认对话综合为规格并发布到 tracker | planning |
| to-tickets | 把规格拆成带阻塞边的 tracer-bullet 任务 | planning |
| tdd | 红-绿-重构驱动稳定行为（单元/集成） | verification |
| implement | 按规格/有序任务交付（内置 TDD 与 code review） | delivery |
| code-review | 按仓库标准与原始规格双轨审查 diff | verification |
| handoff | 写紧凑交接说明供其他 Agent 继续 | continuity |
| architecture-diagram | 产出自包含 HTML+SVG 架构图（本图） | visualization |

> 技能可用性规则：仅当 `.agents/skills/<id>/SKILL.md` 在运行时可解析时技能才可用（locked-source / local-skill-port-link）。
