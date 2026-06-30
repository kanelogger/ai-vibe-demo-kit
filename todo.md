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

### 2. 技能索引已机器化，编排入口仍缺失

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

剩余影响：CLI 仍没有 `kit skills` / `kit next` 一类编排入口，Agent 还需要自己读取索引后执行判断。

### 3. SDD 骨架文件未落地

`templates/pc-admin/SPECS/README.md` 已说明旧 SDD 到新目录的映射，但实际模板中仍缺少这些骨架：

| 目标文件 | 状态 |
| --- | --- |
| `frontend/SPECS/PRD.md` | 缺失 |
| `frontend/SPECS/ARCHITECTURE.md` | 缺失 |
| `frontend/SPECS/FEATURES/<feature-slug>/spec.md` | 缺失 |
| `frontend/SPECS/FEATURES/<feature-slug>/tasks.md` | 缺失 |
| `backend/SPECS/PRD.md` | 缺失 |
| `backend/SPECS/ARCHITECTURE.md` | 缺失 |
| `backend/SPECS/FEATURES/<feature-slug>/spec.md` | 缺失 |
| `backend/SPECS/FEATURES/<feature-slug>/tasks.md` | 缺失 |

影响：进入 `implementation-ready` 后，Agent 仍要自行判断 SDD 文件形态，容易写散。

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

### 6. CLI 与 skill 没有编排入口

当前 `kit` 只负责 scaffold、check、stage advance。

尚未实现：

- `kit skills`
- `kit next`
- `kit propose`
- `kit options`
- `kit sdd`
- `kit skill <alias>`

影响：第 6-9 步用户旅程还没有形成“阶段 -> 推荐技能 -> 产物模板 -> check -> 用户确认 -> stage advance”的闭环。

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

- [ ] 新增 `frontend/SPECS/PRD.md`。
- [ ] 新增 `frontend/SPECS/ARCHITECTURE.md`。
- [ ] 新增 `frontend/SPECS/FEATURES/.gitkeep`。
- [ ] 新增 `frontend/SPECS/FEATURES/example-feature/spec.md`。
- [ ] 新增 `frontend/SPECS/FEATURES/example-feature/tasks.md`。
- [ ] 新增 `backend/SPECS/PRD.md`。
- [ ] 新增 `backend/SPECS/ARCHITECTURE.md`。
- [ ] 新增 `backend/SPECS/FEATURES/.gitkeep`。
- [ ] 新增 `backend/SPECS/FEATURES/example-feature/spec.md`。
- [ ] 新增 `backend/SPECS/FEATURES/example-feature/tasks.md`。
- [ ] 更新 `SPECS/README.md`，明确这些文件和 `workflow/` 的关系。

### P4 - CLI 与 skill 编排

- [ ] 设计 `kit skills`：读取 `.agents/skills.json`，列出可用 alias、stage、输入、输出。
- [ ] 设计 `kit next`：读取 `workflow-state.json`，输出当前阶段下一步建议、应调用技能、应创建文件。
- [ ] 设计 `kit propose`：辅助创建 `workflow/requirements.md` 初稿。
- [ ] 设计 `kit options`：辅助创建 `workflow/solution-options.md`，并校验正好 3 个方案。
- [ ] 设计 `kit sdd`：根据选定方案生成前后端 SDD 骨架。
- [ ] 明确 CLI 只做文件/状态编排，不伪装成真正执行 Agent skill。

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

推荐继续做 P3 + P4：

1. 补齐前后端 SDD 模板骨架。
2. 再设计 `kit skills` / `kit next`，读取 `.agents/skills.json` 输出阶段建议。
3. 最后预研 hook 路由增强。

理由：`TEMPLATE.md`、`.agents/skills.json`、workflow/tasks 模板已经补齐；剩余风险主要是进入 `implementation-ready` 后缺少前后端 SDD 文件形态，以及 CLI 尚未提供读取索引后的下一步建议。
