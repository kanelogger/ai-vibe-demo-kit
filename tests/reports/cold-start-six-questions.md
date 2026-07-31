# 冷启动六问验收报告

日期：2026-07-31
对象：`tests/fixtures/adapted-project/`（既有项目 + Overlay 复制 + 人工合并适配后的产物）
方法：无任何口头背景的独立 Agent 会话，只读目标目录回答六问；发现缺口后回到事实源修复并复核。

## 六问回答（复核后）

### 1. 项目是什么

Node 20 问候 CLI 示例项目（`existing-project`），已接入 AI Native Harness Overlay v0.3.0；核心行为 `greet(name)` 返回 `hello <name>`。

证据：`.harness/config.json`（project identity）、`SPECS/ARCHITECTURE.md`（Project Identity + Runtime And Tooling）、`src/util.js`、`src/index.js`、`package.json`。

### 2. 当前走到哪一步

`initialized` 阶段：Overlay 已接入，尚未开始需求工作。

证据：`workflow-state.json`（stage、空的 history、null confirmation）；`workflow/` 下无实际阶段文档。

### 3. 允许做什么

仅允许准备 `requirements-draft`（`workflow/requirements.md`，status: draft）；Agent 不得修改状态文件推进阶段，不得代替用户确认。

证据：`workflow-state.json` 的 `allowedNextStages`、`AGENTS.md` 阶段门禁、`workflow/README.md` 放行规则。

### 4. 按什么流程做

六阶段线性流程，每次推进需用户原话放行：

```text
initialized -> requirements-draft -> requirements-confirmed -> solution-options -> solution-selected -> implementation-ready
```

证据：`AGENTS.md` 阶段门禁、`workflow/README.md` 阶段-文档对应表、`rules/ai-implementation.md`。

### 5. 如何验证

两层：Harness 结构检查（`scripts/harness-check.mjs`，只读）+ 项目真实命令（`.harness/config.json` 登记的 `node --check src/index.js`、`node --test tests/`）。检查通过不等于应用验收通过。

证据：`.harness/config.json` commands、`HARNESS.md` 检查契约、`AGENTS.md` 检查命令、`rules/testing.md`。

### 6. 经验写到哪里

简单决策 → `memory/decisions.md`；重要架构决策 → `memory/adr/`；可复用约束 → `rules/`；长期事实 → `SPECS/`；覆盖关系用 `superseded-by` 谱系表达。

证据：`AGENTS.md`、`memory/decisions.md` 条目格式、`SPECS/README.md`、`.agents/skills/memory-writeback/SKILL.md`。

## 发现的缺口与修复

| 缺口 | 处置 |
| --- | --- |
| `SPECS/ARCHITECTURE.md` Runtime And Tooling 表全空，六问之一的“项目是什么”证据不完整 | 夹具回填真实事实；检查器新增确定性规则：Runtime 表存在全空行报 `context.architecture-unfilled`（正反向均有测试） |
| `commands.full` 空组语义只存在于 human-readable notes | 接受为首版设计决策：quick 为必登记组，full 为空视为与 quick 相同；已在 config notes 中形成可引用证据 |
| Module Map / Durable Contracts / Verification Commands / Risk And Recovery 未填 | 夹具已回填；不纳入检查器强制项（无法穷尽判定，保留人工职责） |

## 复核结论

六问全部通过，每个答案有唯一仓库证据；Agent 正确区分了当前事实（state、config）、历史过程（空 history）、模板占位符（`*.template.md`、`.gitkeep`），未把 Harness 检查通过误报为应用验收。

## 仍需目标项目真实运行的验证

- `node --check src/index.js`（静态检查，config 登记）
- `node --test tests/`（单元测试，config 登记）
- `node src/index.js`（手动观察 CLI 输出；非 UI 项目未登记 criticalUserPaths）
- `git revert <commit>`（回退流程，模板命令需替换实际 commit）
