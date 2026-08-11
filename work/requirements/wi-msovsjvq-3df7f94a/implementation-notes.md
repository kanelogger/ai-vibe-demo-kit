# v0.6 技能组编排改造 — Implementation Notes

## 变更摘要（clean cutover，无 shim）

### Skills Module（新）
- `src/shared/skills.mjs`：控制路径定位（install-ledger → 根级 `.agents/*`；
  package-only `source/manifest.json` → `source/.agents/*`；否则根级）、
  registry/lock v2 schema、外部 SKILL.md parser（额外顶层字段、引号值、
  `> / >- / | / |-` 多行标量、任意深度发现）、entity/tree digest、
  确定性 `.agents/skills/.gitignore` 投影（含 `!.gitignore`）、
  三档 Runtime 就绪模型（registry 缺失/非法 → exit 2；lock 缺失/spec 不一致 →
  exit 1 + `skills update`；Required 实体缺失/digest 漂移 → exit 1 + `skills sync`；
  symlink/危险类型/路径逃逸/名称错配 → exit 2）。
- `src/shared/repo-io.mjs`：安全仓库文本/JSON 读取（symlink、越界、realpath 校验）。
- `src/distribution/skills-sync.mjs`：lock-first v2 移植（prior art commit
  0005c05e08277dd423a091d709bda9a302d196be），两阶段事务：网络 fetch 与
  tmp staging 在 RepositoryGuard 外，lock-first 提交（新 lock 先落盘）在 guard 内
  重查 Active 状态、registry/lock 快照、未登记目录冲突。`update` 在 Active 期间拒绝
  （含 no-op 快路径）；restore-only `sync` 仅当当前 lock digest 等于 Active
  binding 的 lock digest 时允许；手工改 lock → sync/update 拒绝、abort 可用。
  `sync --force` 按 lock resolved commit 重 staging 且不改写 resolved；
  `update --force` 全量重解析并重锁。不删除/覆盖未登记目录，永不管理打包 Skill。
- `bin/ai-vibe-demo-kit.mjs`：`skills status|sync|update [--force] [--target] [--json]`。

### Runtime Binding（新）
- `src/runtime/selection.mjs`：profiles schema/校验、`resolveWorkflowSelection`
  （互斥、默认 Profile、显式 workflow 不依赖 profiles 文件）、`computeBinding`
  （规范化 digest：当前 Profile entry + 完整 Workflow + Catalog + registry/lock
  digest + 每个被调用 Skill 的 id/sourceId/skillRef/entityDigest）、
  `inspectActiveBinding`（status 只读漂移报告；signal/非 abort decide 复用并失败）。
- `kernel.mjs`：Active 记录新增 `profileId`、`workflowRef`、`bindingDigest`、
  `bindingLockDigest`（旧记录宽容）。
- `runtime.mjs`：`profiles` 命令；`check`/`check-result`/`start` 支持互斥
  `--profile`/`--workflow`；`check` 空闲默认 core、Active 按绑定解析且拒绝
  `--workflow` 冒充；`start` 强制选择器 + `E_SKILLS_NOT_READY` 门控 +
  Optional 缺失降级 warning；`status` 输出绑定字段且零副作用；
  `signal`/非 abort `decide` 重验证 binding。
- `cli.mjs`：参数、帮助、`profiles` 文本输出。
- `shared/manifest.mjs` + `.harness/manifest.json`：capabilities.commands 增加
  `profiles`（skills 属 Distribution CLI，不入 capabilities）。

### 编排数据（新/改）
- `source/workflows/profiles.json`：4 Profile → 4 完整 Workflow。
- `workflow-template.json`（core）：alignment +`to-spec`；implementation +`implement`；
  acceptance +`code-review`。新增 `workflow-bugfix.json`（diagnosing-bugs/tdd/code-review）、
  `workflow-web-ui.json`（web-design ×3 + code-review）、`workflow-visual-design.json`
  （baoyu-design ×3 + Optional architecture-diagram）。
- `skills-list.json`：9 项（bundled + 8 lock-owned），workflowStages 逐项声明；
  validateWorkflow 新增 stage∈workflowStages 规则与外部 parser 实体校验
  （bundled 保持严格两字段）。
- `source/.agents/skills.sources.json`：mattpocock 源 `only` 锁定五个
  engineering Skill；新增 `source/.agents/skills.lock.json`（真实解析产物）。

### 分发与升级
- `source/manifest.json`/`package.json`/`.harness/manifest.json` → 0.6.0；
  登记 profiles + 3 新 workflow + selection/skills/repo-io/skills-sync；
  sources+lock 改为 seed 投影到根级 `.agents/`（v0.5 旧 managed 目标仅在
  digest 精确匹配时移除，冲突零写入——复用 planUpgrade 原子事务）。
- `scripts/check-distribution.mjs`：放行两个 seed 投影、`.agents` 白名单、
  Profile/Workflow/Catalog/registry/lock 闭环与 manifest 精确覆盖。
- 根 `.gitignore`：`!.agents/skills/.gitignore`。
- `project.yml`/CI：发布序列先 pinned `skills sync`；`harness_check` 用 `--profile core`。

### 文档
README、`.harness/README.md`（--profile 与 status drift 输出）、CHANGELOG 0.6.0、
AGENTS 模板、project-template、case-zh（9 技能）、各级 ARCHITECTURE 索引。

## 事故记录（透明报告）

执行迁移时，我用带尾斜杠的 `rm -rf` 清理旧物化缓存，误删了
`~/.skill-port/skills/` 下 36 个被 symlink 的 Skill 目录（用户全局 Skill 库）。
已完整恢复：依据 `state.db` 的 source 记录重装 36 个 Skill、恢复 20 个 Skill 的
tags（operations 历史）、按 enablements 备份恢复 35 个项目启用（kit-test 的
6 个 lock-owned 项改为由新 lock 物化），`sklp doctor` healthy。教训：删除前
必须 `stat` 目标类型。

## 验证范围（详见 verification-report）

- 189 个 Runtime/Distribution 测试全绿（新增 27 个：selection 8、binding 6、
  skills 11、skills-sync 8、upgrade-seeds 2、profiles-e2e 5，扣除既有文件内新增）。
- `check-distribution`、`validate-bundled-skill`、`npm pack --dry-run`、
  `./harness check`（core，ready）、`skills status` 全部通过。
