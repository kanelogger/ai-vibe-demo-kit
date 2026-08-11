# v0.6 阶段—技能组编排改造方案

## 目标与约束

将当前“所有 Stage 调用同一个打包 Skill”的默认 Workflow，升级为可落地的“Profile → 完整 Workflow → Stage Skill Calls”编排。

- Harness 只校验 Skill 声明、就绪状态和执行回执，不自动执行 Skill。
- Profile 引用完整 Workflow v2；不做继承、合并或局部覆盖。
- 首批内置 `core`、`bugfix`、`web-ui`、`visual-design` 四个 Profile。
- 外部 Skill 通过显式 `skills sync/update` 物化；`init` 保持离线。
- Required Skill 未就绪时禁止 `start`；Optional Skill 可缺失，但必须记录 skipped 原因。
- 版本提升至 `0.6.0`。

## 一、Profile、Workflow 与绑定契约

新增 [profiles.json](/Users/kanehua/project/kit-test/source/workflows/profiles.json)：

```json
{
  "schemaVersion": 1,
  "defaultProfile": "core",
  "profiles": [
    {
      "id": "core",
      "description": "...",
      "workflowRef": "source/workflows/workflow-template.json"
    }
  ]
}
```

规则：

- `id` 唯一，`defaultProfile` 必须存在，`workflowRef` 必须是仓库内安全相对路径。
- Profile 直接引用完整 Workflow；Runtime 不合并 `skillCalls`。
- 新增 `workflow-bugfix.json`、`workflow-web-ui.json`、`workflow-visual-design.json`。
- `skills-list.json` 必须等于四个 Profile 实际引用 Skill 的并集。
- 每个 Skill Call 的 Stage 必须包含于对应 Catalog 项的 `workflowStages`；声明但未实际使用的 Stage 不报错。
- 外部 Catalog 项必须同时存在于 registry 和 lock；打包的 `ai-vibe-demo-kit` 不进入 lock。

统一选择接口：

```text
resolveWorkflowSelection({ root, profileId, workflowRef })
```

Runtime CLI：

- 新增 `harness profiles [--json]`。
- `check`、`start`、`check-result` 支持互斥的 `--profile` 和 `--workflow`。
- 空闲状态下 `check` 未指定选择器时使用 `core`。
- `start` 必须显式传入 `--profile` 或 `--workflow`。
- `check-result` 保持无状态，两种选择器解析到同一 Workflow 时结果等价。
- Active Work Item 由 Profile 启动后，后续状态命令按已绑定 Profile 解析；不接受显式 `--workflow` 冒充等价绑定。
- `signal` 和除 abort 外的 `decide` 必须重新验证 Active binding；abort 在配置或 lock drift 时仍允许执行。

Active State 新增 `profileId`、`workflowRef`、`bindingDigest`。`bindingDigest` 规范化覆盖：

- 当前 Profile entry；
- 完整 Workflow；
- Catalog；
- registry 和 lock digest；
- 当前 Workflow 所需 Skill 的 ID、sourceId、skillRef 和实体 digest。

其他 Profile 的增删改不得影响当前任务；当前 Profile、Workflow、Catalog、依赖 lock 或实体变化必须触发 drift。

`harness status --json` 增加只读观测字段：

```json
{
  "profileId": "core",
  "workflowRef": "source/workflows/workflow-template.json",
  "bindingDrift": false,
  "bindingIssues": []
}
```

- 空闲时 `profileId`、`workflowRef` 为 `null`，`bindingDrift=false`。
- Active 时重新解析绑定；任一 digest、实体或控制文件无法验证时 `bindingDrift=true`。
- `bindingIssues` 使用稳定的错误码、message、facts 和 repair，明确 signal/decide 被拒原因。
- `status` 不修复、不物化、不更新状态文件。

## 二、Skills Module 与 Runtime 就绪模型

从提交 `0005c05e08277dd423a091d709bda9a302d196be` 移植 lock-first v2 作为 prior art，并按现有 Runtime、RepositoryGuard 和路径模型重新验证。

Distribution CLI 新增：

```text
ai-vibe-demo-kit skills status
ai-vibe-demo-kit skills sync [--force]
ai-vibe-demo-kit skills update [--force]
```

`--force` 固定语义：

- `sync --force`：按现有 lock 的 resolved commit 重新 staging，并重新物化全部 lock-owned Skill；不升级 track、不改写 resolved。
- `update --force`：重新解析全部 source，并重新生成 lock/物化，即使 resolved 和本地内容未变化。
- 两者均不得绕过 schema 校验、Active 限制、binding digest、Symlink/路径安全、未登记目录保护或独占锁。

控制文件定位统一为 `resolveSkillControlPaths(root)`：

1. 存在且有效的 `.harness/install-lock.json`：读取根级 `.agents/skills.sources.json` 和 `.agents/skills.lock.json`。
2. 无安装账本但存在 package-only `source/manifest.json`：读取 `source/.agents/*`。
3. 其他情况读取根级 `.agents/*`。
4. 路径一经选定，不因文件缺失而回退。

物化目录恒为根级 `.agents/skills/`。

Runtime 状态：

- registry 缺失或非法：`valid=false`，exit `2`。
- 非空 registry 缺 lock、source spec 与 lock 不一致：`valid=true, ready=false`，exit `1`，提示 `skills update`。
- lock 有效但 Required Skill 缺失或 digest drift：`valid=true, ready=false`，exit `1`，提示 `skills sync`。
- Symlink、危险文件类型、路径逃逸、名称错配或非法覆盖：`valid=false`，exit `2`。
- Required Skill 未就绪时 `start` 返回 `E_SKILLS_NOT_READY`。
- Optional Skill 缺失只产生 warning；Stage Result 必须记录 `skipped` 和原因。

外部 `SKILL.md` parser 支持：

- 额外顶层 frontmatter 字段；
- 引号值；
- `description: >`、`>-`、`|`、`|-` 多行标量；
- 任意深度发现目录；
- `name`、`description` 唯一且非空；
- `name` 必须等于 Catalog ID。

打包 Skill 继续执行严格两字段校验。发现阶段与 Runtime 复用同一个 parser，物化时不改写上游字节。

并发与恢复：

- 网络获取和临时 staging 在 RepositoryGuard 外完成。
- 提交前获取现有独占 RepositoryGuard，并在锁内重新检查 Active State、registry、prior lock 和目标冲突。
- `update` 在任何 Active Work Item 期间拒绝。
- restore-only `sync` 在 Active 期间仅当当前 lock digest 等于 Active binding 中的 lock digest 时允许。
- lock-first 提交中断产生的 drift 可由后续 `sync` 修复。
- 手工修改 lock 导致 Active binding 不匹配时，sync/update 均拒绝，但 abort 仍可用。
- 不删除或覆盖未登记目录；Skills Module 永不管理打包 Skill。

## 三、默认编排、Catalog 与分发

所有 Stage 保留 Required `ai-vibe-demo-kit` Call 及现有标准 artifacts；外部调用增加领域能力回执：

| Profile | Alignment | Implementation | Acceptance |
|---|---|---|---|
| core | `to-spec` → `spec` | `implement` → `implementation-notes`, `quick-evidence` | `code-review` → `verification-report` |
| bugfix | `diagnosing-bugs` → `spec` | `tdd` → `implementation-notes`, `quick-evidence` | `code-review` → `verification-report` |
| web-ui | `web-design` → `spec` | `web-design` → `implementation-notes`, `quick-evidence` | `web-design`、`code-review` → `verification-report` |
| visual-design | `baoyu-design` → `spec` | `baoyu-design`，Optional `architecture-diagram` → `quick-evidence` | `baoyu-design` → `verification-report` |

Catalog 共 9 项：

- 打包：`ai-vibe-demo-kit`
- 外部 lock-owned：`to-spec`、`diagnosing-bugs`、`implement`、`tdd`、`code-review`、`web-design`、`baoyu-design`、`architecture-diagram`

默认 lock 只覆盖上述 8 个外部 Skill。mattpocock source 使用 `only` 锁定五个 engineering Skill，并保留深度无关发现和 `exclude` 语义。

分发修改：

- [source manifest](/Users/kanehua/project/kit-test/source/manifest.json) 显式登记 `profiles.json` 和三个新 Workflow，ownership 为 `managed`。
- `source/.agents/skills.sources.json` 与新增的 `source/.agents/skills.lock.json` 分别 seed 到根级 `.agents/skills.sources.json`、`.agents/skills.lock.json`。
- v0.5 升级时，仅在旧 managed 目标与账本 digest 精确匹配时移除；用户修改、目标占用或 ownership 冲突必须零写入失败。
- 修改 [check-distribution.mjs](/Users/kanehua/project/kit-test/scripts/check-distribution.mjs)：放行两个 seed 投影、更新 `.agents` 白名单、校验 Profile/Workflow/Catalog/registry/lock 闭环及 manifest 精确覆盖。
- Skills Module 确定性生成 `.agents/skills/.gitignore`，忽略 lock-owned Skill、`.sources/`、`.staging/`，并包含 `!.gitignore`。
- 源码仓库根 `.gitignore` 增加 `!.agents/skills/.gitignore`；registry、lock 和生成的 `.gitignore` 均保持可提交。

## 四、版本、能力声明与文档

同步更新：

- `package.json`、`source/manifest.json`、`.harness/manifest.json` 至 `0.6.0`。
- `.harness/manifest.json#capabilities.commands` 只增加 `profiles`。
- [manifest.mjs](/Users/kanehua/project/kit-test/src/shared/manifest.mjs) 的 Runtime `COMMANDS` 同步增加 `profiles`。
- `skills` 属于 Distribution CLI，不进入 Harness Runtime capabilities；其命令入口由 `package.json#bin` 和 Distribution CLI 路由承担。
- `project.yml` 更新安装版本、发布探测、skill sources/lock/materialization 路径。
- 更新根 README、[.harness/README.md](/Users/kanehua/project/kit-test/.harness/README.md)、`.harness/CHANGELOG.md`、AGENTS 模板、架构索引和 Workflow 示例。
- `.harness/README.md` 的命令示例显式加入 `--profile` 和 `status` drift 输出。
- 使用 `rg` 检查仍有效的 `0.5.0`、旧路径和旧 38-Skill 描述；历史 CHANGELOG 版本记录不替换。

## 五、验证与完成标准

测试覆盖：

- Profile schema、默认选择、互斥参数、完整 Workflow 解析和跨 Profile Catalog 闭环。
- Active binding：无关 Profile 变化不漂移；当前选择及依赖变化必须漂移；abort 在 drift 时可用。
- `status` 在 idle、clean Active、Workflow/Catalog/lock/entity drift 和控制文件损坏时正确输出绑定字段、`bindingDrift` 与 `bindingIssues`，且保持无副作用。
- 8 个外部 Skill 的实际 ID、发现路径和 frontmatter fixture，特别覆盖第三字段与多行 description。
- `valid/ready`、三档退出码、Required/Optional 行为和根级/source lookup。
- `sync/update --force` 的固定语义及安全边界。
- update/start 两种竞争顺序、Active restore-only sync、lock-first 中断恢复。
- v0.5→v0.6 安装升级、seed 保留、冲突零写入、Source 树与 manifest 精确匹配。
- `git check-ignore` 验证 `.sources`、`.staging` 和物化 Skill 被忽略，registry、lock、`.agents/skills/.gitignore` 可提交。
- 离线单元与分发测试不得运行 `skills update`；CI/发布候选先执行 pinned `skills sync`，再运行 Harness 检查。
- 四个 Profile 分别完成 start、Stage Result 校验、状态推进和 acceptance 无状态完成检查。
- 最终运行完整 Runtime/Distribution 测试、`check-distribution.mjs`、`npm pack`、`./harness check --json` 和 acceptance verification report。

不执行发布、推送、打 tag 或 Human Gate 决策。
