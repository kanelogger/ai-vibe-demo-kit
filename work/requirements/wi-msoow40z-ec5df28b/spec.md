# 需求简报

1. **解决什么问题**：上一工作项 `wi-msoo5k9d-7f83d4b7`（revision 80，completed）机制全绿但内容缺口未落地——`testing.md` 缺"性能与结构审查"节、`git.md` 缺"并行实现后删除旧路径"规则、`specs/template.md` 简报三问为执行版且与 workflow 既有 exitConditions 冗余；同时上轮 spec 引用的执行计划文件未提交，存在 provenance 悬空。
2. **这一版做什么**：按 `plan.md` 第 1 节完成 3 处 source 内容修改（简报三问恢复文章版"做什么/不做什么"、testing.md 新增性能结构审查节、git.md 补删旧路径规则）+ `plan.md` 落盘提交；验收证据（acceptance-result、verification-report、workflow.json 等）与内容提交落在同一 `94ace48..HEAD` 区间。
3. **暂时不做什么**：不改 `source/manifest.json`、`package.json`、`source/workflows/workflow-template.json`；不动 `workflow-case-zh.md` 等联动文档；不做发布、Tag、Push、生产写入与历史改写；不改任何代码与测试。

# Intent

按 `plan.md`（本工作项执行计划，随本区间提交）补齐上一轮缺失的两处内容修改并恢复文章版简报三问，以完整 Harness 工作项承载证据链：验收证据与内容提交落在同一 `94ace48..HEAD` 区间。

# Acceptance Criteria

1. `source/specs/template.md` 需求简报第 2、3 条替换为文章版——"2. 这一版做什么：本期范围与交付物边界。3. 暂时不做什么：明确排除的范围与边界。"；第 1 条与定位说明句不动；`实现<SPEC>。在工作过程中……` 段落完整保留、不被劈开、不改写。
2. `source/rules/testing.md` 在 `## Required Checks` 表格与 `## Reporting` 之间新增 `## 性能与结构审查` 节，含三条规则：稳定/复杂模块先做审查的前提（可运行版本+真实数据，不得在静态设计稿上判断）；并行实现对比替换且替换完成必须删除旧路径（指向 git.md）；审查结论与替换验证记录进 verification-report 或独立 review 记录。
3. `source/rules/git.md` 在"验证完成后再形成独立提交或等价的可回退记录。"之后新增规则：并行实现只是迁移手段，替换验证通过后必须删除旧路径、旧实现不得与替换实现永久共存；删除与替换在同一需求内完成，删除后的关键路径验证纳入验收证据。
4. `plan.md` 非空并随本工作项以 `docs` 提交落盘。
5. `source/manifest.json`、`package.json`、`source/workflows/workflow-template.json` 零改动；`node scripts/check-distribution.mjs` 输出 `distribution: valid`；`./harness check --json` 保持 `valid: true` 且 Workflow digest `sha256:3b24b016…7380` 不变。
6. 提交序列恰好为 5 个提交（3 个 `feat` 内容提交 + 1 个 `docs` plan.md 提交 + 1 个 `chore` 证据提交），全部落在 `94ace48..HEAD`；`node scripts/check-commit-messages.mjs 94ace48 HEAD` 与 `node scripts/check-completion-evidence.mjs 94ace48 HEAD` 在提交后决定性运行并退出码 0。

# Implementation Shape

- 修改 1（`source/specs/template.md`）：仅替换三问第 2、3 条两行，其余字节不动。
- 修改 2（`source/rules/testing.md`）：在 Required Checks 表格与 Reporting 之间整节插入 `## 性能与结构审查`（plan.md 第 1 节给定原文），不改动既有两节。
- 修改 3（`source/rules/git.md`）：在"验证完成后再形成独立提交或等价的可回退记录。"条目之后新增一条并列规则（plan.md 第 1 节给定原文），既有各条目原样保留。
- 修改 4（`plan.md`）：文件已在仓库根，随 `docs` 提交入库。
- 每处修改的决策与偏差记录于 `implementation-notes.md`；quick-evidence 实跑 `./harness check --json` 与 `node scripts/check-distribution.mjs`。

# Risk And Rollback

- 风险：零代码风险（content-only，机制已在上轮实证）。
- 风险：简报三问改回文章版不被接受 → Gate 1 reject 即回 alignment 重冻结执行版三问，无其他损失。
- 回退：revert `94ace48..HEAD` 区间内 5 个提交即可；不涉及发布、Tag、Push、生产写入或数据迁移。

# Environment Alignment

- 操作系统 Darwin（macOS）、架构 arm64：匹配 `project.yml` 声明（实跑 `uname -s`/`uname -m`）。
- Node v24.18.0：满足最低 22，属已测试版本（22/24），匹配 `.harness/manifest.json#minimumNodeVersion`。
- Git 2.55.0：满足 required。
- npm 11.16.0：与 `package.json#packageManager` 一致。
- Docker 29.4.0：可选探测，可用。
- 必需探测零偏差。
- 基线 `./harness check --json`：revision 80，`valid: true`，零 errors/warnings；本工作项于 revision 81 启动（`wi-msoow40z-ec5df28b`），Workflow digest `sha256:3b24b016…7380`。
- 基线 HEAD：`94ace48`（上轮 chore 证据提交），工作区仅 untracked `plan.md`。
