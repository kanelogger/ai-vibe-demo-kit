# 修改计划：补齐计划缺失项（第 2 轮工作项）

> 目标文件：`plan.md`（本文件）。本文件为工作项的执行计划与 provenance 工件，随工作项同一区间提交。

## 0. 背景与决策

上一工作项 `wi-msoo5k9d-7f83d4b7`（revision 80，已 completed）机制全绿，但内容上**修改 2（testing.md 性能结构审查）、修改 3（git.md 删旧路径）未落地**，且简报三问被替换。本计划开新工作项补齐，区间 base = `94ace48`（当前 HEAD）。

**决策 1（简报三问）：恢复文章版三问。** 理由：
- 文章原意是"范围确认文档，让未参与讨论的人复述最终结论"，三问 = 解决什么问题 / 这一版做什么 / 暂时不做什么；
- 执行版"怎样算完成 / 风险与回退"与 workflow 既有 exitConditions（`acceptance-observable`、`risk-classified`）重复，是冗余；而"做什么 / 不做什么"（范围边界）在现有 spec 契约中**无任何出口条件覆盖**——`scope-complete` 只在实现阶段检查"未越界"，不要求 spec 显式声明边界。文章版三问填补真实缺口。
- 此决策的否决点 = Gate 1（批准即确认；若偏好执行版，reject 回 alignment 重冻结即可）。

**决策 2（plan.md 处置）：保留并提交。** 本文件即本工作项的执行计划，随工作项以 `docs` 提交，修复上轮"spec 引用 plan.md 但文件未提交"的 provenance 悬空问题。不再删除。

## 1. 修改内容（3 个 source 文件 + plan.md，manifest/package.json/workflow 零改动）

### 修改 1：`source/specs/template.md` — 简报三问恢复文章版

将现有三问第 2、3 条替换，第 1 条与定位说明句不动：

```diff
 ## 需求简报
 
 本小节是 alignment 阶段的产物，先于下方实现指令确认并冻结；spec 交付物 = 简报 + 实现指令。用三句话回答：
 
 1. 解决什么问题：意图与价值。
-2. 怎样算完成：可观察的验收结果与证据位置。
-3. 风险与回退：风险分类与回退方式。
+2. 这一版做什么：本期范围与交付物边界。
+3. 暂时不做什么：明确排除的范围与边界。
```

`实现<SPEC>。在工作过程中……` 段落保持原样。

### 修改 2：`source/rules/testing.md` — 新增"性能与结构审查"节

插在 `## Required Checks` 表格与 `## Reporting` 之间：

```markdown
## 性能与结构审查

- 功能验收通过后，对已稳定或历史复杂的模块可先做性能/结构审查，再进入下一需求；
  前提是已有可运行版本和真实数据作参照，不得在静态设计稿上判断。
- 边界明确但历史复杂的模块：先新增并行实现，对比新旧结果，验证通过后替换旧路径；
  替换完成必须删除旧路径，两套实现不得永久共存（见 git.md）。
- 审查结论与替换验证记录进 verification-report 或独立 review 记录，供下一需求决策。
```

### 修改 3：`source/rules/git.md` — 补"并行实现后删除旧路径"

在 `- 验证完成后再形成独立提交或等价的可回退记录。` 之后新增：

```markdown
- 并行实现只是迁移手段：替换验证通过后必须删除旧路径，旧实现不得与替换实现永久共存；
  删除旧路径与替换在同一需求内完成，并把删除后的关键路径验证纳入验收证据。
```

### 修改 4：`plan.md` — 本文件落盘（docs）

将本计划写入本文件，随工作项提交，作为执行计划的 provenance 工件。

## 2. Harness 流程与证据（沿用已实证的上一轮模式）

```
预检(probes 实跑) → start → alignment[spec.md 含简报三问 + alignment-result] → signal → 人工 Gate 1
→ implementation[3+1 处修改 + notes + quick-evidence] → signal（auto）
→ acceptance[验证矩阵 + verification-report/v1 + acceptance-result] → check-result --require-complete
→ 提交（5 个，同一区间）→ c3/c4 决定性复验 → signal → 人工 Gate 2 → completed
```

| 步骤 | 动作 | 产出 |
| --- | --- | --- |
| 1 预检 | 实跑 `uname -s`/`uname -m`/`node --version`/`git --version`/`npm --version`（docker 可选） | 实际值写入 alignment evidence；上次实测 Darwin/arm64/Node v24.18.0/Git 2.55.0/npm 11.16.0 |
| 2 start | `./harness start --workflow source/workflows/workflow-template.json --intent "补齐计划缺失项：testing.md 性能结构审查、git.md 删旧路径、简报三问恢复文章版、plan.md 落盘" --json` | `<new-work-id>`，`work/requirements/<new-work-id>/` |
| 3 alignment | spec.md（简报三问按文章版 + 验收标准 + 环境对齐）；alignment-result.json（outcome `ready`，三条件 passed 带 evidenceRefs，skill `alignment.harness-guide` succeeded）→ `./harness signal --revision <n> --file alignment-result.json` | **停 Gate 1**（human），`decide --action approve` 放行 |
| 4 implementation | 四处修改 + implementation-notes.md（记录：三问恢复理由 = 冗余论证/缺口论证；偏差：无）+ quick-evidence.md（实跑 harness check + check-distribution 输出）→ signal | auto 转 acceptance |
| 5 acceptance | 验证矩阵（下节）→ verification-report.json + handoff.md + acceptance-result.json | 见验证矩阵 |
| 6 check-result | `./harness check-result --workflow work/requirements/<new-work-id>/workflow.json --stage acceptance --file …/acceptance-result.json --require-complete --json` | `completionEligible: true` |
| 7 提交 | 5 个提交（见第 4 节），全部入 `94ace48..HEAD` | — |
| 8 决定性复验 | c3/c4 **在全部提交后**运行（修正上轮"基线运行、留待 Gate 2 后复验"的残余风险表述） | 两者 exit 0 |
| 9 signal + Gate 2 | `./harness signal --revision <n> --file acceptance-result.json` → `decide --action approve` | completed；**Gate 未批准不声称完成** |

## 3. 验证矩阵（verification-report/v1 逐条记录命令与退出码）

| id | 命令 | 预期 |
| --- | --- | --- |
| c1 | `./harness check --json` | exit 0，`valid: true`，digest `sha256:3b24…7380` 不变 |
| c2 | `node scripts/check-distribution.mjs` | exit 0，`distribution: valid` |
| c3 | `node scripts/check-commit-messages.mjs 94ace48 HEAD` | `commit messages: valid (N)`，exit 0（提交后跑） |
| c4 | `node scripts/check-completion-evidence.mjs 94ace48 HEAD` | `completion evidence: valid (1)`，exit 0（提交后跑） |
| c5 | 内容抽检：grep 简报三问（文章版第 2/3 条）、`## 性能与结构审查`、`删除旧路径` 三个锚点 + `实现<SPEC>` 段落完整性 + `plan.md` 非空 | 全部命中 |
| c6 | `node --test test/runtime/*.test.mjs test/distribution/*.test.mjs` | skipped + reason（docs-only，零代码变更；沿用上轮判定，c1/c2 覆盖契约与分发） |
| cl1 | cleanup | 无临时资源产生，声明 none |

## 4. 提交序列（同一 `94ace48..HEAD` 区间，CI 一次性通过）

1. `feat: specs 简报三问恢复文章版范围界定`
2. `feat: testing 规则新增性能结构审查与并行迁移纪律`
3. `feat: git 规则明确并行实现验证后必须删除旧路径`
4. `docs: 第 2 轮工作项执行计划落盘 plan.md`（本文件）
5. `chore: wi-<new-work-id> 分发内容补强验收证据`（acceptance-result.json + verification-report.json + workflow.json + spec.md + implementation-notes.md + quick-evidence.md + handoff.md + 两阶段 stage result + acceptance-evidence.txt）

## 5. 验收标准

1. 三个 source 文件修改后：简报三问 = 文章版；testing.md 含性能结构审查节；git.md 含删旧路径规则；`实现<SPEC>` 段落未劈开。
2. `manifest.json`/`package.json`/`workflow-template.json` 零改动；digest 不变；`check-distribution` valid。
3. `harness check` valid；c1–c5 全 passed；c6 带 reason 跳过；cl1 无残留。
4. 5 个提交同区间，c3/c4 在提交后决定性运行并 exit 0。
5. 两次人工 Gate 均以 `decide --action approve` + 原话 reason 通过；无 override。

## 6. 风险

- 零代码风险（content-only，机制已在上轮实证）。
- 唯一判断风险：简报三问改回文章版不被接受 → Gate 1 reject，回 alignment 重冻结执行版三问，无其他损失。
- 无发布、推送、历史改写；回退 = revert 区间内 5 个提交。
