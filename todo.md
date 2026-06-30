# ai-vibe-demo-kit 待办与状态

## 三、与 ref.md 愿景的差距

### 1. 模板索引已落地

`ref.md` 要求控制文件包含 `AGENTS.md` / `SPEC` / `RULES` / `Template`。

当前状态：

- `templates/pc-admin/AGENTS.md` 已存在。
- `templates/pc-admin/SPECS/` 已存在。
- `templates/pc-admin/rules/` 已存在。
- `templates/pc-admin/TEMPLATE.md` 已存在，并已纳入 `kit check` 控制文件校验。

剩余影响：无。根目录维护者视角的 `TEMPLATE.md` 已判断为不需要；生成项目侧的模板地图已经补齐。

### 2. 技能索引已机器化，Hook 路由仍缺失

当前有：

- `.agents/skills/<skill>/SKILL.md`
- `skills-list.md`
- `.agents/skills.json`

缺少：

- `.agents/routing.json`
- 或等价的运行时路由规则。

当前状态：

- `.agents/skills.json` 已把 `skills-list.md` 机器化，包含默认链路、阶段推荐和 alias 到真实 skill 的映射。
- `kit init` 已把 `.agents/skills.json` 复制进生成项目。
- `kit check` 已校验技能索引存在、JSON 结构、alias 引用和真实 `SKILL.md` 文件。
- `templates/pc-admin/AGENTS.md` 已要求选择 skill 时读取 `.agents/skills.json`。

剩余影响：无。CLI 已提供 `kit skills` / `kit skill <alias>` / `kit next` 编排入口，Agent 不再需要手动解析技能索引。

### 3. SDD 骨架文件未落地

`templates/pc-admin/SPECS/README.md` 已说明旧 SDD 到新目录的映射，实际模板已补齐前后端 SDD 骨架：

| 目标文件 | 状态 |
| --- | --- |
| `frontend/SPECS/PRD.md` | 已落地 |
| `frontend/SPECS/ARCHITECTURE.md` | 已落地 |
| `frontend/SPECS/FEATURES/<feature-slug>/spec.md` | 已落地 example，并可由 `kit sdd <feature-slug>` 生成 |
| `frontend/SPECS/FEATURES/<feature-slug>/tasks.md` | 已落地 example，并可由 `kit sdd <feature-slug>` 生成 |
| `backend/SPECS/PRD.md` | 已落地 |
| `backend/SPECS/ARCHITECTURE.md` | 已落地 |
| `backend/SPECS/FEATURES/<feature-slug>/spec.md` | 已落地 example，并可由 `kit sdd <feature-slug>` 生成 |
| `backend/SPECS/FEATURES/<feature-slug>/tasks.md` | 已落地 example，并可由 `kit sdd <feature-slug>` 生成 |

剩余影响：无。`kit check` 已把基础 SDD 模板纳入控制文件校验，`kit sdd` 可创建 feature 级前后端 SDD 骨架。

### 4. workflow/tasks 模板已落地

最近提交已删除 `workflow/` 与 `tasks/` 下的全量预填计划，只保留 README 骨架。当前已补齐可复制的最小模板。

当前状态：

- `workflow/requirements.template.md`
- `workflow/solution-options.template.md`
- `workflow/solution-selected.template.md`
- `workflow/implementation-ready.template.md`
- `tasks/backlog.template.md`
- `tasks/sprint-01.template.md`
- `workflow/README.md` 与 `tasks/README.md` 已说明复制成正式文件的时机。

剩余影响：无。`kit check` 已把这些模板纳入控制文件校验，并允许 `workflow/*.template.md` 在所有阶段存在。

### 5. Hook 路由增强缺失

当前没有：

- `.agents/hooks/`
- hook 协议文档
- 可执行 hook 脚本
- “当前 stage + 用户消息 -> 推荐 skill”的运行时输出

影响：skill 触发概率仍主要依赖提示词，不够稳定。

### 6. CLI 与 skill 编排入口已落地

当前 `kit` 已负责 scaffold、check、stage advance，并补齐轻量编排入口。

当前状态：

- `kit skills`：读取 `.agents/skills.json`，列出 alias、真实 skill、阶段和当前 stage 推荐。
- `kit skill <alias>`：查看单个 alias 的路由元数据。
- `kit next`：读取 `workflow-state.json`，输出下一阶段、推荐技能和应创建文件。
- `kit propose`：创建 `workflow/requirements.md` 草稿骨架。
- `kit options`：创建 `workflow/solution-options.md`，并可用 `--check` 校验正好 3 个方案。
- `kit sdd`：根据 feature slug 创建前后端 SDD 骨架。

剩余影响：无。CLI 明确只做文件/状态编排，不伪装成真正执行 Agent skill。

### 7. README 仍偏最小用法

当前 README 能说明 init/check/stage，但还缺：

- 完整从 `npx ai-vibe-demo-kit init` 到 `implementation-ready` 的示例。
- 每个阶段应该创建哪个 workflow 文件。
- `kit check` 失败时如何修复。
- `npm pack --dry-run` / `npm publish --dry-run` 的发布前检查说明。
- 生成项目内 `pnpm kit:check` / `pnpm kit:stage` 的推荐用法。

## 四、待办清单

### P1 - 控制面补齐

- [x] 新增 `templates/pc-admin/TEMPLATE.md`，说明模板结构、扩展方式、生成约定、前后端边界。
- [x] 判断是否也需要根目录 `TEMPLATE.md`；结论是不需要，避免混入生成项目说明。
- [x] 新增 `.agents/skills.json`，把 `skills-list.md` 机器化。
- [x] 在 `templates/pc-admin/AGENTS.md` 中引用 `TEMPLATE.md`。
- [x] 更新 CLI `check`，把 `TEMPLATE.md` 纳入控制文件校验。
- [x] 在 `templates/pc-admin/AGENTS.md` 中引用技能索引。
- [x] 更新 CLI `check`，把技能索引纳入控制文件校验。

### P2 - workflow/tasks 模板

- [x] 新增 `workflow/requirements.template.md`，包含 `status: draft` / `confirmed` 示例字段。
- [x] 新增 `workflow/solution-options.template.md`，包含正好 3 个 `optionIds` 示例。
- [x] 新增 `workflow/solution-selected.template.md`，包含用户选择字段。
- [x] 新增 `workflow/implementation-ready.template.md`，包含进入实现前确认字段。
- [x] 新增 `tasks/backlog.template.md`。
- [x] 新增 `tasks/sprint-01.template.md`。
- [x] 更新 `workflow/README.md` 和 `tasks/README.md`，说明从 template 复制成正式文件的时机。

### P3 - SDD 模板

- [x] 新增 `frontend/SPECS/PRD.md`。
- [x] 新增 `frontend/SPECS/ARCHITECTURE.md`。
- [x] 新增 `frontend/SPECS/FEATURES/.gitkeep`。
- [x] 新增 `frontend/SPECS/FEATURES/example-feature/spec.md`。
- [x] 新增 `frontend/SPECS/FEATURES/example-feature/tasks.md`。
- [x] 新增 `backend/SPECS/PRD.md`。
- [x] 新增 `backend/SPECS/ARCHITECTURE.md`。
- [x] 新增 `backend/SPECS/FEATURES/.gitkeep`。
- [x] 新增 `backend/SPECS/FEATURES/example-feature/spec.md`。
- [x] 新增 `backend/SPECS/FEATURES/example-feature/tasks.md`。
- [x] 更新 `SPECS/README.md`，明确这些文件和 `workflow/` 的关系。

### P4 - CLI 与 skill 编排

- [x] 设计 `kit skills`：读取 `.agents/skills.json`，列出可用 alias、stage、输入、输出。
- [x] 设计 `kit next`：读取 `workflow-state.json`，输出当前阶段下一步建议、应调用技能、应创建文件。
- [x] 设计 `kit propose`：辅助创建 `workflow/requirements.md` 初稿。
- [x] 设计 `kit options`：辅助创建 `workflow/solution-options.md`，并校验正好 3 个方案。
- [x] 设计 `kit sdd`：根据选定方案生成前后端 SDD 骨架。
- [x] 明确 CLI 只做文件/状态编排，不伪装成真正执行 Agent skill。

### P5 - Hook 机制

- [ ] 新增 `.agents/hooks/README.md`，定义最小 hook 输入输出协议。
- [ ] 新增 `.agents/hooks/route-skill.mjs`，输入当前 stage 和用户消息，输出推荐 skill alias。
- [ ] 在 `TEMPLATE.md` / `AGENTS.md` 中说明 hook 是可选增强，不作为阶段推进事实源。
- [ ] 给 hook 增加最小测试或可复现示例。

### P6 - 发布与文档打磨

- [ ] 修复本机 npm cache 权限，确保默认 `npm pack --dry-run` 可直接通过。
- [ ] 跑 `npm publish --dry-run`。
- [ ] 更新 README 的完整用户旅程。
- [ ] 说明生成项目后如何运行 `pnpm install`、`pnpm kit:check`、`pnpm kit:stage`。
- [ ] 检查发布包是否应包含 `skills-list.md` 或只保留机器索引。
- [ ] 发布前确认 `package.json` 版本号和 changelog/release note。

## 五、建议下一步

推荐继续做 P5 + P6：

1. 补 hook 路由增强，把“当前 stage + 用户消息 -> 推荐 skill alias”做成可复现输出。
2. 再打磨 README 的完整用户旅程和发布前检查说明。
3. 最后处理 npm cache 权限、`npm pack --dry-run` 和 `npm publish --dry-run`。

理由：`TEMPLATE.md`、`.agents/skills.json`、workflow/tasks 模板、SDD 骨架和 CLI 编排入口已经补齐；剩余风险主要是 skill 触发仍依赖提示词，以及发布文档和发布前检查还不完整。
