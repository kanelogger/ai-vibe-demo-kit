多个 Agent 怎么分工协作，才能在任务边界清晰时更省。

**omp 本身就支持 subagent 调度、worktree 隔离、Skill 绑模型——不需要自己写 Orchestrator，用好内置能力就够了。**

### 1 单 Agent 为什么越用越贵

复杂项目里，单 session 很容易演变成这样：

* 规划、写代码、跑测试、Code Review 全在一个会话
* 上下文越积越长（所有历史都往一个 session 里塞）
* 所有任务用同一个模型配置，便宜活也用最贵模型

**职责越混，上下文越胖，成本越高。**

### 2 subagent：任务隔离的最低成本方式

omp 的 Skill 里可以直接调用 Agent tool，把子任务分发出去：

```text
使用 Agent tool 分析这个 PR 的影响范围，然后把结果返回给我，不需要读具体实现文件。
```

**每个 subagent 都应该有独立的上下文边界——它只看到自己需要的内容，主 session 只看到结果。**

前提是子任务真的能拆开；**如果每个 Agent 都要重复读同一批背景，拆得越多，反而越贵。**

典型分工：

```text
主 session（规划 + 决策）
  ├── subagent A：影响分析（只看图谱，不读源码）
  ├── subagent B：写实现（只看相关文件）
  └── subagent C：跑测试 + 生成报告
```

**subagent 可以单独绑定便宜模型。规划用强模型，执行用便宜模型，两者在不同 session 里，互不干扰。**

### 3 `/new`、`/compact`、`subagent`、`worktree`：四种手段别混用

这四个动作都和"上下文变轻"有关，但解决的问题完全不同：

| 手段       | 解决什么   | 历史怎么处理       | 代码改动怎么处理        | 适用场景     |
| -------- | ------ | ------------ | --------------- | -------- |
| /new     | 切断无关任务 | 直接开新会话       | 仍在同一仓库          | 换话题、换需求  |
| /compact | 压长会话历史 | 保留摘要，不保留完整过程 | 仍在当前工作区         | 长任务续做    |
| subagent | 拆子任务   | 只给子任务需要的上下文  | 默认不做代码隔离        | 搜索、分析、验证 |
| worktree | 隔离并发改动 | 历史不是重点       | 独立 git worktree | 多任务并行开发  |

一句话：

```text
/new 解决换任务
/compact 解决历史过长
subagent 解决职责拆分
worktree 解决代码并发
```

### 4 worktree 并发：多任务同时跑不冲突

有一批互相独立的任务要处理（比如修 5 个不相关的 Bug），可以用 worktree 模式并发：

```text
主分支
  ├── worktree-1：修 Bug A（独立 git worktree）
  ├── worktree-2：修 Bug B（独立 git worktree）
  └── worktree-3：修 Bug C（独立 git worktree）
```

**每个 Agent 在隔离的 worktree 里工作，改的是不同文件，互不冲突。**

怎么开：在 omp 里启动新任务时，指定 worktree 隔离：

```text
开一个新的 worktree 分支修这个 Bug，修完后告诉我分支名，我来 review 再合并。
```

怎么合：worktree 没改动自动清理；有改动返回路径和分支名，自己决定 review 后合并。

适用场景：

* 互相独立的 Bug 修复
* 并行跑不同重构方案对比效果
* 同时生成多个文档

### 5 Orchestrator-Worker 模式：把多 Agent 协作变成工程

前面几节讲的是"怎么给单个 Agent 减负"。这一节讲更进一步的思路：用 Orchestrator-Worker 模式，把一个臃肿的长任务变成一个有分工的流水线。

```text
Orchestrator（协调器 Agent）
  ├── 负责规划、拆解、调度、汇总
  ├── 不亲自读大量文件，不亲自跑命令
  └── 只负责决策

Worker（子 Agent，按需派遣）
  ├── 每个 Worker 只做一件事
  ├── 只看自己需要的上下文
  └── 做完了把结果交回
```

为什么这个模式能省 Token？

一个单 Agent 处理复杂任务时，它必须同时承载规划、代码阅读、工具调用、生成、验证的所有上下文——哪怕它当前正在做的只是"改一个函数"。

**Orchestrator-Worker 模式的本质，是让每个 Agent 只看和当前步骤相关的内容，而不是把整个任务的所有背景都塞进每一次调用。**

一个典型的成本对比：

```text
单 Agent 全程跑：
  System Prompt(5K) + 历史 (120K) + 规划 (10K) + 代码 (50K) + 工具结果 (30K)
  = 215K tokens × N 轮

Orchestrator + Worker 分工：
  Orchestrator 轮次：System Prompt(5K) + 任务状态 (2K) + 规划 (3K) = 10K tokens
  Worker A 轮次：目标 (1K) + 相关文件 (8K) + 工具结果 (5K) = 14K tokens
  Worker B 轮次：目标 (1K) + 测试文件 (6K) + 前步结果 (3K) = 10K tokens

  同样完成任务，每轮成本压缩 5-10 倍
```

具体分工的一个真实例子——"修复 API 层 Bug + 补测试 + 写变更说明"：

```text
Orchestrator（强模型）
  ├── 分析任务，生成工作计划到 .agent/plan.json
  ├── 派出 Worker A：定位 Bug（只给图谱和入口文件）
  ├── 派出 Worker B：修复代码（只给有 Bug 的那几个文件）
  ├── 派出 Worker C：补单测（只给修复后的文件 + 现有测试）
  └── 派出 Worker D：写 changelog（只给 git diff + 模板）

每个 Worker：
  - 独立上下文，完成即销毁
  - 绑定便宜模型（如 DeepSeek）
  - 并行执行（C 和 D 可以同时跑）
  - 结果写入共享文件，Orchestrator 汇总
```

在 omp 里，这个模式可以通过 Agent tool 直接实现——Orchestrator 在主 Skill 或会话里运行，通过 Agent tool 分发子任务：

```text
使用 Agent tool 执行以下子任务，上下文独立，不需要继承当前历史：

目标：定位 src/api/order.go 里的 CreateOrder Bug
上下文：只读 src/api/order.go 和 src/model/order.go
输出：把 Bug 描述和文件行号写入 .agent/findings.md
```

### 6 上下文隔离之后，数据怎么流转

这是 Orchestrator-Worker 模式最绕不开的问题：

> 上下文既然隔离了，Agent 之间怎么传递信息？

**答案：通过共享外置文件，不通过会话历史。**

会话历史是每个 Agent 私有的，不同 Agent 的历史无法互通。但文件系统是共享的。**这意味着上下文隔离和信息共享可以同时成立**：

```text
Agent A 完成工作
  → 把结果写入文件（.agent/step1_result.json）
  → 上下文销毁

Agent B 开始工作
  → 读取文件（.agent/step1_result.json）
  → 只看这个文件，不看 A 的历史
  → 把自己的结果写入 .agent/step2_result.json
```

这个模式有几个关键设计原则。

**原则一：输出格式要结构化。**

自然语言在 Agent 之间传递时容易产生歧义，也难以精确定位所需信息。结构化的 JSON 更紧凑、更可靠，下游 Agent 只需要读它关心的字段：

```json
// .agent/findings.json
{
  "task": "locate-bug",
  "status": "completed",
  "findings": [
    {
      "file": "src/api/order.go",
      "line": 142,
      "issue": "并发场景下 inventory.Lock() 未释放",
      "severity": "high"
    }
  ],
  "next_step": "fix-bug",
  "context_needed": ["src/api/order.go:120-165", "src/model/inventory.go:30-55"]
}
```

下游 Agent 收到的指令里只需要包含：

```text
读取 .agent/findings.json，针对其中的 findings 数组修复代码。
修复完成后将结果写入 .agent/fix_result.json，格式参考 .agent/findings.json。
```

**原则二：用进度文件追踪状态。**

复杂任务里，Orchestrator 需要知道每个步骤是否完成、是否失败、是否需要重试。这个状态本身也应该外置：

```json
// .agent/progress.json
{
  "task_id": "fix-order-bug-20260609",
  "created_at": "2026-06-09T10:00:00Z",
  "steps": [
    {
      "id": "step-1-locate",
      "status": "completed",
      "worker": "investigator",
      "output_file": ".agent/findings.json",
      "completed_at": "2026-06-09T10:02:30Z"
    },
    {
      "id": "step-2-fix",
      "status": "in_progress",
      "worker": "implementer",
      "started_at": "2026-06-09T10:02:35Z"
    },
    {
      "id": "step-3-test",
      "status": "pending",
      "depends_on": "step-2-fix"
    }
  ]
}
```

Orchestrator 每次唤醒时，只需要读这一个文件就能知道任务进展，不需要回放任何 Agent 的历史会话。

**原则三：每个 Worker 的 context 包精心裁剪。**

新开一个 Worker 时，Orchestrator 应该明确告诉它"只读哪些东西"，而不是让 Worker 自己去探索：

```text
# Orchestrator 派遣 Worker 时的指令模板

任务：为 CreateOrder 修复编写单元测试
上下文：
  - 修复内容：读 .agent/fix_result.json 中的 diff 字段
  - 现有测试风格：读 src/api/order_test.go（前50行）
  - 不需要读其他文件

输出：
  - 新增测试写入 src/api/order_test.go
  - 把测试覆盖情况写入 .agent/test_result.json

约束：
  - 只修改 order_test.go，不动其他文件
  - 测试不超过 80 行
```

这个指令本身很短（约 150 tokens），但它让 Worker 的上下文精准到最小必要集合。

**原则四：临时文件及时清理。**

`.agent/` 目录是临时工作区，任务完成后可以归档或删除：

```bash
# 任务完成后归档
mv .agent/ .agent-archive/fix-order-bug-20260609/

# 或直接清理
rm -rf .agent/
```

这样不会污染代码仓库，也不会把旧任务的上下文意外带入新任务。

### 7 并行执行：时间和成本同时压

Orchestrator-Worker 模式的另一个收益是并行。

独立的子任务可以同时启动，不需要等待。omp 的 Agent tool 支持在一次 tool call 里发出多个并行指令：

```text
同时启动以下两个独立任务（使用 Agent tool 并行调用）：

任务 A：为修复后的代码写单元测试
  - 读 .agent/fix_result.json
  - 读 src/api/order_test.go
  - 输出 .agent/test_result.json

任务 B：生成本次变更的 changelog 条目
  - 读 .agent/fix_result.json 中的 diff 字段
  - 参考 CHANGELOG.md 的格式
  - 输出 .agent/changelog_entry.md
```

两个 Worker 同时跑，各自只看自己需要的文件，没有上下文重叠。**时间上并行，成本上独立，互不干扰。**

实际加速效果取决于任务数量和独立性：

| 并行 Worker 数 | 实际加速倍数    |
| ----------- | --------- |
| 2 个         | 1.5–1.8 倍 |
| 3 个         | 2.2–2.6 倍 |
| 4 个         | 2.8–3.4 倍 |

理论上 N 个并行就是 N 倍，实际略低，原因是 Orchestrator 本身有启动/汇总开销，以及 Worker 间有时有轻微的 I/O 竞争。但即便 50% 的并行效率，也意味着 4 个任务只花不到 2 个串行任务的时间。

什么样的任务适合并行：

```text
✅ 适合并行：
  - 不同模块的 Bug 修复（改的文件没有交集）
  - 代码 + 测试 + 文档（三者可以同时生成）
  - 多个文件的格式化/重构（无依赖关系）
  - 影响分析 + 实现方案设计（可以同时推进）

❌ 不适合并行：
  - 有顺序依赖的步骤（先定位 Bug 才能修复）
  - 修改同一个文件的多个任务（会产生冲突）
  - 依赖上一步输出的任务（需要等待）
```

### 8 完整的编排流程：一个端到端示例

把上面几节串起来，看一个完整的端到端示例。

场景：给一个中型 Go 项目做 API 层重构——把分散的错误处理统一改成标准 Error Wrapper，同时补充缺失的单测，生成一份重构报告。

如果用单 Agent：

```text
整个任务在一个 session 里跑
→ 随着轮次推进，历史越来越长
→ 到第 10 轮已经带着 150K+ 的历史
→ 每一轮都重新处理同一批背景
→ 中途如果 /compact，现场信息丢失
→ 总成本：约 800K–1.2M tokens
```

用 Orchestrator-Worker 编排：

```text
阶段 0：初始化
  Orchestrator 读 graph.json，分析影响范围
  → 生成 .agent/plan.json（步骤、文件列表、依赖关系）
  → Orchestrator 本轮消耗：~8K tokens

阶段 1：分析（并行）
  Worker A：扫描每个 API 文件，找出非标准错误处理，结果写 .agent/audit.json
  Worker B：读现有测试，评估覆盖率缺口，结果写 .agent/test_gap.json
  → 两个 Worker 同时跑，各自消耗：~12K tokens
  → 总消耗（并行）：~12K tokens，耗时约 1 个 Worker 的时间

阶段 2：实现（可并行）
  Worker C：按 .agent/audit.json 逐文件替换 Error Wrapper（每次只处理一个文件）
  → 每次消耗：~6K tokens × 文件数

阶段 3：补测（串行，依赖阶段 2）
  Worker D：读修改后的文件 + .agent/test_gap.json，补测试
  → 消耗：~10K tokens

阶段 4：汇总（并行）
  Worker E：生成重构报告（读 .agent/audit.json + git diff）
  Worker F：生成 PR 描述（读 .agent/plan.json + .agent/ 各结果文件）
  → 两个 Worker 同时跑：~8K tokens

总消耗估算：约 100K–150K tokens（比单 Agent 节省 70-85%）
```

成本差异来源很直接：

1. 每个 Worker 只看当前步骤的相关内容，不带全程历史
2. 便宜模型处理执行任务，强模型只用于规划和决策
3. 并行减少时间成本，等待时间从串行叠加变成并行中最长的那个
4. 进度文件替代会话历史，Orchestrator 不需要回放所有轮次
