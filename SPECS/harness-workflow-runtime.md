# Harness Workflow Runtime 设计规格

- Status: Proposed
- Audience: 调度层实现者、Workflow 作者、宿主 Adapter 实现者
- Updated: 2026-08-08
- Decision: 声明式转移表 + 固定三阶段默认 Workflow

## 1. 目标

为仓库内 Coding Agent 提供一个轻量、可恢复、可审计的调度运行时，使单次工作可以围绕以下反馈回路推进：

```text
align -> execute -> verify -> complete
  ^         ^          |
  |         +----------+ implementation-failed
  +--------------------+ requirement-failed / design-failed
```

运行时负责：

- 从 Workflow 和当前状态计算下一动作；
- 每次最多派发一个 Stage；
- 接收 Stage 结果或人工决定；
- 根据声明式转移表推进、回退、阻塞或完成；
- 原子保存状态、结果引用和人工决策证据；
- 在新会话中从仓库文件恢复当前工作。

运行时不负责理解需求、设计方案、修改代码或判断测试是否合理。这些判断由执行 Stage 的 Agent 完成。

## 2. 项目定位

本项目是安装到具体软件项目中的 Agent Harness。调度层应保持通用，不内置某个团队的完整 RD 流程。

Workflow 定义任务如何流转；Stage instructions 定义当前步骤要做什么；Skill 提供可选专业方法；脚本和宿主 Adapter 执行确定性检查及外部动作。

```text
Workflow definition
        |
        v
Workflow Runtime <-> Work status / Stage results
        |
        v
Dispatch Decision
        |
        v
Host Adapter -> Agent / command / human
```

## 3. 非目标

首版不实现：

- 任意代码表达式或 YAML 内嵌 Shell；
- 通用 BPMN、任务队列或分布式事件系统；
- 跨机器调度和远程 Worker 租约；
- 自动安装、更新或解析 Skill 依赖；
- Agent 自行指定下一个 Stage；
- 无限制自动重试或无人值守长循环；
- 自动提交、推送、发布、回滚或生产写入；
- 多工作项之间的依赖图；
- Stage 内部的细粒度任务管理。

这些需求出现真实使用证据后再扩展。

## 4. 核心概念

| 概念 | 定义 |
| --- | --- |
| Workflow | 可复用的 Stage、Outcome 和 Transition 定义 |
| Work item | 某次需求对一个 Workflow 的具体运行实例 |
| Stage | 一次需要 Agent、命令或人工执行的工作 |
| Stage run | Stage 的一次尝试，具有唯一 `run_id` |
| Outcome | Stage run 的结构化结论，由 Workflow 预先声明 |
| Transition | `(stage, outcome) -> target` 的确定性映射 |
| Feedback transition | 明确标记的回退或重入边，用于修复和重新验证 |
| Artifact | Stage 产生的文件、diff、报告或其他证据 |
| Signal | 提交给运行时的 Stage 结果或人工决定 |
| Decision | 运行时返回的派发、等待、阻塞或完成结论 |

## 5. 关键设计决策

### 5.1 使用声明式转移表

Workflow 只声明有限 Outcome 和精确转移，不提供任意条件语言。

```yaml
transitions:
  - from: verify
    on: implementation-failed
    to: execute
    feedback: true
```

运行时只匹配 `(current_stage, outcome)`。Agent 可以判断 Outcome，不能生成目标 Stage。

### 5.2 默认 Workflow 固定为三阶段

首个内置 Workflow 只有：

- `align`：形成目标、范围和可观察验收条件；
- `execute`：产生当前最小改动；
- `verify`：运行真实检查并分类反馈。

澄清、原型、拆解和知识回补可以由项目 Workflow 后续增加，不进入运行时内核。

### 5.3 每次调用最多派发一个 Stage

`next()` 不连续执行整个 Workflow。调用者必须在每次 Stage 完成后提交结果，再显式请求下一动作。

这一约束防止失败反馈形成高速死循环，也让人可以在任何 Stage 之间暂停或接管。

### 5.4 状态只有一个机器事实源

每个 Work item 的 `status.yml` 是当前状态的唯一机器来源。Markdown 解释目标、方案和原因，不表达当前运行位置。

### 5.5 Stage 内容保持松耦合

运行时校验 Stage result、必需 Artifact 引用和转移关系，不解析 `requirement.md`、代码 diff 或验证报告中的自然语言。

## 6. 调度模块 Interface

调度模块是一个深 Module，对调用者只暴露两个入口：

```ts
interface WorkflowRuntime {
  next(workId: string): Promise<RuntimeDecision>;

  submit(
    workId: string,
    expectedRevision: number,
    signal: RuntimeSignal,
  ): Promise<RuntimeDecision>;
}
```

### 6.1 `next(workId)`

读取 Workflow 和当前状态，返回下一动作。

```ts
type RuntimeDecision =
  | {
      kind: "ready";
      workId: string;
      revision: number;
      stage: string;
    }
  | {
      kind: "dispatch";
      workId: string;
      revision: number;
      runId: string;
      stage: string;
      attempt: number;
      goal: string;
      instructionsRef: string | null;
      contextRefs: string[];
      inputRefs: string[];
      expectedArtifacts: ExpectedArtifact[];
      allowedOutcomes: string[];
      preferredSkills: string[];
      executor: ExecutorSpec;
    }
  | {
      kind: "await-human";
      workId: string;
      revision: number;
      gateId: string;
      reason: string;
      evidenceRefs: string[];
    }
  | {
      kind: "blocked";
      workId: string;
      revision: number;
      reason: string;
      evidenceRefs: string[];
    }
  | {
      kind: "complete";
      workId: string;
      revision: number;
      evidenceRefs: string[];
    }
  | {
      kind: "aborted";
      workId: string;
      revision: number;
      reason: string;
    };
```

行为要求：

- 尚未派发当前 Stage 时，创建新的 `run_id`、增加 attempt 并原子更新状态；
- 当前 Stage 已派发且尚未提交结果时，重复返回同一 Dispatch，不创建新 run；
- 正在等待人工决定时返回 `await-human`；
- Work item 已阻塞或完成时返回对应终态；
- `next()` 不调用 Agent，不运行 Shell，不修改代码。

### 6.2 `submit(workId, expectedRevision, signal)`

接收两类 Signal：

```ts
type RuntimeSignal = StageResult | HumanDecision;
```

Stage 结果：

```ts
type StageResult = {
  kind: "stage-result";
  runId: string;
  stage: string;
  outcome: string;
  summary: string;
  artifactRefs: string[];
  evidence: Evidence[];
};
```

人工决定：

```ts
type HumanDecision = {
  kind: "human-decision";
  subject: {
    kind: "gate" | "block";
    id: string;
  };
  decision: "approve" | "reject" | "resume" | "abort";
  text: string;
  actor: string;
  decidedAt: string;
};
```

行为要求：

- `expectedRevision` 必须与当前状态一致；唯一例外是可以识别为已接受内容的幂等重复提交；
- Stage result 必须对应当前活动 `run_id` 和 Stage；
- Outcome 必须在当前 Stage 的声明范围内；
- 必需 Artifact 必须具有有效引用；文件 Artifact 必须存在且位于允许路径，`path: null` 的 Patch 等输出按类型检查 diff Evidence；
- Evidence 不满足 Workflow 要求时拒绝推进；
- 找到唯一 Transition 后原子更新状态；
- Transition 存在人工门禁时先进入 `awaiting-human`；
- 完成写入后返回新的 RuntimeDecision；
- 同一 Signal 重复提交且内容摘要一致时保持幂等；即使首次提交已经增加 revision，也返回当前 Decision；
- 相同 `run_id` 提交不同内容时返回冲突。

## 7. Workflow v2 契约

建议新增 `schemas/workflow.schema.yml`，并将现有模板升级为 v2。

v2 使用 Transition 作为唯一流转事实，不再使用 `depends_on`。当前仓库只有模板，没有需要兼容的真实运行实例；首版不实现 v1 自动迁移，读取 v1 定义时返回 `E_WORKFLOW_VERSION`。

```yaml
schema_version: 2
id: coding-feedback-loop
version: 1
description: "适用于普通代码变更的最小反馈回路"
initial_stage: align

context:
  required:
    - project.yml
    - AGENTS.md
    - ARCHITECTURE.md

stages:
  align:
    goal: "形成目标、非目标和可观察验收条件"
    executor:
      kind: primary_agent
    instructions_ref: workflows/instructions/align.md
    inputs:
      - source
    outputs:
      - id: work_target
        type: work-target
        path: work/requirements/<requirement-id>/requirement.md
        required: true
    outcomes:
      - ready
      - blocked
    preferred_skills:
      - domain-modeling

  execute:
    goal: "完成满足当前目标的最小改动"
    executor:
      kind: primary_agent
    instructions_ref: workflows/instructions/execute.md
    inputs:
      - work_target
    outputs:
      - id: change
        type: patch
        path: null
        required: true
    outcomes:
      - changed
      - blocked
    preferred_skills:
      - tdd
      - diagnosing-bugs

  verify:
    goal: "运行真实检查并判断实现是否满足目标"
    executor:
      kind: primary_agent
    instructions_ref: workflows/instructions/verify.md
    inputs:
      - work_target
      - change
    outputs:
      - id: verification
        type: verification-report
        path: work/requirements/<requirement-id>/implementation-check.md
        required: true
    outcomes:
      - passed
      - implementation-failed
      - requirement-failed
      - design-failed
      - verification-failed
      - blocked
    preferred_skills:
      - code-review

transitions:
  - from: align
    on: ready
    to: execute

  - from: align
    on: blocked
    to: blocked

  - from: execute
    on: changed
    to: verify

  - from: execute
    on: blocked
    to: blocked

  - from: verify
    on: passed
    to: complete

  - from: verify
    on: implementation-failed
    to: execute
    feedback: true

  - from: verify
    on: requirement-failed
    to: align
    feedback: true

  - from: verify
    on: design-failed
    to: align
    feedback: true

  - from: verify
    on: verification-failed
    to: verify
    feedback: true

  - from: verify
    on: blocked
    to: blocked

hooks:
  before_dispatch: []
  before_transition: []
  after_transition: []
```

### 7.1 Workflow 静态校验

加载时必须检查：

- Workflow ID、版本和 Stage ID 唯一；
- `initial_stage` 存在；
- Transition 的来源和目标存在，或目标是 `complete`、`blocked`；
- Transition Outcome 已由来源 Stage 声明；
- 每个 `(stage, outcome)` 最多对应一条 Transition；
- 每个非终态 Stage 至少有一个出口；
- 所有 Stage 从 initial Stage 可达；
- 形成环的回退边必须声明 `feedback: true`；
- `instructions_ref` 和固定输入路径不得越出工作区；
- 不接受任意表达式、命令或未知字段。

未声明转移的 Outcome 可以提交，但运行时必须返回 `E_TRANSITION_MISSING` 并保持当前状态，便于 Workflow 作者发现缺口。

## 8. Work status v2

建议新增 `schemas/work-status.schema.yml`，并升级 `work/requirements/_template/status.yml`。

```yaml
schema_version: 2
requirement_id: WI-20260808-001
workflow:
  id: coding-feedback-loop
  version: 1
  digest: sha256:<compiled-workflow-digest>

revision: 7
status: active

current:
  stage: verify
  run_id: verify-2
  attempt: 2
  dispatch_status: dispatched

pending_gate: null

blocked: null

attempts:
  align: 1
  execute: 2
  verify: 2

results:
  - run_id: align-1
    stage: align
    outcome: ready
    result_ref: work/requirements/WI-20260808-001/results/align-1.yml
  - run_id: execute-1
    stage: execute
    outcome: changed
    result_ref: work/requirements/WI-20260808-001/results/execute-1.yml
  - run_id: verify-1
    stage: verify
    outcome: implementation-failed
    result_ref: work/requirements/WI-20260808-001/results/verify-1.yml

artifact_refs: []
human_decisions: []
updated_at: 2026-08-08T12:00:00Z
```

状态要求：

- `revision` 每次成功写入加一；
- Work item 创建时固定 Workflow ID、版本和编译后 digest；同版本定义发生漂移时停止执行；
- `current.run_id` 在一次 Stage run 中保持稳定；
- 重入 Stage 时 attempt 增加；
- `results` 只保存索引，完整结果单独落盘；
- `completed_stages` 不再作为字段，因为反馈回路允许 Stage 重入；
- `status=complete` 时不得再次提交 Stage result；
- `status=blocked` 时必须保存 `blocked.id`、`blocked.reason`、`blocked.resume_stage` 和 Evidence 引用；可以通过有证据的 `resume` 人工决定恢复到该 Stage；
- `abort` 将状态标记为 `aborted`，不修改代码或 Git。

## 9. Stage result 契约

建议新增 `schemas/stage-result.schema.yml`。Stage result 是控制信号，业务 Artifact 继续使用现有 Artifact envelope。

```yaml
schema_version: 1
kind: stage-result
work_id: WI-20260808-001
workflow:
  id: coding-feedback-loop
  version: 1
run_id: verify-1
stage: verify
outcome: implementation-failed
summary: "导出结果没有应用当前筛选条件"
artifact_refs:
  - work/requirements/WI-20260808-001/implementation-check.md
evidence:
  - kind: test
    ref: test/export.test.mjs
    result: failed
produced_at: 2026-08-08T11:30:00Z
```

### 9.1 Verify Outcome 语义

| Outcome | 语义 | 默认回到 |
| --- | --- | --- |
| `passed` | 目标满足且所需检查有证据 | `complete` |
| `implementation-failed` | 目标明确，代码或行为不符合 | `execute` |
| `requirement-failed` | 目标、范围或验收条件不完整或冲突 | `align` |
| `design-failed` | 已确认设计在真实使用中不成立 | `align`，项目可替换为 `prototype` |
| `verification-failed` | 验证方法、测试或验证环境本身有问题 | `verify` |
| `blocked` | 缺少权限、外部输入、环境或人工判断 | `blocked` |

验证 Stage 必须提供至少一条 Evidence。`passed` 必须覆盖 Workflow 声明的全部必需验证，不允许只用“测试文件存在”作为证据。

## 10. 转移算法

### 10.1 `next()`

```text
load workflow
load status
validate workflow version

if status is complete/aborted:
  return terminal decision

if status is blocked:
  return blocked decision

if pending_gate exists:
  return await-human decision

if current run is already dispatched:
  return the same dispatch decision

create run_id
increment stage attempt
mark run dispatched
atomic compare-and-swap status
return dispatch decision
```

### 10.2 提交 Stage result

```text
load workflow and status
compare expected revision; revision 不同但 Signal 与已接受记录同 identity、同 digest 时按幂等返回
validate result schema
validate work/stage/run identity
validate declared outcome
validate required artifacts and evidence
check duplicate submission digest
resolve exactly one transition

if transition has human gate:
  persist result
  set pending gate
  atomic write
  return await-human

persist result
apply target stage or terminal state
atomic write
return ready/await-human/blocked/complete decision without dispatching another stage
```

`submit()` 返回目标 Stage 的 `ready` 状态，但不替调用者自动连续执行。调用者再次调用 `next()` 后才产生新的 Dispatch。

### 10.3 提交人工决定

```text
load status
compare expected revision
validate gate or block identity
require text, actor and timestamp

approve:
  apply pending transition

reject:
  return to gate source stage unless Workflow declares rejection target

resume:
  restore the stage recorded by blocked state

abort:
  mark work aborted

append decision evidence
atomic write
return current decision
```

## 11. 人工门禁

人工门禁属于 Transition，不属于 Stage。Stage 可以完成，转移仍需等待人工决定。

```yaml
- from: align
  on: ready
  to: execute
  human_gate:
    id: approve-target
    reason: "确认目标、非目标和验收条件"
    on_reject: align
```

门禁要求：

- 保存确认原文、确认人、时间和关联 Evidence；
- 禁止只保存 `approved: true`；
- Workflow 未声明门禁时，运行时不自行增加；
- 发布、生产写入和不可逆动作仍由项目权限策略强制要求人工批准。

## 12. Adapter 与依赖策略

### 12.1 WorkStore

真实 seam。至少需要两个 Adapter：

- `FileWorkStore`：生产使用，读写 Workflow、status 和 result 文件；
- `InMemoryWorkStore`：测试使用。

```ts
interface WorkStore {
  loadWorkflow(ref: WorkflowRef): Promise<WorkflowDefinition>;
  loadStatus(workId: string): Promise<WorkStatus>;
  saveStatus(expectedRevision: number, status: WorkStatus): Promise<void>;
  saveResult(result: StageResult): Promise<string>;
  loadResult(ref: string): Promise<StageResult>;
}
```

`FileWorkStore` 必须使用同目录临时文件加原子 rename，并通过 revision 实现 compare-and-swap。不得默默覆盖并发更新。

Stage result 使用由 `run_id` 决定的不可变路径。先幂等写入结果，再 compare-and-swap 状态；状态写入冲突时允许留下未引用的结果文件，后续相同 digest 的重试复用该文件，不同 digest 返回冲突。运行时不得先覆盖旧状态再补写结果。

### 12.2 Host Adapter

运行时返回 DispatchDecision，宿主 Adapter 将其转换为 Codex、Claude Code 或其他 Agent 可接受的任务输入。

首版只要求一个当前宿主 Adapter。出现第二个平台后再稳定公共 Executor port；不要为假设中的平台提前暴露复杂 Interface。

宿主 Adapter 负责：

- 加载 Dispatch 中列出的上下文；
- 告知 Agent 当前 goal、允许 Outcome 和预期 Artifact；
- 推荐而不强制调用 `preferred_skills`；
- 收集 Agent 结果并形成 Stage result；
- 执行平台权限和外部写入审批。

### 12.3 确定性命令

测试、lint、typecheck、build 和 E2E 命令来自 `project.yml` 或项目规则。Workflow 只能引用已注册命令 ID，不允许内嵌 Shell。

## 13. Skills 的处理

`preferred_skills` 只是 Dispatch hint：

- 不参与状态转移；
- 不要求调度层安装 Skill；
- Skill 缺失时，宿主可以用内建能力继续，或返回 `blocked`；
- `required_capabilities` 只有出现真实硬依赖时才添加。

首版不需要为 `align`、`execute`、`verify` 新建项目 Skill。

## 14. Hooks

Slice 1—4 只接受空 Hook 列表。Slice 5 出现真实扩展需求后，只支持注册式 Hook 引用，不支持内联命令：

```yaml
hooks:
  before_dispatch:
    - ref: check-permissions
  before_transition:
    - ref: validate-required-artifacts
  after_transition:
    - ref: record-audit-summary
```

Hook 结果只有：

- `pass`：继续；
- `block`：停止并保存证据。

状态原子写入、revision 检查和必需 Artifact 校验属于运行时不变量，不实现成可关闭 Hook。

## 15. 错误模型

运行时返回稳定错误码：

| Code | 含义 |
| --- | --- |
| `E_WORK_NOT_FOUND` | Work item 不存在 |
| `E_WORKFLOW_INVALID` | Workflow Schema 或静态关系无效 |
| `E_WORKFLOW_VERSION` | 状态引用的 Workflow 版本不可用 |
| `E_WORKFLOW_DRIFT` | 同一 Workflow 版本的编译 digest 与运行中记录不一致 |
| `E_STATE_INVALID` | 状态文件损坏或违反不变量 |
| `E_REVISION_STALE` | 提交基于过期 revision |
| `E_RUN_MISMATCH` | Stage result 不属于当前 run |
| `E_RESULT_INVALID` | Stage result 不符合 Schema |
| `E_OUTCOME_UNKNOWN` | Outcome 未由当前 Stage 声明 |
| `E_TRANSITION_MISSING` | 当前 Outcome 没有转移定义 |
| `E_ARTIFACT_MISSING` | 必需 Artifact 不存在 |
| `E_EVIDENCE_REQUIRED` | 缺少当前 Outcome 所需证据 |
| `E_SUBMISSION_CONFLICT` | 同一 run 收到不同结果 |
| `E_GATE_PENDING` | 当前正在等待人工决定 |
| `E_TERMINAL` | Work item 已完成或终止 |
| `E_PATH_OUTSIDE_ROOT` | Workflow 或 Artifact 引用越出工作区 |

错误不得隐式推进状态。CLI 文本可以变化，错误码和结构化字段保持稳定。

## 16. 安全与权限

- 所有 Workflow、instructions、Artifact 和 Evidence 路径必须解析为工作区内路径；
- 拒绝路径穿越、Git 私有目录、未允许的 symlink 和绝对外部路径；
- Workflow YAML 不执行表达式和 Shell；
- 外部系统写入、发布、生产操作和不可逆动作必须经过宿主权限策略；
- Stage result 中的 Evidence 引用必须存在，不能因为 Agent 声称成功就视为已验证；
- 运行时写入范围限制在当前 Work item 状态和结果目录；
- `abort`、`blocked`、`reject` 不修改代码、Git 历史或外部系统。

## 17. 文件布局建议

```text
scripts/harness/
├── cli.*
├── runtime.*                 # WorkflowRuntime Interface
├── workflow-loader.*         # Workflow Schema 与静态校验
├── transition-reducer.*      # 纯转移逻辑
├── result-validator.*
├── file-work-store.*
└── tests/

schemas/
├── artifact.schema.yml
├── workflow.schema.yml
├── work-status.schema.yml
└── stage-result.schema.yml

workflows/
├── coding-feedback-loop.yml
└── instructions/
    ├── align.md
    ├── execute.md
    └── verify.md
```

文件扩展名和实现语言由实现任务结合项目实际工具链确定。本规格中的 TypeScript 类型只表达 Interface。

## 18. CLI 建议

CLI 是 WorkflowRuntime 的薄 Adapter：

```text
harness workflow check <workflow-file>
harness work next <requirement-id> --json
harness work submit <requirement-id> --revision <n> --result <file>
harness work decide <requirement-id> --revision <n> --decision <file>
harness work status <requirement-id> --json
```

初始化 Work item 可以继续复制模板，或以后增加独立 `work init` 工具。初始化不进入 WorkflowRuntime Interface。

## 19. 测试策略

测试以 WorkflowRuntime Interface 为测试表面。核心转移逻辑使用内存 Adapter，文件原子性使用临时目录集成测试。

### 19.1 必测行为

1. `align -> execute -> verify -> complete` 一次通过；
2. `implementation-failed -> execute -> verify -> complete`；
3. `requirement-failed -> align`；
4. `design-failed -> align`；
5. `verification-failed -> verify`；
6. `blocked -> resume -> 原 Stage`；
7. 人工门禁批准后推进；
8. 人工门禁拒绝后回到声明 Stage；
9. 旧 revision 提交被拒绝且状态不变；
10. 同一 result 重复提交保持幂等；
11. 同一 run 提交不同结果返回冲突；
12. 重复 `next()` 返回同一 run；
13. 缺少 Evidence 的验证结果被拒绝；
14. 缺少必需 Artifact 时不推进；
15. 未声明 Outcome 和缺失 Transition 响亮失败；
16. Workflow 不可达 Stage 和未标记反馈环校验失败；
17. 路径越界、symlink 和 Git 私有路径被拒绝；
18. 文件写入失败时保留旧状态；
19. 新会话只读 Workflow、status 和结果后能得到相同 `next()`；
20. 完成或终止状态不能继续提交 Stage result。

### 19.2 测试 Adapter

- `InMemoryWorkStore`：覆盖全部转移、门禁、幂等和错误行为；
- `FileWorkStore`：覆盖真实 YAML、原子写入、revision 冲突和路径安全；
- Fake clock/ID generator：保证 run ID、时间和测试结果稳定；
- Fake Host Adapter：验证 Dispatch 是否包含最小充分上下文。

## 20. 实施切片

### Slice 1：契约与纯转移内核

交付：

- Workflow、Work status、Stage result Schema；
- Workflow 静态校验；
- 纯 `transition-reducer`；
- `InMemoryWorkStore`；
- 一次通过和三类反馈回退测试。

验收：输入固定 Workflow、状态和 Stage result，得到确定的下一状态；不读写真实文件。

### Slice 2：文件状态与 Runtime Interface

交付：

- `next()`、`submit()`；
- `FileWorkStore`；
- revision、原子写入、幂等和冲突；
- Stage result 单独落盘；
- 路径安全测试。

验收：在临时目录中完整跑通反馈循环，中断后重新加载可以继续。

### Slice 3：默认 Workflow 与 CLI

交付：

- `coding-feedback-loop.yml`；
- 三份 Stage instructions；
- `workflow check`、`work next`、`work submit`、`work status`；
- JSON 输出和稳定错误码。

验收：人或 Agent 可以只通过 CLI 推进一个真实仓库内 Work item。

### Slice 4：人工门禁与宿主接入

交付：

- HumanDecision；
- `await-human`、approve/reject/resume/abort；
- 当前宿主 Adapter；
- 权限和外部写入策略接入。

验收：高风险 Workflow 可以停在门禁，新会话读取证据后继续。

### Slice 5：Hooks 与项目扩展

仅在前四个 Slice 经真实任务验证后实施：

- 注册式 Hook；
- 项目自定义 Stage；
- 第二个宿主 Adapter；
- 并行 Stage 或跨应用拆分调研。

## 21. 完成标准

调度层 v1 只有同时满足以下条件才能声明完成：

- 默认反馈 Workflow 可以从 align 运行到 complete；
- 五种验证失败分类均按配置返回正确 Stage 或 blocked；
- 所有状态修改使用 revision 和原子写入；
- 重复调用、重复提交和并发旧提交行为确定；
- Workflow、status 和 Stage result 都有机器 Schema；
- 验证通过必须包含真实 Evidence；
- 人工门禁保存确认原文、确认人和时间；
- 路径越界和未授权外部写入被阻止；
- 新会话仅依赖仓库文件可以恢复并得到正确下一动作；
- 文档、示例 Workflow 和实际 CLI 行为一致；
- 测试覆盖第 19 节全部必测行为，未运行或跳过的检查明确报告。

## 22. 实现前需要确认的事项

以下事项缺少当前项目事实，实施前必须确认：

1. 调度运行时使用的语言、版本和依赖策略；
2. YAML 与 JSON Schema 的解析/校验库；
3. 首个宿主 Adapter 是纯 CLI、Codex、Claude Code，还是其他环境；
4. Work item 初始化由复制模板承担，还是同时实现 `work init`；
5. `status.yml` 和 Stage result 是否允许包含绝对时间，测试中如何注入 Clock；
6. 默认 Workflow 是否在 `align -> execute` 增加人工门禁；
7. 项目真实的测试、类型检查、构建和 E2E 命令来源。

这些选择不改变 WorkflowRuntime 的 `next/submit` Interface。

## 23. Handoff

实现者开始前依次阅读：

1. `ARCHITECTURE.md`；
2. 本规格；
3. `workflows/README.md` 与现有 Workflow 模板；
4. `schemas/artifact.schema.yml`；
5. `work/README.md` 与 `status.yml` 模板；
6. `rules/security.md`、`rules/testing.md`、`rules/git.md`。

第一步先解决第 22 节的实现环境选择，然后只实施 Slice 1。不要同时实现 Hook 引擎、多 Agent、Skill resolver 或自动修复。

实现过程中维护一份短的 implementation notes，记录：

- 与本规格的有意偏差；
- 新发现的不变量或错误模式；
- Schema 变更及兼容影响；
- 被推迟到后续 Slice 的内容；
- 实际运行的验证命令和结果。
