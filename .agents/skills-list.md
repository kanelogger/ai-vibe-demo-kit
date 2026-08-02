# 产品开发技能列表

### 想法澄清与压力测试

| 技能名称 | 说明 |
| --- | --- |
| `grill-me` | 通过犀利问答打磨计划或设计（`/grilling` 的入口）。 |
| `grilling` | 对用户计划或设计进行无情追问与压力测试。 |
| `grill-with-docs` | 在打磨计划的同时生成 ADR 与术语表文档。 |

### 规划、规格与任务拆解

| 技能名称 | 说明 |
| --- | --- |
| `setup-matt-pocock-skills` | 为工程 skills 配置 issue tracker、triage 标签与领域文档布局。 |
| `to-spec` | 将当前对话合成为 spec/PRD 并发布到项目 issue tracker，不做访谈。 |
| `to-tickets` | 将计划/spec 拆分为声明阻塞边的 tracer-bullet ticket 集。 |
| `triage` | 将 issue 与外部 PR 按分类、验证、grill、brief 状态机推进。 |
| `wayfinder` | 为超大规模任务绘制 issue tracker 上的共享决策 ticket 地图，逐个解决直到路线清晰。 |

### 架构、接口与领域模型

推荐：多个。为什么用多个：领域语言解决“怎么称呼”，深模块词汇解决“怎么切分”，架构扫描解决“哪里该深化”；三者是递进关系。使用顺序：`domain-modeling` → `codebase-design` → `improve-codebase-architecture`。

| 技能名称 | 说明 |
| --- | --- |
| `domain-modeling` | 构建并打磨项目的领域模型与统一语言，记录 ADR。 |
| `codebase-design` | 为深度模块设计提供共享词汇（module/interface/depth/seam/adapter）。 |
| `improve-codebase-architecture` | 扫描代码库中的深化机会并生成可视化 HTML 报告。 |

### 编码实现与原型

| 技能名称 | 说明 |
| --- | --- |
| `implement` | 基于 spec 或 ticket 集实现一段具体工作，内部驱动 TDD 与 code-review。 |
| `tdd` | 测试驱动开发，在预先约定的 seam 上做红绿循环。 |
| `prototype` | 为设计问题搭建可丢弃原型（逻辑分支或 UI 分支）。 |
| `migrate-to-shoehorn` | 将测试中的 `as` 断言迁移到 @total-typescript/shoehorn。 |
| `scaffold-exercises` | 创建带章节、题目、解答与讲解的习题目录结构。 |
| `resolving-merge-conflicts` | 追溯冲突双方的原始意图并解决 git merge/rebase 冲突。 |

### 前端与网页设计

| 技能名称 | 说明 |
| --- | --- |
| `web-design` | 从 PRD/参考 URL/截图生成 DESIGN.md 并据此产出达标 web 代码。 |
| `baoyu-design` | 产出自包含 HTML 设计产物：UI 稿、落地页、仪表盘、PPT、报告、海报等。 |

### 代码审查、调试与研究

| 技能名称 | 说明 |
| --- | --- |
| `code-review` | 双轴审查（Standards × Spec）从固定基准点审查代码改动，并行子代理执行。 |
| `diagnosing-bugs` | 针对棘手 bug 与性能回退的诊断循环，优先构建反馈回路。 |
| `research` | 派后台代理对照一手来源调查问题并沉淀为 Markdown 文档。 |

### 验证、溯源与记忆

| 技能名称 | 说明 |
| --- | --- |
| `verification-closeout` | 按风险级别执行切片验证并产出可审计的机器报告与证据。 |
| `source-register` | 把文档断言依据的事实整理成可审计的 Source Register。 |
| `memory-writeback` | 把可复用经验写回长期事实源，维护决策覆盖谱系。 |

### 工程自动化与协作

| 技能名称 | 说明 |
| --- | --- |
| `setup-pre-commit` | 配置 Husky + lint-staged 预提交钩子（格式化、类型检查、测试）。 |
| `git-guardrails-claude-code` | 配置 Claude Code hooks 拦截危险 git 命令（push、reset --hard 等）。 |
| `handoff` | 将当前对话压缩为交接文档供其他代理继续。 |

### Agent、Skill 与工具集成

| 技能名称 | 说明 |
| --- | --- |
| `ask-matt` | 判断当前情境适合调用哪个 skill 的路由器。 |
