# AI Vibe Demo Kit CLI v0.4.0 修改计划

## Summary

- 外部身份统一为 `ai-vibe-demo-kit`，版本定为 `0.4.0`；Harness 保留为内部控制 Module 名称。
- npm Distribution CLI 负责安装生命周期；仓库内 `./harness` 继续负责 Workflow、Evidence 和 Gate。
- 使用唯一 Distribution Manifest、安装账本、共享 Repository Mutation Lock 和可恢复事务。
- 自动安装并验证内置 `ai-vibe-demo-kit` Skill；默认 Workflow 三个 Stage 使用不同 Skill Call 与 Artifact 契约。
- 仅支持全新安装，不接管无账本 Runtime，不迁移旧 npm `0.1.x` 项目。
- 保持零生产依赖；npm 发布由维护者人工执行。

## Public CLI Interface

```sh
npx --yes ai-vibe-demo-kit@0.4.0 init \
  [--target <path>] [--json]

npx --yes ai-vibe-demo-kit@<target-version> upgrade \
  [--target <path>] [--apply] [--json]

npx --yes ai-vibe-demo-kit@<version> doctor \
  [--target <path>] [--json]

npx --yes ai-vibe-demo-kit@<version> uninstall \
  [--target <path>] [--apply] [--json]

npx --yes ai-vibe-demo-kit@<created-by-version> recover \
  [--target <path>] --strategy <resume|rollback> [--apply] [--json]

npx --yes ai-vibe-demo-kit@<version> version [--json]
```

- `--target` 默认解析当前目录所属 Git 根。
- `init` 直接应用；同版本且账本、文件一致时幂等成功。
- `upgrade`、`uninstall`、`recover` 默认只生成计划，`--apply` 才写入。
- upgrade 使用的 npm 包版本就是目标版本，不增加 `--to`。
- npm 只暴露 `ai-vibe-demo-kit`，删除 `kit` 别名。
- `./harness` 保留 Runtime 命令并移除 `init`。

## Stable JSON Interface

所有 Distribution 命令输出同一 envelope：

```json
{
  "schemaVersion": 1,
  "command": "upgrade",
  "status": "planned",
  "target": "/absolute/git/root",
  "applied": false,
  "package": {
    "name": "ai-vibe-demo-kit",
    "version": "0.5.0",
    "installedVersion": "0.4.0"
  },
  "transaction": null,
  "changes": [
    {
      "action": "replace",
      "path": "harness",
      "kind": "managed",
      "before": {
        "type": "file",
        "sha256": "sha256:...",
        "mode": "0755"
      },
      "after": {
        "type": "file",
        "sha256": "sha256:...",
        "mode": "0755"
      },
      "reason": null
    }
  ],
  "readiness": null,
  "warnings": [],
  "errors": [],
  "nextActions": []
}
```

字段语义：

- `package.version`：当前被调用的 Distribution CLI/npm 包版本。
- `package.installedVersion`：目标仓库账本中的安装版本；未安装时为 `null`。
- `transaction.sourceVersion`：事务开始前的安装版本。
- `transaction.targetVersion`：事务计划完成后的版本。
- `version` 命令使用 `target: null`、`status: "ok"`、`applied: false`。

固定枚举：

- `status`：`ok`、`planned`、`applied`、`idempotent`、`manual-action-required`、`conflict`、`error`。
- `changes[].action`：`create`、`replace`、`remove`、`chmod`、`preserve`、`drop-ledger-entry`。
- `changes[].kind`：`managed`、`seed`。
- warning/error：`{ code, path, message, facts, repair }`；可空字段使用 `null`。

退出码：

| Status | Exit |
| --- | ---: |
| `ok`、`planned`、`applied`、`idempotent` | 0 |
| `manual-action-required` | 1 |
| `conflict`、`error` | 2 |

`manual-action-required` 可以同时为 `applied: true`，表示安全动作已经完成，同时保留了需要人工处理的 seed 或卸载残留。

## Repository Lock Invariants

1. Runtime Mutation 与 Lifecycle Apply 共用现有 `.git/harness/control.lock`。
2. 锁实现下沉为 `RepositoryGuard` Module；FileStore 和 Lifecycle Module 都调用 `withRepositoryMutation(root, callback)`，不创建第二把锁。
3. `init/upgrade/uninstall/recover --apply` 在持锁后重新读取控制状态、canonical 事务、账本和文件事实，并重新生成计划。
4. 除恢复既有 canonical 事务外，只要 `state.active !== null`，Lifecycle Apply 整体拒绝且工作树零写入。
5. canonical `.git/harness/maintenance/` 存在时：
   - Runtime Mutation 返回 `E_MAINTENANCE_PENDING`。
   - `status` 只报告事务和精确恢复命令。
   - Distribution CLI 只允许 doctor 和匹配版本的 recover。
6. 非 canonical 的 `maintenance.tmp-*` 和 `maintenance.gc-*` 不阻止 Runtime；只有下次 Lifecycle Apply 在持锁后可以清理它们。

## Transaction Schema and Version Binding

Canonical journal 固定包含：

```json
{
  "schemaVersion": 1,
  "transactionId": "uuid",
  "createdByPackageVersion": "0.5.0",
  "operation": "upgrade",
  "sourceVersion": "0.4.0",
  "targetVersion": "0.5.0",
  "distributionManifestDigest": "sha256:...",
  "phase": "applying",
  "cursor": 3,
  "actions": []
}
```

- uninstall 使用 `sourceVersion=<installed>`、`targetVersion=null`。
- init 使用 `sourceVersion=null`、`targetVersion=<package>`。
- `nextActions` 输出创建事务的精确恢复命令：

```sh
npx --yes ai-vibe-demo-kit@0.5.0 recover \
  --target "/absolute/git/root" --strategy resume --apply --json
```

- recover 要求当前 CLI 版本等于 `createdByPackageVersion`。
- 当前包的 Distribution Manifest Digest 必须等于 journal 中的 Digest。
- 版本不匹配返回 `E_RECOVERY_VERSION_MISMATCH`。
- schema 不兼容返回 `E_TRANSACTION_VERSION`。
- Manifest Digest 不匹配返回 `E_RECOVERY_MANIFEST_MISMATCH`。
- 上述错误均为 `status: conflict`、退出码 `2`、事务零修改。

## Atomic Transaction Publication and Cleanup

事务使用三个同级路径：

```text
.git/harness/
├── maintenance.tmp-<transaction-id>/
├── maintenance/
└── maintenance.gc-<transaction-id>/
```

### Prepare and Publish

1. 获取共享 Repository Mutation Lock。
2. 确认控制状态 idle、无 canonical maintenance、账本允许当前操作。
3. 清理安全且无 canonical journal 的遗留 `maintenance.tmp-*`、`maintenance.gc-*`。
4. 重新生成完整计划。
5. 在全新的 `maintenance.tmp-<uuid>/` 中写入：
   - 完整 `transaction.json`，初始 phase 为 `prepared`。
   - 所有 after staged 内容。
   - 所有 before backup 内容。
   - 文件 mode、before/after 摘要、目标账本和动作顺序。
6. 持久化所有文件及临时目录元数据。
7. 在目标工作树尚未发生任何修改时，将完整临时目录原子 rename 为 canonical `maintenance/`。
8. 持久化 `.git/harness` 父目录元数据。
9. canonical 发布完成后才允许开始修改目标文件。

崩溃语义：

- staging 期间终止：只留下 `maintenance.tmp-*`；Runtime 不阻塞，工作树未修改。
- atomic rename 前后终止：文件系统状态只能是完整 tmp 或完整 canonical，不存在半发布 journal。
- 下次 Lifecycle Apply 在持锁后清理无 canonical journal 的遗留 tmp；Runtime 不执行该清理。

### Apply and Commit

1. 从 canonical journal cursor 开始逐项执行原子写入、rename、chmod 或删除。
2. 每个动作完成后原子更新 cursor。
3. 安装账本作为最后一个工作树动作提交。
4. 验证所有目标文件、保留项和账本。
5. 原子更新 canonical journal 为 `phase=committed`。
6. 调用与 recover resume 相同的 committed-finalize 流程：
   - 再次验证最终文件和账本。
   - 将 canonical `maintenance/` 原子 rename 为 `maintenance.gc-<transaction-id>/`。
   - canonical 路径消失后 Runtime 才恢复 Mutation。
   - 删除 gc 目录；删除中断不影响 Runtime，下次 Lifecycle Apply 持锁清理。

### Recover Semantics

- `prepared/applying`：
  - `resume` 从 cursor 继续。
  - `rollback` 逆序恢复 before 内容、mode 和旧账本。
- `committed`：
  - 只允许 `resume`。
  - resume 重新验证最终文件和账本后执行 canonical-to-gc rename 与清理。
  - rollback 返回 `E_RECOVERY_COMMITTED`、`status: conflict`、退出码 `2`，不修改事务或工作树。
- resume/rollback 只接受目标处于 journal 声明的 before 或 after 状态。
- 第三种内容返回 `E_MAINTENANCE_CONFLICT`，不覆盖或删除该路径。

## Unique Distribution Manifest

`.harness/distribution-manifest.json` 是安装目标与 npm 内容的唯一人工维护事实源：

```json
{
  "schemaVersion": 1,
  "package": {
    "name": "ai-vibe-demo-kit",
    "version": "0.4.0",
    "minimumNodeVersion": "22"
  },
  "files": [
    {
      "sourcePath": ".harness/distribution-manifest.json",
      "targetPath": null,
      "kind": "package-only",
      "mode": "0644"
    },
    {
      "sourcePath": "harness",
      "targetPath": "harness",
      "kind": "managed",
      "mode": "0755"
    },
    {
      "sourcePath": "AGENTS_template.md",
      "targetPath": "AGENTS_template.md",
      "kind": "seed",
      "mode": "0644"
    },
    {
      "sourcePath": "bin/ai-vibe-demo-kit.mjs",
      "targetPath": null,
      "kind": "package-only",
      "mode": "0755"
    }
  ]
}
```

规则：

- Distribution Manifest 自身必须恰好登记一次，且为 `package-only`。
- `package.json`、README、LICENSE 等 npm 固有内容也显式登记为 `package-only`。
- 删除 Installer 内硬编码文件表。
- `package.json#files` 是 Manifest `sourcePath` 的确定性投影，由仓库脚本生成或校验。
- Pack 检查要求 tarball 中除 npm 自动生成元数据外，每个文件都映射到 Manifest。
- Manifest 禁止重复 target、路径逃逸、Symlink source、非法 kind/mode。
- 同一路径从 `managed` 改为 `seed` 或反向修改返回 `E_OWNERSHIP_CHANGE`。
- 治理资产只安装 `_template` 文件，不覆盖生效中的治理文件。

`check-distribution` 必须校验：

- Distribution Manifest 自身恰好登记一次。
- `package.json.name`、Distribution Manifest package name、Runtime Manifest name 一致。
- `package.json.version`、Distribution Manifest version、Runtime Manifest version 一致。
- `package.json#engines.node`、Distribution Manifest minimumNodeVersion、Runtime Manifest minimumNodeVersion 一致。
- `package.json#files` 与 Manifest 投影一致。
- tarball 与 Manifest 内容一致。

## Install Ledger

`.harness/install-lock.json`：

```json
{
  "schemaVersion": 1,
  "installationState": "installed",
  "package": {
    "name": "ai-vibe-demo-kit",
    "version": "0.4.0"
  },
  "createdDirectories": [
    ".agents/skills/ai-vibe-demo-kit"
  ],
  "files": [
    {
      "path": "AGENTS_template.md",
      "kind": "seed",
      "state": "installed",
      "source": {
        "version": "0.4.0",
        "sha256": "sha256:...",
        "mode": "0644"
      },
      "observed": {
        "type": "file",
        "sha256": "sha256:...",
        "mode": "0644"
      }
    }
  ]
}
```

- `installationState`：`installed` 或 `residual`。
- 文件 `state`：`installed`、`preserved`、`orphaned`。
- `observed.type`：`file`、`absent`、`symlink`、`other`。
- upgrade 只接受 `installationState=installed`。
- `createdDirectories` 只记录 Installer 实际创建的目录。

## Lifecycle Decision Rules

定义：

- `B`：当前普通文件内容和 mode 与 ledger source 一致。
- `M`：内容与 source 一致，仅 mode 不同。
- `O`：当前与 ledger observed 一致，但不同于 source。
- `T`：当前与 source、observed 都不同。
- `A`：路径不存在。
- `U`：Symlink、目录或其他非普通文件。
- 所有未登记路径和 `T/U` 状态都禁止覆盖或删除。

### Init

| Ledger | Actual target | Action | Next ledger | Status | Applied | Exit |
| --- | --- | --- | --- | --- | ---: | ---: |
| absent | 所有 Manifest target 均为 A | 创建文件和账本 | installed | applied | true | 0 |
| absent | 任一 Manifest target 已存在，包括内容相同 | 整体拒绝 | absent | conflict | false | 2 |
| same version、结构有效 | 所有 managed 为 B；所有 seed 为 installed/B | 不写入 | unchanged | idempotent | false | 0 |
| same version、结构有效 | 所有 managed 为 B；任一 seed 为 M/O/T/A/U 或 preserved/orphaned | 保留并报告 seed 漂移，工作树和账本零写入 | unchanged | manual-action-required | false | 1 |
| same version、结构有效 | 任一 managed 为 M/A/O/T/U 或非 installed | 整体拒绝，零写入 | unchanged | conflict | false | 2 |
| same version、账本结构非法 | 任意 | 整体拒绝，零写入 | unchanged | conflict | false | 2 |
| other version | 任意 | 拒绝并要求 upgrade | unchanged | conflict | false | 2 |
| residual | 任意 | 拒绝并要求完成 uninstall | residual | conflict | false | 2 |

### Upgrade

任一 managed conflict、新路径被未登记对象占用、账本非法或 kind 变化都会使整个 upgrade 零写入。

| Ledger kind/state | Actual | New Manifest | Action | Next state | Status | Exit |
| --- | --- | --- | --- | --- | --- | ---: |
| none | A | present | create | installed | applied | 0 |
| none | exists/U | present | block entire upgrade | none | conflict | 2 |
| managed/installed | B | present | replace or no-op | installed | applied/idempotent | 0 |
| managed/installed | M | present | chmod/replace | installed | applied | 0 |
| managed/installed | A | present | recreate | installed | applied | 0 |
| managed/installed | O/T/U | present | block entire upgrade | unchanged | conflict | 2 |
| managed/installed | B/A | absent | remove if present，drop ledger | dropped | applied | 0 |
| managed/installed | M/O/T/U | absent | block，禁止删除 | unchanged | conflict | 2 |
| managed/preserved-or-orphaned | any | any | reject invalid/residual state | unchanged | conflict | 2 |
| seed/installed | B | present | replace or no-op | installed | applied/idempotent | 0 |
| seed/installed | M/O/T/A/U | present | preserve | preserved | manual-action-required | 1 |
| seed/installed | B/A | absent | remove if present，drop ledger | dropped | applied | 0 |
| seed/installed | M/O/T/U | absent | preserve | orphaned | manual-action-required | 1 |
| seed/preserved-or-orphaned | A | absent | drop ledger | dropped | applied | 0 |
| seed/preserved-or-orphaned | exists/U | absent | preserve | orphaned | manual-action-required | 1 |
| seed/preserved-or-orphaned | any | present | preserve，不重新接管 | preserved | manual-action-required | 1 |

无 conflict 时，managed 更新可以与 seed preserve 同事务提交；此时 `applied: true`、退出码 `1`。

### Uninstall

uninstall 只依据账本授权删除；未登记内容始终保留。

| Ledger kind/state | Actual | Action | Next state | Status | Exit |
| --- | --- | --- | --- | --- | ---: |
| managed-or-seed/installed | B | remove | dropped | applied | 0 |
| managed-or-seed/installed | A | drop ledger | dropped | applied | 0 |
| managed-or-seed/installed | M/O/T/U | preserve | orphaned | manual-action-required | 1 |
| managed-or-seed/preserved-or-orphaned | A | drop ledger | dropped | applied | 0 |
| managed-or-seed/preserved-or-orphaned | exists/U | preserve | orphaned | manual-action-required | 1 |
| no ledger entry | any | untouched | none | unchanged | 0 |

完成规则：

- 无剩余账本项：删除 `install-lock.json`。
- 有 orphaned 项：保留缩减账本并设置 `installationState=residual`。
- residual 只允许 doctor、uninstall、recover。
- 只删除 `createdDirectories` 中由 Installer 创建、当前为空、非 Symlink 的目录，按最深路径优先。
- 预先存在、未登记、非空或不安全目录始终保留。
- `.git/harness`、历史、Evidence、生效治理文件、用户 Workflow 和用户代码始终保留。

## Doctor Truth Table

Readiness：

- `runtimeReady`：账本有效、managed 完整、Runtime 可加载、默认 Workflow 有效、Required Skill 有效。
- `governanceReady`：生效治理文件存在、环境 Manifest 结构通过、必需确认项没有 unknown。
- `completionEvidenceToolingReady`：`check-result`、Stage Result 模板和 verification-report 模板完整可用。

| Facts | Runtime | Governance | Tooling | Status | Exit |
| --- | ---: | ---: | ---: | --- | ---: |
| 全部健康 | true | true | true | ok | 0 |
| 治理缺失或未完成 | true | false | true | manual-action-required | 1 |
| 仅自然语言事实 unknown | true | false | true | manual-action-required | 1 |
| seed 漂移 | true | 按生效文件判断 | true | manual-action-required | 1 |
| managed 损坏或不安全 | false | any | any | conflict | 2 |
| Required Skill 无效 | false | any | any | conflict | 2 |
| Completion tooling 损坏 | 可为 true | any | false | conflict | 2 |
| 账本/Manifest/事务非法 | false | any | any | conflict | 2 |
| canonical 事务存在 | false | any | any | conflict | 2 |
| 只有遗留 tmp/gc | 正常计算 | 正常计算 | 正常计算 | 至少 warning，不阻止 Runtime | 按其他结果 |
| 无账本且无安装痕迹 | false | false | false | manual-action-required | 1 |
| 无账本但存在受管目标 | false | unknown | unknown | conflict | 2 |

Doctor goldens：

- `doctor-ok.json`
- `doctor-governance-incomplete.json`
- `doctor-runtime-conflict.json`
- `doctor-completion-tooling-conflict.json`

## Required Skill and Artifact Contract

### Skill Entity Validation

`validateWorkflow` 对 Catalog Skill 执行：

- `skillRef` 必须是安全仓库相对路径。
- Required Skill 必须存在、为普通文件、不经过 Symlink。
- `SKILL.md` frontmatter 只能包含 `name` 和 `description`。
- `name` 必须等于 Catalog ID；`description` 必须非空。
- Required Skill 失败产生结构错误；Optional Skill 缺失产生 warning。
- check/start 使用同一验证路径。

### Exact Artifact Rule

Workflow `skillCalls[]` 增加可选 `artifactIds`；Stage Result 继续使用 `skills[].artifactRefs`。

```text
set(skillCall.artifactIds)
  ⊆ set(skillReceipt.artifactRefs)
  ⊆ set(stageResult.artifacts[].id)
```

- `artifactIds` 必须在当前 Stage `requiredArtifacts[].id` 中声明。
- `artifactRefs` 不得重复。
- Required Skill succeeded 时必须满足集合关系。
- failed/skipped 必须提供 reason。

默认 Workflow：

| Stage | Call ID | artifactIds |
| --- | --- | --- |
| alignment | `alignment.harness-guide` | `spec` |
| implementation | `implementation.harness-guide` | `implementation-notes`, `quick-evidence` |
| acceptance | `acceptance.harness-guide` | `verification-report`, `handoff` |

## Bundled Skill and Validation

- 内置 Skill 位于 `.agents/skills/ai-vibe-demo-kit/`。
- Ignore 规则只放行该目录，继续忽略维护者本机其他 Skill、缓存和 Symlink。
- Skill 包含 `SKILL.md` 与 `agents/openai.yaml`，允许隐式触发。
- Skill 指导 Agent 执行环境探测、doctor、check/status、Stage Result、check-result 和 signal；无明确用户指令时禁止 Human Gate 决策。
- 默认 Catalog 只声明随包 Skill。

正式验收命令：

```sh
node scripts/validate-bundled-skill.mjs
node scripts/check-distribution.mjs
npm pack --dry-run --json
```

Skill Creator 只用于初始脚手架和作者辅助，不作为 CI 或发布 Gate 依赖。

独立 Agent 前向测试是辅助性人工观察：

- 不属于确定性 acceptance 或 release Gate。
- 可保存到 `work/requirements/<work-id>/forward-tests/`。
- 不能替代仓库 validator、CLI integration test 或 Stage Result contract。

## Source and Release Environment

- `package.json`：
  - `name: ai-vibe-demo-kit`
  - `version: 0.4.0`
  - `type: module`
  - 单一 bin
  - `engines.node >=22`
  - `packageManager: npm@11.16.0`
  - 零 dependencies
- `project.yml` 声明：
  - 安装后 Runtime 只要求 Node.js 22+ 和 Git。
  - source/CI/release 使用 npm 11.16.0。
  - canonical commands 包含 distribution check、Skill validation、test、pack、publish。
  - publish 需要人工批准和 npm Registry 网络。
- Node 22/24 执行 Runtime 测试；Node 24.18.0 + npm 11.16.0 执行 pack/release 检查。

## Test Plan

### Lifecycle Matrix

- 为每一行 init/upgrade/uninstall 决策建立 table-driven test。
- 覆盖同版本 init 的 managed 异常、seed 漂移和非法账本。
- 覆盖未登记同内容文件、modified managed、preserved seed、residual uninstall。
- 验证用户 Workflow、生效治理文件、Evidence 和 `.git/harness` 始终保留。
- 验证只删除记录且为空的 Installer-created directories。

### Transaction Windows

- 对每个 write、fsync、tmp-to-canonical rename、journal rename、目标 rename、chmod、remove、账本提交、canonical-to-gc rename 和 gc 删除点注入失败。
- staging 中强制终止：
  - 工作树零修改。
  - 无 canonical journal。
  - Runtime Mutation 正常。
  - 下次 Lifecycle Apply 清理 tmp。
- canonical prepared 后、中间动作、账本已提交但未 committed 强制终止，验证 resume/rollback。
- committed 后、cleanup 前强制终止：
  - Runtime Mutation 被阻止。
  - rollback 返回 `E_RECOVERY_COMMITTED`。
  - 匹配版本 resume 验证最终状态并清理。
- canonical-to-gc rename 后、gc 删除前强制终止：
  - Runtime 不阻止。
  - 下次 Lifecycle Apply 清理 gc。
- 测试 recover 版本、schema、Manifest Digest 不匹配和第三种文件状态。
- 恢复完成后确认 staged、backup、canonical journal、tmp/gc 和子进程清理。

### JSON, Doctor and Skill

- 为 `planned/applied/idempotent/manual-action-required/conflict/error/version` 保存 golden。
- 增加四个 doctor golden。
- 删除、Symlink、替换 Skill 或修改 frontmatter 后，check/start 必须失败。
- Optional Skill 缺失只产生 warning。
- 验证三个 Stage 的 Artifact 集合关系、重复 Ref 和越界 Ref。

### Package and Regression

- 验证 Manifest 自举项、版本一致性、Node 版本一致性、package files 投影和 tarball 内容。
- 从本地 `.tgz` 初始化临时 Git 仓库，验证 doctor、`./harness version/check/status`、upgrade plan 和 uninstall plan。
- Node 22/24 运行完整测试。
- verification report 记录故障注入点、退出码、临时目录、子进程和清理结果。

## Governance and Release

- 当前 revision 19 Work Item 绑定即将修改的默认 Workflow。实施前必须由人工终止，禁止直接制造 Workflow drift。
- 终止后创建并冻结本需求专用 Workflow，启动新 Work Item，再修改产品代码。
- 保存 alignment spec、环境探测、implementation notes、quick evidence、verification report 和 acceptance Stage Result，并通过 `check-result --require-complete`。
- 发布流程：完整验证 → `npm pack --dry-run` → 检查 tarball → 人工 `npm publish --access public` → `npm view ai-vibe-demo-kit@0.4.0` → 为同一提交创建 `v0.4.0` Tag。
- 实现只交付 publish-ready；npm 发布、Git Tag 和 push 需要独立人工授权。
- MCP、自动发布、旧 npm `0.1.x` 迁移、无账本接管和治理文件自动合并不在本次范围。
