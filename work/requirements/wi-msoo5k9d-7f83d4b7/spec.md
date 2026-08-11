# 需求简报

1. **解决什么问题**：分发内容未要求 spec 携带三问简报，下游 Agent 的 alignment 交付物可能缺失意图/验收/风险的显式回答；`git.md` 的受治理证据规则未点明"同区间提交"，存在先推内容、后补证据导致 CI 在中间区间失败的操作空间；`agents_template.md` 完成条件缺少证据链纪律，下游实例继承不到完成判定标准。
2. **怎样算完成**：`specs/template.md`、`rules/git.md`、`agents_template.md` 三处内容按下方验收标准修改；`./harness check --json` 与 `node scripts/check-distribution.mjs` 通过；3 个 feat 内容提交 + 1 个 chore 证据提交落在同一 `base..HEAD`，`check-commit-messages` 与 `check-completion-evidence` 通过。
3. **风险与回退**：纯文档内容修改，零代码风险；唯一判断风险是简报三问与证据措辞的表述不被接受——由 Gate 1 / Gate 2 人工确认拦截；回退为 revert 同一区间内的四个提交，无数据迁移与外部写入。

# Intent

按 plan.md 修订点 A/B 对三处分发内容（全部命中 `^source/`）做补强，并以完整 Harness 工作项承载证据链：验收证据与内容提交落在同一 `base..HEAD` 区间。

# Acceptance Criteria

1. `source/specs/template.md` 最顶部新增 `## 需求简报` 小节：三问（解决什么问题 / 怎样算完成 / 风险与回退）+ 一句定位说明；原有 `实现<SPEC>。在工作过程中……` 段落完整保留在其后，不被劈开、不改写。
2. `source/rules/git.md` 受治理变更条目明确：证据提交必须与受治理内容提交落在同一 `<base-ref>..HEAD` 区间，不存在"先推内容、下轮补证据"的选项；既有 `workflow.json` 同目录校验语义保持不变。
3. `source/agents_template.md` 完成条件补齐：acceptance Stage Result 与 verification report 须通过 `check-result --require-complete`；验收证据随受治理变更同批提交（指向 `source/rules/git.md`）；最终人工 Gate 未批准前不得声称交付完成。
4. `source/manifest.json`、`package.json`、`source/workflows/workflow-template.json` 零改动；`node scripts/check-distribution.mjs` 输出 distribution valid。
5. `./harness check --json` 保持 `valid: true`，Workflow digest 不变。
6. 提交序列恰好为 3 个 `feat` 内容提交 + 1 个 `chore` 证据提交（含 `acceptance-result.json`、`verification-report.json`、`workflow.json` 及本目录其余 stage 产物），`node scripts/check-commit-messages.mjs <base> HEAD` 与 `node scripts/check-completion-evidence.mjs <base> HEAD` 均退出码 0。

# Implementation Shape

- 修改 1（`source/specs/template.md`）：文件顶部插入 `## 需求简报` 小节，原段落原样后移；implementation-notes 语义不变，仍归实现阶段。
- 修改 2（`source/rules/git.md`）：在既有"受治理变更必须……"条目内追加同区间提交约束，措辞与 `scripts/check-completion-evidence.mjs` 实际行为（区间含 governed 变更即要求同区间 acceptance result）对齐。
- 修改 3（`source/agents_template.md`）：在"完成条件"小节既有段落基础上补充证据链三条纪律，保持 `{填写：…}` 占位不动。
- 联动项默认跳过：`workflow-case-zh.md` line 90 为 stageRuns 表格行，非自由文本，本工作项不改。
- 每处修改的决策与偏差记录于 `implementation-notes.md`；quick-evidence 实跑 `./harness check --json` 与 `node scripts/check-distribution.mjs`。

# Risk And Rollback

- 风险：新增措辞与 `check-completion-evidence.mjs` 实际行为不一致 → 实施前已通读脚本核对 GOVERNED_PATHS、同目录 `workflow.json` 回退与区间语义，措辞以脚本行为为准。
- 风险：简报小节位置破坏既有单段祈使文结构 → 按修订点 B 置顶插入、原段落不劈开。
- 回退：revert 同一 `base..HEAD` 内四个提交即可；不涉及发布、Tag、Push、生产写入或数据迁移。

# Environment Alignment

- 操作系统 Darwin（macOS）、架构 arm64：匹配 `project.yml` 声明。
- Node v24.18.0：满足最低 22，属已测试版本（22/24）。
- Git 2.55.0：满足 required。
- npm 11.16.0：与 `package.json#packageManager` 一致。
- Docker 29.4.0：可选探测，可用。
- 必需探测零偏差。
- 基线 `./harness check --json`：revision 74，`valid: true`，零 errors/warnings；工作项于 revision 75 启动，Workflow digest `sha256:3b24b016…7380`。
