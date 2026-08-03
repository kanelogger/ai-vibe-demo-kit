# harness v2 — Directory Context Guard + Phase A + B + C(2/9) + D(1)

统一 `harness` CLI。Phase A：Project Registry、Work Item namespace、Audit Ledger、stateRef
原子事务、六类型生命周期表、v1→v2 一次性迁移与 rollback ref。Phase B：六轴风险画像与
low allowlist、Brief 批量确认快路径（Feature/Bugfix/Maintenance）、不可变 Fact Revision、
人工停顿预算、Rollback 级联 inverse 与 `rollback` 命令。Phase C slice 01：Slice 模型——
六态正常路径 + invalidated、dependsOn DAG 与 frontier、Write Scope 语法/冲突与 revision 冻结。
Phase C slice 02：Quick 绑定——`verify quick` 实际执行 Slice 声明的验证命令，报告绑定
workItem/slice/revision、base integration commit、content/config/contract/dependency digest
与时间；implementing → runnable 必须有当前通过的 Quick，drift 立即 stale。
Directory Context Guard：显式 Code Roots、祖先 `.harness-index.json`、传递 Context Closure、首次阻断交付、Git 私有回执与写前 Hook Adapter；不依赖 stateRef 迁移或 active Slice。

依据：`docs/full-gate-product-requirements.md`（Confirmed v2.0）、ADR-0007、ADR-0010～0016。
`CONTEXT.md` 是领域语言唯一来源。Phase B 票：`.scratch/phase-b-core-cli/issues/`。

## 范围边界

以下属于后续 Phase，刻意不在此实现：

- reopen 表与下游失效（Phase C 事实层语义）
- Human Review 证据门禁、done 的集成语义、Promotion、targetRef 更新（Phase C slice 03–09）
- Hooks 的阶段证据执行适配与 Claude Adapter（Phase D 后续）

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
    slices/<slice-id>.json           # Slice 状态：六态 × revision × Write Scope（单一事实源）
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

## CLI（Phase A + B + C + D route 子集）

```text
harness status [--json]                       # 只读：active/suspended/baseline/允许动作
harness migrate-state [--json]                # v1→v2 一次性迁移；幂等；失败不半更新
harness start --type <t> --quote "<原话>" [--axes ...] [--allowlist ...] [--triggers ...]
              [--risk-level <low|medium|high>] [--contract-ref <既有承诺>]
harness confirm --brief '<json>' --quote "<确认原话>" [--session <引用>]
harness advance --to <stage> [--quote "<原话>"]
harness suspend --reason "<原因>"
harness resume <work-item-id>
harness close --outcome <o> [--result <r>] [--quote "<原话>"]
harness rollback <work-item-id> --quote "<原话>" [--only]
harness slice create --spec '<json>'            # 声明 Slice：DAG/scope/契约校验后入 ready
harness slice list [--json]                     # 只读：Slice 列表 + 派生 frontier
harness slice advance --slice <id> --to <status>  # 六态逐态推进；invalidated 为异常态
harness slice update-scope --slice <id> --spec '<json>'  # 扩缩 scope → 新 revision，证据失效回 ready
harness verify quick --slice <id> [--json]                # 执行 Slice 声明的 Quick，报告绑定 §9.5 全部字段
harness skills route [--type <t> --stage <stage>] [--risk-level <level>] [--slice-status <status> | --slice <id>] [--trigger <name,...>] [--json]
harness suspend-and-start --type <t> --quote "<原话>" --reason "<原因>" [--contract-ref <引用>]
harness close-and-start --outcome <o> --type <t> --quote "<原话>" [--result <r>] [--contract-ref <引用>]
```

## Phase B 语义

- 风险画像（`lib/risk.mjs`）：六轴取最高级为 floor；low allowlist 任一 disqualifier → 至少
  medium；high triggers 任一成立 → high；Developer 只可上调（`E_RISK_BELOW_FLOOR`）。
- 快路径（`lib/brief.mjs` + `opConfirmBrief`）：low 且单 Slice 的 Feature/Bugfix/Maintenance
  用一份 Brief 一次确认，同事务冻结全部前置 Fact Revision（sha256 digest）并按序走完
  前置阶段进入 implementation-ready——不是跳过状态。重复确认 → `E_FACT_FROZEN`。
- Bugfix 前置：`start/suspend-and-start/close-and-start` 建 bugfix 必须 `--contract-ref`
  （`E_DEFECT_NO_CONTRACT`）；defect 需契约+可复现偏差，diagnosis 需证据化因果。
- 人工停顿预算：low 快路径 budget=3（Brief 确认、实测、最终验收）；停顿事件全部记录，
  超预算事件标记 `overBudget` 供指标与 dogfood 分析（PRD 21.3）；确定性命令不计数。
- Rollback（`opRollback`）：accepted lineage 从冻结的 Work Item namespace 派生（关闭项自身的
  outcome 与 close 事件序列是唯一真相，registry 不复制）；目标非最新项自动纳入全部后继；
  `--only` 有后继时拒绝（`E_ROLLBACK_REQUIRES_CASCADE`）；有 active 项时同事务原子 suspend；
  计划冻结为 `rollbackPlan` 事实并声明单原子 Rollback Slice。inverse 的实际应用（revert 集成）
  与 executed/verified 的证据门禁属 Phase C。

## Phase C slice 01 语义（Slice 模型，PRD 9.1–9.3）

- 六态正常路径 `ready → implementing → runnable → human-reviewed → verified → done` 加异常态
  `invalidated`（任意下游状态含 done 可进入；reopen 级联驱动属 slice 06）；转移表在
  `lib/slice.mjs`，跳态拒绝 `E_ILLEGAL_SLICE_TRANSITION`（FR-S01）。invalidated 只能经
  `update-scope` 新 revision 回 ready（重新规划，PRD 9.1）；done Slice 的 scope 冻结不可修订。
- Slice 状态唯一真相在 stateRef `work-items/<id>/slices/<slice-id>.json`；最小字段按 §9.2。
- `dependsOn` 只在前驱 done 时满足（FR-S07）：frontier 由 `slice list` 派生（live 且前驱全部
  done）；进入 `implementing` 要求前驱全部 done，否则 `E_SLICE_BLOCKED`。
- 创建时拒绝：环依赖（`E_SLICE_CYCLE`）、未知 dependsOn（`E_UNKNOWN_SLICE_REF`）、live Slice
  scope 重叠（`E_SCOPE_OVERLAP`，含 rename source/destination，大小写不敏感）、未固定 digest 的
  contractRefs/dependencyDigests（`E_UNPINNED_CONTRACT`）。done Slice 释放 scope，同一路径可被
  后续 Slice 串行复用。
- Write Scope 只有 exact file 与 directory subtree 两种语法；glob、绝对路径、反斜杠、`..`/`.`
  段一律拒绝（NFR-06 路径层，`E_INVALID_WRITE_SCOPE`）。rename 必须同时有 source 与
  destination：source 必须已拥有（exact 或 subtree），destination（新文件）只能落在 owned subtree。
  存在性检查（exact 是否指向既有文件、新文件写时拦截）与 canonical realpath/symlink 规范化
  属集成/写时 Hook 路径层（slice 02/04 与 Phase D FR-H03/H04），本层只做词法与声明间一致性。
- scope 随 revision 冻结（FR-S06）：`update-scope` 创建新 revision、重算冲突、使既有
  Quick/Human Review 标记失效并回 `ready`；done Slice 的 scope 不可修订。
- Human Review 证据门禁（FR-S03）与 done 的集成语义（FR-S08）属 slice 03–04，
  将在转移上叠加，不改变本转移表。

## Phase C slice 02 语义（Quick 绑定，PRD 9.5/16.1/16.4）

- `harness verify quick --slice <id>` 实际执行 Slice 声明的 `verification.quick`（`lib/quick.mjs`）；
  全量执行只在 implementing/runnable（`E_QUICK_NOT_ALLOWED`）；human-reviewed/verified 仅允许
  纯 TTL 刷新（报告通过且 digest 未漂移，内容漂移必须回 implementing，PRD 9.6）。Quick 只覆盖
  当前 Slice 风险，不要求每个 Slice 运行 Work Item Full（FR-E01）。命令以 `sh -c` 流式执行、
  stdin 关闭、只保留输出尾部。
- 报告落 stateRef 的 Slice `quickReport`（失败的报告同样落账可审计，CLI 以 `E_QUICK_FAILED`
  退出码 1 拒绝），绑定 §9.5 全部字段：workItem/slice/revision、base integration commit
  （targetRef tip）、content digest（scope 内逐文件原始字节 SHA-256 + Git 模式 100644/100755/
  120000 的 manifest，含 ABSENT 标记，可对实际内容反查，NFR-12）、config digest（resolveContext
  实际生效的配置路径，含 overlay 回退）、contract/dependency digests（声明 pin + 实际内容双录；
  ref 漂移或曾解析文件被删除 → `E_CONTRACT_DRIFT` 拒绝背书）、commands/results/时间与
  environment-sensitive TTL。验证命令执行后复核 digest：命令修改 scope 内容/config/契约时报告
  拒绝落账（`E_QUICK_STALE`），重跑绑定稳定内容。
- Quick 不以 HEAD 作为唯一内容身份：内容、config、声明的 contract/dependency 或 base commit
  漂移立即使 Quick stale（场景 10）。advance 到 runnable/human-reviewed/verified/done 都要求
  当前 revision 有通过的、未 stale 的 Quick：无报告 `E_QUICK_REQUIRED`、未通过
  `E_QUICK_FAILED`、stale `E_QUICK_STALE`（FR-S02）。转移表优先于证据门禁，跳态仍报
  `E_ILLEGAL_SLICE_TRANSITION`（FR-S01）。`slice list` 实时派生 Quick 时效：漂移后 status
  虽仍是持久化的 runnable，`quick.state=stale` 表明 Slice 不能再宣称 runnable（FR-S02）。
- 内容驱动失效而非 TTL（§16.4）：本地确定性 check 无 TTL，digest 未漂移时重复 verify quick
  原样复用报告，不因时间经过失效；`{command, environmentSensitiveTtlSeconds}` 声明的
  environment-sensitive check 独立 TTL，过期后 verify quick 只重跑该 check、其余结果保留。
  quick 条目非法（空命令、负 TTL）在 slice create 时拒绝（`E_INVALID_QUICK_CHECK`）。

## Phase D slice 01 语义（Skill 路由控制面）

- `.agents/skills.json` v2 把 Skill catalog 与阶段路由集中管理；路由只引用 lock 已物化的 `SKILL.md`。
- matcher 依次比较 Work Item 类型、阶段、风险、UI、Slice 状态、测试基础设施和 trigger；同优先级匹配多条时返回 `E_SKILL_ROUTE_CONFLICT`，不隐式合并。
- schema 加载时验证六类型全部阶段、low/medium/high/unclassified、UI/测试布尔组合和全部 Slice 状态均有唯一 fallback，同时拒绝未知 alias 与节点环。
- `harness skills route` 是只读入口：显式 `--type/--stage` 可在迁移前检查；省略时从 stateRef 读取 active Work Item，`--slice` 读取真实 Slice 状态。
- 当前 Slice 不执行 Skill，也不把路由结果写入 stateRef；生命周期、Slice DAG、Quick 和人工门禁继续由各自唯一事实源执行。

## Directory Context Guard 语义

- `.harness/config.json` 的 `contextIndex.codeRoots` 是受管范围唯一来源；Code Roots 必须存在、互不重叠且各自拥有根 `.harness-index.json`。
- `context guard --file <path> --session <id>` 先拒绝任何 symlink 分量，再按 Code Root 到目标目录的祖先顺序累加索引；目录默认和精确文件项只追加，传递前置按声明顺序深度优先展开、去重并拒绝环。
- 前置只接受仓库内普通 UTF-8 文本；Git private、NUL、无效 UTF-8、目录、symlink、单文件超限和总闭包超限在读出前拒绝。
- 首次受管调用等待完整 Context Bundle 输出成功后，才在 Git private `harness/context-receipts` 原子写回执并以退出码 1 阻断；同 session/target 且 resolution digest current 时返回 allowed。索引或任一传递前置漂移立即重新阻断。
- `validateContextIndexes` 与 `harness-check context` 复用同一解析器做静态全量校验，不创建回执；`.agents/hooks/guard-write-context.mjs` 只转发平台 file/session 到统一 CLI。

## 表驱动 fixtures（NFR-10）

`test/fixture-runner.mjs` 重放声明式用例行：seed 命令序列（可 `{as}` 捕获 workItemId）→
run 探针 → 断言（退出码/错误码/JSON 子集/stateRef 文件子集/文件树精确集）→ 可选修复。
用例表在 `test/cases/`：转换表、风险画像、三种 low 快路径、Rollback、Slice 模型、Quick 绑定。

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
node --test scripts/harness/test/*.test.mjs
```

覆盖：六类型转移表（允许/拒绝/accepted-非阶段）、事务 CAS 漂移、账本一致性阻断、
迁移幂等与 rollback ref、CLI 全流程与退出码契约，Phase B 全部表驱动 fixtures
（转换表 26 例、风险画像 22 例、low 快路径 17 例、Rollback 6 例），以及 Phase C slice 01
（Slice 模型 26 例 fixtures + 15 例纯函数单测：六态/跳态拒绝、DAG/frontier、scope 语法与
重叠矩阵、rename 边界、revision 冻结与证据失效、稳定错误契约）与 slice 02（Quick 绑定
10 例 fixtures + 15 例命令式 fixtures + 2 例纯函数单测：绑定字段与 digest 反查、内容/config/
contract/dependency/base 漂移 stale 矩阵、契约删除漂移、失败报告落账、复用时间无关性、
TTL 只重跑过期项与下游纯 TTL 刷新、slice list stale 派生、命令后复核、原始字节与配置回退）。
Phase D route 另覆盖六类型分流、matcher 优先级、测试/UI 策略、双 trigger 冲突、节点环拒绝与 CLI active-state 查询。
