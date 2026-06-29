
**当前项目已经实现了 `ref.md` 中“PDCA 阶段锁”这一核心控制机制的最小可用版本（v1），但距离完整愿景仍有明显距离。**

- **已落地**：CLI 三件套（`init / check / stage advance`）、状态机、阶段门、基础 Agent 控制文件、模板骨架、测试覆盖。
- **未落地**：Hook 路由增强、独立技能索引、RULES 控制文件、完整 SDD 文档生成、npm 分发形态、以及“第 6 步起 Agent 自动调用技能产出文档”的端到端工作流。

可以概括为：**“骨架已通，血肉未齐”**。
实现一个可执行 hook 脚本，用关键词提示 Agent 调用对应 skill

## 二、主要差距

### 1. 控制文件不完整：`RULES` 与 `Template` 缺失

`ref.md` 明确要求四类控制文件：

```text
AGENTS.md / SPEC / RULES / Template
```

当前只有：

- `AGENTS.md` ✅
- `SPECS/`（仅有 `API.md` / `README.md`）⚠️
- `RULES` ❌
- `Template` ❌

**影响**：Agent 在运行时缺少一份显式的“行为规则”文件和模板索引，长期会削弱控制面的完整性。

---

### 2. SDD 文档生成愿景只落到“说明”层面，未落到模板

`ref.md` 要求一次完整全栈 SDD 产出：

```text
前端：proposal.md / spec.md / tasks.md
后端：proposal.md / spec.md / design.md / tasks.md
```

当前：

- `plan/04-specs-contract.md` 里把这些旧 SDD 文档**映射**到了新的 `SPECS/` 结构；
- `templates/pc-admin/SPECS/sample-feature-walkthrough.md` 是一份**说明文档**；
- 但 `templates/pc-admin/` 实际模板里**没有**这些文件或目录：
  - `frontend/SPECS/PRD.md`
  - `frontend/SPECS/ARCHITECTURE.md`
  - `frontend/SPECS/FEATURES/<feature-slug>/spec.md`
  - `frontend/SPECS/FEATURES/<feature-slug>/tasks.md`
  - 后端同理。

**影响**：Agent 进入 `implementation-ready` 后，仍然需要自己判断该创建哪些 spec 文件，无法直接沿用模板结构。

---

### 3. Hook 机制完全缺失

`ref.md` 把 Hook 列为三层控制面的中间层：

> “如果运行环境支持 hooks，就可以做一层‘意图路由增强’。”

当前项目中：

- 没有任何 hook 文件或目录；
- `plan/02-template-control-files.md` 明确把“runtime-specific hook integration”列为 **Out of Scope**。

**影响**：Agent 能否主动调用 skill 完全依赖 `AGENTS.md` 的提示，没有运行时的意图路由增强。

---

### 4. 技能发现缺少独立的 JSON 索引

`skills-list.md` 里写得很清楚：

> “Agent 的技能发现和路由由独立的 JSON 索引文件负责。”

但实际 `.agents/` 下只有：

- 大量 `SKILL.md`；
- 没有 `skills.json` / `index.json` / `routing.json` 之类的索引文件。

**影响**：Agent 无法通过机器可读索引自动发现技能，只能依赖人类可读的 `skills-list.md` 或系统提示中的 skill 列表。

---

### 5. 用户旅程第 6–9 步未自动化

`ref.md` 描述的旅程：

```text
6. Agent 调用技能询问用户、完善需求 → 产出需求文档
7. 用户查看、迭代 → 调整的需求文档
8. 调用技能、结合模板进行技术方案设计 → 3 个方案
9. 将选择的技术方案……
```

当前：

- CLI 提供了阶段推进命令；
- `.agents/skills/` 里放置了 `ce-brainstorm`、`doc-coauthoring`、`design-an-interface`、`planning-and-task-breakdown` 等技能；
- **但 CLI 与技能之间没有编排**：`kit` 不会自动触发 skill，也不会根据当前 stage 推荐下一步该调用哪个 skill。

**影响**：Agent 仍然需要人工阅读 `AGENTS.md` 和 `skills-list.md` 决定下一步，没有形成“阶段 → 技能 → 产物”的闭环。

---

### 6. npm 分发形态尚未就绪

`ref.md` 的用户旅程第一步是：

```text
1. npm install <kit>
2. npx <kit> init <project-name>
```

当前：

- `package.json` 中 `name` 是 `kit-test`；
- `"private": true`；
- 没有 bin 字段；
- CLI 入口是通过 `scripts/kit.mjs` 在生成项目里挂载的 `pnpm kit:check` / `pnpm kit:stage`。

**影响**：项目目前是一个仓库内 monorepo，不是一个可 `npm install` / `npx` 消费的 kit 包。

---

### 7. 计划完成门全部未勾选

`plan/*.md` 中所有 Completion Gate 的复选框都是 `- [ ]`，包括 Phase 1–4 的全部验收项：

```text
plan/01-cli-foundation.md:58:- [ ] `pnpm build` exits cleanly.
plan/02-template-control-files.md:58:- [ ] Fresh generated project contains every control file...
plan/03-stage-gate-fixtures.md:64:- [ ] Every valid fixture passes `kit check`.
plan/04-specs-contract.md:64:- [ ] Every old SDD document from `ref.md` has an explicit destination...
```

虽然测试已经通过，但这些 checkbox 未更新，说明**项目验收状态没有在文档层面得到确认**。

---

## 三、具体缺失清单

按优先级排序：

| 优先级 | 缺失项 | 对应愿景 |
|---|---|---|
| P1 | 项目级 `RULES` 控制文件 | ref.md 控制文件四件套 |
| P1 | `Template` 索引/说明文件 | ref.md 控制文件四件套 |
| P1 | 独立 JSON 技能索引（`.agents/skills.json`） | skills-list.md 自述 |
| P2 | `frontend/SPECS/PRD.md`、`ARCHITECTURE.md`、`FEATURES/<slug>/{spec,tasks}.md` 模板 | ref.md SDD 文档清单 |
| P2 | 后端同上 | ref.md SDD 文档清单 |
| P2 | 全栈 SDD 生成提示词模板文件 | ref.md 中“全栈 SDD 生成提示词模板” |
| P2 | CLI 与 skill 的编排入口（如 `kit propose` / `kit sdd`） | ref.md 第 6–9 步 |
| P3 | Hook 路由增强机制 | ref.md Hook 层 |
| P3 | npm 包发布准备（改名、bin、取消 private） | ref.md 用户旅程第 1–2 步 |
| P3 | 更新 `plan/*.md` 完成门状态 | 项目内部契约 |

---

## 四、建议下一步

如果想继续逼近 `ref.md` 愿景，建议按以下顺序推进：

1. **补全控制文件**：新增根目录 `RULES.md` 和 `TEMPLATE.md`，与 `AGENTS.md`、`SPECS/` 形成四件套。
2. **建立技能索引**：创建 `.agents/skills.json`，把 `skills-list.md` 中的映射机器化。
3. **扩展 SPECS 模板**：在 `templates/pc-admin/frontend/SPECS/` 和 `backend/SPECS/` 下补齐 `PRD.md`、`ARCHITECTURE.md`、`FEATURES/.gitkeep` 等骨架。
4. **增加 CLI 编排命令**：例如 `kit propose`（触发需求澄清）、`kit sdd`（触发 SDD 生成）、`kit options`（触发方案生成），把阶段与 skill 关联起来。
5. **Hook 机制预研**：先出一个 `.agents/hooks/` 设计文档或最小示例，验证意图路由增强的可行性。
6. **npm 包化**：调整 `package.json` 的 `name`、`private`、`bin`，使项目可被 `npx` 调用。
7. **勾选完成门**：根据当前测试结果，把 `plan/*.md` 中已满足的 Completion Gate 标记为 `[x]`。
