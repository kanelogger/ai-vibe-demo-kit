# v0.6 技能组编排改造 — Specification (alignment)

## 目标

将默认 Workflow 从"所有 Stage 调用同一个打包 Skill"升级为可落地的
"Profile → 完整 Workflow → Stage Skill Calls"编排：

- Profile 引用完整 Workflow，不继承、不合并、不局部覆盖。
- 内置 `core`、`bugfix`、`web-ui`、`visual-design` 四个 Profile。
- Active Work Item 绑定 Profile entry、完整 Workflow、Catalog、registry、lock 与所需 Skill 实体的规范化 digest。
- 外部 Skill 经 lock-first `skills sync/update` 物化；`init` 保持离线。
- 版本提升至 0.6.0。

## 可观测验收标准（evidence 路径）

1. `./harness profiles --json` 列出 4 个 Profile，`defaultProfile` 为 `core`。
   Evidence: `./harness check --json` 的 `selection` 字段、`test/runtime/selection.test.mjs`。
2. `./harness check --json` 空闲默认解析 `core`；`--profile`/`--workflow` 互斥；
   `start` 必须显式选择器；Required Skill 未就绪返回 `E_SKILLS_NOT_READY`。
   Evidence: `test/runtime/skills.test.mjs`、`test/runtime/cli.test.mjs`。
3. `./harness status --json` 输出 `profileId`、`workflowRef`、`bindingDrift`、
   `bindingIssues` 且无副作用；漂移时仅 `abort` 可用。
   Evidence: `test/runtime/binding.test.mjs`。
4. `ai-vibe-demo-kit skills status|sync|update [--force]` 语义与安全边界固定；
   并发、Active 限制、lock-first 中断恢复正确。
   Evidence: `test/distribution/skills-sync.test.mjs`。
5. Catalog 恰为 9 项（1 bundled + 8 lock-owned），等于四个 Profile 引用 Skill 的并集；
   外部项同时存在于 registry 与 lock。
   Evidence: `scripts/check-distribution.mjs`、`test/runtime/selection.test.mjs`。
6. v0.5→v0.6 升级将 registry 与 lock seed 到根级 `.agents/`；用户修改/占用冲突零写入。
   Evidence: `test/distribution/upgrade-seeds.test.mjs`。
7. `.agents/skills/.gitignore` 确定生成并保持可提交；lock-owned Skill 被忽略。
   Evidence: `test/runtime/skills.test.mjs` 的 git check-ignore 断言。
8. 四个 Profile 分别完成 start → Stage Result 校验 → 状态推进 → acceptance
   无状态完成检查。
   Evidence: `test/runtime/profiles-e2e.test.mjs`。

## 风险

- 外部 Skill 上游内容变化：由 lock 固定 resolved commit 与 tree digest 消除；
  `update` 显式重锁。已分类。
- 旧 36 个未登记物化目录（symlink 缓存）：新 lock 不接管、不删除，git-ignored。
  升级路径由 `skills update` 的 unmanaged-conflict 保护。
- skill-port 全局库意外受损已修复（见 implementation-notes）。

## 环境事实（2026-08-12）

| Probe | 期望 | 实际 |
| --- | --- | --- |
| uname -s | macos/linux | Darwin 25.5.0 ✓ |
| uname -m | arm64/x86_64 | arm64 ✓ |
| node --version | >=22 | v24.18.0 ✓ |
| git --version | required | 2.55.0 ✓ |
| npm --version | 11.16.0 | 11.16.0 ✓ |
| docker --version | optional | 未运行（无需容器） |

环境与 `project.yml` 声明一致，`environment-confirmed: passed`。
