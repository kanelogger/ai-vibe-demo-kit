# AI Native Harness Orchestration

本上下文定义 Harness 如何帮助一个开发者把变更从明确意图推进到可运行、可验证、可回退的结果，并持续安全迭代。

## Language

**可运行切片（Slice）**:
能够独立运行、被实际使用、验证并回退的最小交付单位；它是开发反馈闭环的唯一进度单位。
_Avoid_: Sprint、迭代

**工作项（Work Item）**:
一次具有独立目标、范围与验收结果的变更活动，可包含一个或多个可运行切片；其类型决定唯一的主生命周期。项目同一时刻只允许一个活动工作项，其他未关闭工作项必须处于 suspended。
_Avoid_: Issue、Ticket、任务

**暂停工作项（Suspended Work Item）**:
因更高优先级工作而冻结状态与隔离分支、暂时不允许写入或推进的未关闭工作项；恢复时必须基于最新 accepted baseline 重新判断证据有效性。
_Avoid_: Abandoned、并行活动项

**缺陷修复工作项（Bugfix）**:
恢复已确认规格、公开契约、明确不变量或已验收行为的工作项；没有既有承诺的新增期望属于功能工作项。
_Avoid_: 以改动大小或用户标签定义的“Bug”

**迁移工作项（Migration）**:
在保持已确认外部可观察契约的前提下，因跨共享 seam、多调用方或持久数据而必须让新旧路径阶段性共存并切换的工作项；可在单个可回退切片原子完成的内部重构属于 Maintenance。
_Avoid_: 同时改变产品行为的“迁移”、局部原子重构

**性能优化工作项（Optimization）**:
以固定工作负载改善量化性能指标、同时保持外部可观察契约的工作项；测量证明无需改动也是有效结果。
_Avoid_: 重构、清理、泛化的“工程优化”

**维护工作项（Maintenance）**:
不改变外部产品契约，且不属于性能优化或渐进迁移的工程维护活动，例如依赖、构建、CI 或文档维护。
_Avoid_: Chore、杂项

**回退工作项（Rollback）**:
按已记录的逆向与级联计划撤销一个或多个已接受工作项、恢复先前 accepted baseline 的工作项；它不引入新的目标行为。
_Avoid_: 未验证的直接 revert、Bugfix

**功能工作项（Feature）**:
有意新增、改变、弃用或移除用户或外部调用方可观察契约的工作项；分类不取决于改动大小。
_Avoid_: 仅指新增能力的“Feature”

**接受（Accepted）**:
最终人工验收通过后关闭工作项的结果，不是活动生命周期中的阶段。
_Avoid_: accepted 阶段、完成阶段

**放弃（Abandoned）**:
不再追求原目标、且未验收生产变更已从活动基线移除后关闭工作项的结果。
_Avoid_: 暂停、搁置

**被取代（Superseded）**:
由后继工作项替代原目标后关闭当前工作项的结果；后继项可继承谱系链接，但不能自动继承确认或验证效力。
_Avoid_: 自动续作、隐式继承

**需求事实（Requirement Fact）**:
对目标、受益者、范围和非目标的已确认描述；它回答为何改变以及改变边界，不规定行为形态或实现。
_Avoid_: 设计、方案

**设计事实（Design Fact）**:
在选择实现方案前，对目标外部行为、关键状态与交互或契约场景的已确认描述；所有功能工作项都必须建立该事实层。
_Avoid_: 实现方案、Feature spec

**规格事实（Specification Fact）**:
对已确认设计的精确、完整、持久且可验证的表达；它不得擅自改变设计事实。
_Avoid_: 设计探索、实现代码

**门禁（Gate）**:
工作继续前必须满足的已确认事实或证据边界，用于尽早暴露误解、过期结果和未闭环反馈；风险等级可以改变证据深度，但不能取消同类工作项的关键门禁。
_Avoid_: 可选检查、文档清单

**风险画像（Risk Profile）**:
从外部契约、数据可逆性、安全与权限、影响范围、共享契约和运行切换六个维度描述工作项风险，整体等级取最高维度。规则给出最低等级，开发者确认该等级并可上调、不可降到规则下限以下。
_Avoid_: 主观风险标签、平均风险分

**证据就绪（Evidence-ready）**:
当前事实表明 accepted baseline 已满足目标或无需改动，正在等待风险匹配验证与人工实际使用的零切片阶段。
_Avoid_: 空 Slice、伪 implementation-ready

**验收就绪（Acceptance-ready）**:
实现或 evidence-only 结论、验证和适用审查均已完成且证据当前有效，正在等待最终人工验收的活动阶段。
_Avoid_: implemented、implementation-ready

**已确认缺陷（Confirmed Defect）**:
既有契约或不变量与可复现实际行为之间存在证据化偏差；只有该事实成立，工作项才可继续作为缺陷修复。
_Avoid_: 未复现问题、期望增强

**失效切片（Invalidated Slice）**:
因上游事实被 reopen 而不再代表当前工作项事实的切片；旧状态和证据仅供审计，递增修订并重新进入正常路径前不能用于放行。
_Avoid_: status=done 但证据 stale

**已确认诊断（Confirmed Diagnosis）**:
由证据支持、足以界定修复边界的因果解释，不是对根因的猜测。
_Avoid_: 疑似原因、症状描述

**人工实测（Human Review）**:
开发者亲自使用可运行切片并记录直接观察；结论为 `approved` 或 `changes-requested`，发现的问题另行按事实层归因。它只对所实测的当前修订有效，任何后续事实或代码变更都必须重新实测。
_Avoid_: accepted 反馈、测试日志代替实测

**开发者（Developer）**:
唯一对产品目标、方案、实际使用和最终验收负责的人；Agents 是执行与审查助手，不构成独立审批主体。
_Avoid_: Approver、Operator、权限角色体系

**人工确认（Human Confirmation）**:
开发者针对一个门禁或低风险快路径中的连续前置门禁给出的明确原话记录，绑定当前事实修订或可运行版本；它用于防止 Agent 误判意图和复用旧确认，不承担身份认证。
_Avoid_: 加密签名、从模糊对话自动推断授权


**事实修订（Fact Revision）**:
一次确认后冻结的需求、设计、方案或规格版本，具有独立内容摘要；reopen 只能创建后继修订，不能覆盖旧修订。
_Avoid_: 覆盖已确认文档、仅依赖 Git 历史

**切片验证（Quick Verification）**:
针对一个可运行切片及其风险画像执行的当前证据，用于证明该修订已达到人工实测条件。
_Avoid_: Full Verification、只跑单元测试

**工作项验证（Full Verification）**:
在所有当前切片完成后，对整个工作项的集成行为、关键路径、清理与回退执行的最终机器证据。
_Avoid_: 每个切片重复执行的 full

**结果卡（Outcome Card）**:
面向开发者的一页验收视图，把承诺行为、实际走查、验证与审查结论、剩余风险、回退和待提升版本汇聚到一起。
_Avoid_: 原始日志堆、仅 pass/fail

**已接受基线（Accepted Baseline）**:
配置目标分支上最近一次 accepted Promotion 的精确提交，是新工作项、暂停恢复和回退计算的共同锚点。
_Avoid_: 当前任意工作树、未验收分支


**集成基线（Integration Baseline）**:
当前工作项中已经纳入全部完成切片的唯一组合版本；最终工作项验证只针对该基线。
_Avoid_: 任一 Slice 分支、未验收基线

**契约基线（Contract Baseline）**:
在 implementation-ready 前提交到 Integration Branch 的已确认候选 `SPECS/` 与共享契约版本，所有并行切片从它派生。
_Avoid_: 某个 Slice 私有的契约副本

**完成切片（Done Slice）**:
当前修订的已验证聚焦提交已经串行纳入集成基线，并具备可执行回退方式的切片。
_Avoid_: 仅在隔离分支提交完成

**提升（Promotion）**:
把 `acceptance-ready` 的精确集成版本原子设为新的已接受基线并关闭工作项；目标基线漂移会阻断提升。
_Avoid_: Migration Cutover、普通 merge

**迁移切换（Migration Cutover）**:
在迁移工作项的 Integration Baseline 中把默认调用或配置从旧路径切到新路径，并在已配置验证环境演练回退；它不执行生产部署或真实生产流量切换。
_Avoid_: Promotion、生产部署

**策略 Hook（Policy Hook）**:
在平台事件上执行确定性 allow/deny/observe 判断的适配器；它不调用模型、联网或修改领域事实。
_Avoid_: 自动推进状态的 Hook

**主编排器 Agent（Orchestrator）**:
维护任务图、串行状态与集成、汇聚结果并请求开发者确认的 Agent；没有真实并行 frontier 时可以直接实现切片，但不能审查自己的改动。
_Avoid_: 永不写代码的项目经理、最终决策者

**Worker Agent**:
在独立切片写入边界内实现并返回证据的 Agent，不推进共享事实或集成基线。
_Avoid_: 无边界通用 Subagent

**Reviewer Agent**:
不属于被审变更作者、只读检查 Standards 或 Intent/Contract 符合性的 Agent。
_Avoid_: 作者自审

**编排锁（Orchestration Lock）**:
保证同一时刻只有一个状态推进、共享契约修改或集成动作在执行的协调机制；它解决并发冲突，不建立人员权限。
_Avoid_: 身份租约、prompt 中自称 Main

**切片写入边界（Slice Write Scope）**:
为一个切片修订声明的 exact file 或 directory subtree，用于隔离并行修改、检查冲突和发现越界写入。
_Avoid_: 通用仓库写权限、任意 glob

**实测会话（Review Session）**:
绑定可运行切片内容摘要的人工操作记录，包含目标路径、步骤、观察结果和证据附件，由开发者明确确认。
_Avoid_: 签名打勾、Agent 自动化日志

**项目工作流登记簿（Project Workflow Registry）**:
项目级唯一机器事实，指向零个或一个活动工作项、暂停工作项集合及最后已接受基线；它不复制工作项的类型专属阶段。
_Avoid_: 把最后关闭项继续当作当前项

**审计账本（Audit Ledger）**:
与状态 mutation 共享 transaction identity 和顺序的不可变本地事件序列，用于审计与指标但不取代状态文件；两者不一致会阻断推进。
_Avoid_: best-effort 日志、事件溯源状态

**低风险快路径（Low-risk Fast Path）**:
为满足严格 low allowlist 的单切片 Feature、Bugfix 或 Maintenance，把连续前置事实收敛为一份 Brief 和一次人工确认；Quick、实测和最终验收仍保留。
_Avoid_: 跳过事实层、按改动行数判定 low

**技术 Spike（Spike）**:
在独立 disposable workspace 中验证技术可行性的前置实验，不属于 Integration Baseline。implementation-ready 后可以显式 adopt 其 patch，但必须作为普通 Slice 变更重新经过全部验证与实测。
_Avoid_: 直接 promote 的原型实现
