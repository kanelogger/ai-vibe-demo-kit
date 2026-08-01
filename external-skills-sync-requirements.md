---
status: draft
feature: external-skills-sync-v2
spec-version: 1
updated: 2026-08-01
---

# 外部 Skills 可追溯同步 v2：需求规格

## 1. 结论

本功能采用 **Source Manifest + Lock + Materialize**：

- `.agents/skills.sources.json` 声明“希望跟踪什么”；
- `.agents/skills.lock.json` 锁定“本次实际解析到什么”；
- `.agents/skills/<name>/` 保存物化后的技能实体，并由生成的 `.gitignore` 排除，不进入 Git；
- `skills-sync.mjs` 提供锁定同步和显式更新两种模式；
- 同步核心与 CLI、Git、文件系统解耦，为后续 MCP adapter 提供可复用边界，本期不实现 MCP Server。

首批默认来源固定为：

1. `xiaopu-ai/web-design` 的单技能仓库；
2. `JimLiu/baoyu-design` 中的 `skills/baoyu-design`；
3. `mattpocock/skills` 的 `skills` 技能组，默认排除 `deprecated/` 与 `in-progress/`。

三个来源均跟踪 `main`。这里的“最新”精确定义为：**一次成功执行 `--update` 时，Git fetch 所观察到的目标分支 tip**。普通同步不得重新解析分支，也不得在 Agent 会话内静默热更新。

本文中的 **MUST / 必须**、**SHOULD / 应该**、**MAY / 可以**分别表示强制要求、默认要求和可选能力。

## 2. 用户请求

> “我想把以下技能添加进overlay的skills中,同时不想提交到github上,这样我在使用overlay的时候可以拉取到最新的技能。在这个项目中我该如何做呢?
> - https://github.com/xiaopu-ai/web-design 单个skill
> - https://github.com/JimLiu/baoyu-design
> - https://github.com/mattpocock/skills 技能组
> 注意:不要用 sklp 去管理,我这个方案不能依赖 sklp,要具有通用性。未来我有打算将 overlay 层封装成MCP,所以这个技术方案需要综合考虑,考虑未来的扩展性。 请给出三个方案以及对应的推荐度。输出到当前文件下的新文件。”

> “细化方案1.输出优秀的需求文档。”

## 3. Source Register

| 来源类型 | 位置 / 原话 | 用途 | 状态 |
|---|---|---|---|
| 用户请求 | 本文“用户请求”第一段原话 | 三个上游、不提交技能实体、不依赖 sklp、通用性、MCP 扩展约束 | 已确认 |
| 用户请求 | “细化方案1.输出优秀的需求文档。” | 方案选择与本次交付物 | 已确认 |
| 方案文档 | `overlay-skills-sync-options.md` 的“方案一” | Manifest、Lock、Materialize、CLI/MCP 分层决策 | 已核验 |
| 当前配置 | `overlay/.agents/skills.sources.json` | v1 清单字段、技能根目录、现有固定 ref 契约 | 已核验 |
| 当前实现 | `overlay/scripts/skills-sync.mjs` | Git 获取、递归发现、过滤、冲突保护、物化、剪枝、lock 与 gitignore 生成 | 已核验 |
| 当前检查 | `overlay/scripts/harness-check.mjs` 第 418–529 行 | manifest、lock、磁盘和 gitignore 的本地一致性检查 | 已核验 |
| 当前测试 | `tests/skills-sync.test.mjs`、`tests/harness-check.test.mjs` | 单技能、技能组、过滤、幂等、冲突、剪枝、稳定诊断 ID | 已核验 |
| 接入文档 | `README.md` 第 15–55 行、`overlay/HARNESS.md` 第 49–72 行 | Overlay 复制模型、同步时机、路由职责 | 已核验 |
| 运行约束 | `package.json` | Node.js `^20.19.0 || >=22.13.0`、无第三方运行时依赖 | 已核验 |
| 上游仓库 | [web-design](https://github.com/xiaopu-ai/web-design)、[baoyu-design](https://github.com/JimLiu/baoyu-design)、[mattpocock/skills](https://github.com/mattpocock/skills) | 默认来源路径、技能布局和许可证事实 | 2026-08-01 已核验 |
| 外部规范 | [MCP Architecture](https://modelcontextprotocol.io/docs/learn/architecture) | Resources、Tools、动态发现、本地 stdio 与远程 Streamable HTTP 边界 | 2026-08-01 已核验 |

## 4. 背景与问题

当前同步器已覆盖主要机制，但“更新意图”和“已安装事实”仍混在 `ref` 中：

- 文档要求 `ref` 是 tag 或完整 SHA，以保证可复现；
- 实现可以 fetch `main`，但这是未声明的偶然行为；
- 浮动 branch 每次解析不同，固定 SHA 则无法表达“主动更新到最新”；
- 当前复用判断只检查 `SKILL.md` 是否存在，不验证整个技能目录的内容漂移；
- 当前同步流程会在所有来源校验完成前删除并覆盖目标目录，后续来源失败时可能留下部分更新；
- 单技能仓库的技能根目录可能等于 checkout 根目录，直接复制工作树会把 `.git` 等非 Git tree 内容带入技能目录；
- 当前 lock 以技能为扁平条目重复来源字段，不利于表达“一个来源解析出多个技能”的来源级事务和未来 MCP catalog；
- 远程 MCP Server 无权假定自己能写客户端磁盘，文件型 Agent 又仍依赖 `.agents/skills/<name>/SKILL.md`，因此获取、目录物化和协议适配必须分层。

本功能要消除这些歧义，并保持 Overlay 的核心分发方式不变：提交控制面，复制普通目录，在目标项目中运行 Node CLI 物化外部 Skills。

## 5. 目标与成功指标

### 5.1 目标

| ID | 目标 | 成功指标 |
|---|---|---|
| OBJ-001 | 使用 Overlay 时可显式拉取三个上游的最新版本 | `--update` 将每个 `main` 解析为完整 SHA，并物化所有通过过滤的技能 |
| OBJ-002 | 外部技能实体不提交到 Git | 每个受管技能目录都被生成的 `.gitignore` 精确命中；`git status` 不出现技能内容 |
| OBJ-003 | 任意已锁版本可复现 | 普通同步只使用 lock 中的 SHA；相同输入得到相同技能名、文件字节和 tree digest |
| OBJ-004 | 更新失败不破坏当前可用状态 | 任一来源获取、发现、校验或落盘失败后，受管目录、lock 和 gitignore 与执行前一致 |
| OBJ-005 | Overlay 自带 Skills 永不被同步器误删或覆盖 | 三个内置 Skill 在成功、失败、更新和剪枝场景中均保持不变 |
| OBJ-006 | 同步机制与技能管理器、托管厂商解耦 | 不依赖 sklp、`npx skills` 或 GitHub API；HTTPS、SSH、本地 Git 来源走同一 Git adapter |
| OBJ-007 | 为 MCP 封装保留稳定核心 | 核心返回结构化结果与错误，不调用 `process.exit`、不写终端、不依赖 MCP transport |

### 5.2 发布成功门槛

以下条件必须全部满足：

1. 三个真实上游均可完成一次独立 smoke sync；
2. 所有 P0 需求均有自动化测试或可执行 smoke 证据；
3. 故障原子性、非受管目录保护、重复技能名、内容漂移和 branch rewind 均有回归测试；
4. `node scripts/harness-check.mjs context` 能只读验证 manifest、lock、磁盘摘要和忽略规则；
5. 幂等执行不访问网络、不改写文件、不改变文件 mtime；
6. 外部 Skills 中不存在 `.git`、事务 staging、backup 或凭据残留。

## 6. 非目标

本期明确不做：

- 不实现 MCP Server、MCP transport、鉴权或远程多租户存储；
- 不实现用户级共享 Git cache；该能力可作为后续 Git adapter 优化；
- 不支持 `latest-semver-tag`、版本范围或自动 release 选择；本期只支持 `branch`、精确 `tag` 和精确 `commit`；
- 不自动执行 Skill 内脚本，不安装 npm/pip/Playwright 等依赖；
- 不在运行中的 Agent 会话内热加载或懒加载 Skill；
- 不自动改写 `.agents/skills.json` 路由索引；路由 alias 继续人工策划；
- 不支持压缩包、HTTP 目录、npm 包等非 Git 来源；
- 不自动判断上游内容是否“可信”，不替代人工审查 lock diff；
- 不同步 Git submodule；选中 tree 中出现 submodule 时必须失败；
- 不把外部技能内容、Git 对象库或下载缓存提交到 Overlay 仓库。

## 7. 角色与核心场景

### 7.1 角色

| 角色 | 责任 | 核心诉求 |
|---|---|---|
| Overlay 维护者 | 维护来源清单、审查更新、提交 lock 与忽略规则 | 更新可审计、失败可回退、无需手工复制技能 |
| Overlay 使用者 | 把 Overlay 复制进目标项目并物化 Skills | 一条明确命令获得锁定版或最新版本 |
| CI / 审查者 | 验证仓库控制面与磁盘状态 | 无网络的本地检查、稳定诊断 ID、确定性结果 |
| 未来 MCP adapter | 把 catalog 和动作映射到 Resources / Tools | 复用核心，不解析 CLI 文本，不假设远程服务可写客户端磁盘 |

### 7.2 核心用户故事

- US-001：作为 Overlay 维护者，我可以声明 branch 跟踪策略，并在主动更新时看到旧 SHA、新 SHA、技能增删和内容变化。
- US-002：作为 Overlay 使用者，我可以在复制 Overlay 后执行普通同步，严格恢复 lock 指定的版本。
- US-003：作为希望使用最新技能的个人用户，我可以在新会话前执行 `--update`，获取该时刻上游 `main` 的最新 tip。
- US-004：作为审查者，我可以只提交 manifest、lock、生成的 gitignore 和必要路由，不提交外部技能实体。
- US-005：作为维护者，当一个来源失败或出现冲突时，我现有的全部受管 Skills 保持可用且字节不变。
- US-006：作为 CI，我可以在不访问网络、不修改文件的前提下发现缺失、漂移、过期 lock 和忽略规则缺项。
- US-007：作为未来 MCP adapter，我可以直接调用结构化 core API，并分别把元数据映射为 Resources、把更新动作映射为 Tools。

## 8. 领域模型与不变量

### 8.1 术语

| 术语 | 定义 |
|---|---|
| Source Manifest | 已提交的期望状态；描述来源身份、Git 地址、技能根路径、跟踪策略和过滤条件 |
| Source ID | manifest 内稳定且唯一的来源身份；repo/path 改变时仍用于识别一次有意迁移 |
| Track | 更新策略；本期为 branch、精确 tag 或精确 commit |
| Resolved Commit | 一次解析后得到的 40 位小写 Git commit SHA |
| Lock | 已提交的解析结果；按来源记录 resolved commit、技能列表、摘要和许可证来源 |
| Managed Skill | 出现在 lock 中、由同步器拥有其生命周期的外部技能目录 |
| Built-in / Unmanaged Skill | 不在 lock 中的现有技能；同步器不得覆盖、移动或删除 |
| Materialize | 从 lock 指定的 Git tree 生成本地技能目录 |
| Sync | 不重新解析 Track，只恢复并验证 lock 指定状态 |
| Update | 联网上游重新解析 Track，形成并原子应用新的 lock 与物化状态 |
| Drift | 本地 Managed Skill 的文件集合、字节或可执行位与 lock 摘要不一致 |
| Transaction | 一次命令涉及的全部来源、受管目录、provenance、lock 与 gitignore 变更集合 |

### 8.2 强制不变量

1. Manifest 表达意图，lock 表达事实；lock 中不得保存浮动 ref 作为 `resolved`。
2. 每个 source ID 唯一；每个最终 Skill name 在所有外部来源和现有非受管目录中唯一。
3. Managed Skill 与 lock 一一对应；不存在“已管理但未锁定”或“已锁定但未物化”的成功状态。
4. 物化内容只能来自目标 commit 的 Git tree；不得包含 `.git`、checkout 临时文件或未跟踪文件。
5. lock 中的 tree digest 必须与物化目录一致。
6. 同步器只能删除 prior lock 明确拥有的路径。
7. 更新事务必须全成或全不成；不得对用户暴露跨来源的部分成功状态。
8. 相同 manifest、lock 和 Git tree 必须产生字节级一致的物化结果和确定性 lock 排序。
9. 生成的 `.gitignore` 只能忽略受管目录和同步器保留的 provenance/transaction 目录，不能使用覆盖整个 `skillsRoot` 的通配规则。
10. 获取和物化过程不得执行上游代码、安装依赖或提示输入凭据。

## 9. 系统边界与状态模型

### 9.1 模块边界

```text
CLI adapter（本期）                 MCP adapter（未来）
        │                                  │
        └──────── structured API ──────────┘
                           │
                    skills-sync core
      ┌──────────────┬───────────────┬──────────────┐
      │ Manifest/Lock│ Resolver      │ Transaction  │
      │ parser       │ + Discovery   │ planner      │
      └──────────────┴───────────────┴──────────────┘
              │              │               │
        Git adapter      Hash adapter   Filesystem adapter
```

Core 不得依赖 `process.argv`、stdout/stderr、当前工作目录、MCP SDK 或具体 Git 托管平台。adapter 必须显式传入 project root、执行选项和 I/O 能力。

### 9.2 本地状态

| 状态 | 判定 | 允许动作 |
|---|---|---|
| UNCONFIGURED | manifest 不存在，或 `sources` 为空且无 v2 lock | sync/check 成功 no-op；内置 Skills 不变 |
| NEEDS_UPDATE | manifest 有来源，但 lock 缺失或 source spec 与 lock 不一致 | 仅 `--update` 可建立新期望状态；普通 sync 失败 |
| NEEDS_SYNC | manifest 与 lock 一致，但 Managed Skill 缺失或 drift | 普通 sync 按 resolved SHA 修复；`--update` 也可修复 |
| READY | manifest、lock、磁盘摘要、provenance 和 gitignore 一致 | 普通 sync 输出 KEPT，零网络、零写入 |
| UPDATE_IN_PROGRESS | 新状态已完成 staging 和验证，但尚未提交 | 对外仍应看到旧 READY 状态；异常后回滚或下次恢复 |
| BROKEN_TRANSACTION | 存在未完成事务日志 | 任何新动作前必须先恢复；恢复失败则停止且不继续更新 |

网络上的“有新版本”不是持久本地状态。只有执行 `--update` 时才解析 branch；解析结果要么完整提交为新 READY 状态，要么丢弃。

## 10. 默认来源与 manifest 契约

### 10.1 必须提交的默认 manifest

```json
{
  "version": 2,
  "description": "External Skill sources: track declares update intent; .agents/skills.lock.json records resolved commits; materialized Skill directories are ignored.",
  "skillsRoot": ".agents/skills",
  "sources": [
    {
      "id": "web-design",
      "repo": "https://github.com/xiaopu-ai/web-design.git",
      "path": ".",
      "track": { "kind": "branch", "value": "main" }
    },
    {
      "id": "baoyu-design",
      "repo": "https://github.com/JimLiu/baoyu-design.git",
      "path": "skills/baoyu-design",
      "track": { "kind": "branch", "value": "main" }
    },
    {
      "id": "mattpocock-skills",
      "repo": "https://github.com/mattpocock/skills.git",
      "path": "skills",
      "track": { "kind": "branch", "value": "main" },
      "exclude": ["deprecated/", "in-progress/"]
    }
  ]
}
```

### 10.2 字段规则

| 字段 | 要求 |
|---|---|
| `version` | 必须等于 `2`；v1 采用同版本 clean cutover，不在 core 中保留双语义兼容分支 |
| `description` | 可选非空字符串；仅供人类阅读，不参与来源选择 |
| `skillsRoot` | 可选，默认 `.agents/skills`；必须是 project root 内的规范化相对路径，不得为空、绝对化或包含 `..` |
| `sources` | 必须是数组；允许空数组；source ID 不得重复 |
| `id` | 必填，匹配 `[A-Za-z0-9][A-Za-z0-9._-]*`，作为稳定来源身份 |
| `repo` | 必填非空 Git remote 或本地 Git 路径；不得拼接到 shell 字符串执行 |
| `path` | 必填、相对 repository root；`.` 合法；绝对路径、空路径和 `..` 非法 |
| `track.kind` | 本期只允许 `branch`、`tag`、`commit` |
| `track.value` | branch/tag 为非空 Git ref 名；commit 必须是 40 位小写十六进制 SHA |
| `only` | 可选、非空唯一字符串数组；存在时先做包含过滤 |
| `exclude` | 可选、非空唯一字符串数组；在 `only` 后执行并拥有最终否决权 |

未知字段必须作为配置错误失败，避免拼写错误被静默忽略。schema 升级必须通过新的顶层 `version` 完成。

### 10.3 过滤语义

- 不以 `/` 结尾的 pattern 匹配 Skill frontmatter `name` 或技能相对目录 basename；
- 以 `/` 结尾的 pattern 匹配相对 `source.path` 的目录前缀；
- `only` 缺省表示全部候选；
- `exclude` 始终最后执行；
- 过滤后为零个 Skill 必须失败，不能生成空来源 lock；
- 匹配使用大小写敏感、POSIX `/` 分隔的规范化路径，在所有操作系统上语义一致。

## 11. 功能需求

### 11.1 Manifest 读取与校验

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| SRC-001 | P0 | 系统必须读取并严格校验 v2 manifest，错误必须包含字段路径和修复建议 | 用户请求；当前 manifest |
| SRC-002 | P0 | 默认 manifest 必须包含第 10.1 节三个来源及过滤策略 | 用户请求；上游布局 |
| SRC-003 | P0 | `skillsRoot` 与 source `path` 必须在规范化后验证边界，禁止路径逃逸 | 安全不变量 |
| SRC-004 | P0 | source `id` 必须作为来源级稳定主键；重复 ID 必须失败 | MCP/catalog 扩展；事务边界 |
| SRC-005 | P0 | source spec 的 canonical equality 必须覆盖 repo、path、track、only、exclude；任一变化都使 lock 进入 NEEDS_UPDATE | Manifest/Lock 分层 |
| SRC-006 | P0 | v1 manifest/lock 必须以稳定错误 `skills-sync.manifest-version-unsupported` 拒绝，并给出迁移到 v2 的准确说明 | clean cutover 决策 |
| SRC-007 | P0 | sources 为空时不得读取或修改内置 Skill；仅清理 prior v2 lock 明确管理的外部内容 | 当前剪枝行为；内置 Skill 边界 |
| SRC-008 | P0 | HTTP(S) repo URL 不得内嵌用户名、密码或 token；凭据必须由 Git credential helper、SSH agent 或进程外环境提供 | 控制面可提交；凭据安全 |

### 11.2 Git 解析与 Update

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| RES-001 | P0 | `--update` 必须解析 manifest 中全部 Track；解析完成前不得修改现有状态 | 原子性目标 |
| RES-002 | P0 | branch 必须解析为该次 fetch 观察到的 tip，tag/commit 必须解析并验证为 commit object | “拉取最新”；可复现性 |
| RES-003 | P0 | 每个 resolved 值必须是 40 位小写 SHA；缩写 SHA、branch 名或 tag 名不得写入 resolved | Manifest/Lock 不变量 |
| RES-004 | P0 | 所有 Git 调用必须使用参数数组执行，设置非交互模式，并有有限超时；不得通过 shell 拼接 repo/ref | 当前实现；安全要求 |
| RES-005 | P0 | resolver 必须使用标准 Git transport，不调用 GitHub API；HTTPS、SSH、本地 repo 使用同一接口 | 通用性要求 |
| RES-006 | P0 | branch 从 prior resolved 非快进移动时，默认失败并报告 `skills-sync.source-rewind`；只有显式 `--allow-rewind` 才可接受 | force-push 风险 |
| RES-007 | P0 | fetch、认证、ref、path、超时失败必须标识 source ID，且不得泄露 URL 中凭据或环境变量 | 可运维性；安全要求 |
| RES-008 | P0 | resolved 未变化且本地为 READY 时，`--update` 必须保持 lock、目录和 mtime 不变 | 幂等目标 |
| RES-009 | P0 | Update 必须报告每个来源的旧/新 SHA、快进/重写状态、技能增删和内容摘要变化 | 人工审查要求 |
| RES-010 | P0 | 获取过程中不得运行 hooks、Skill 脚本、包管理器或上游生成命令 | 不执行不可信代码 |

### 11.3 Skill 发现、选择与安全校验

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| DSC-001 | P0 | 系统必须从 source `path` 递归发现含 `SKILL.md` 的目录；发现后不再下钻该目录 | 当前发现语义 |
| DSC-002 | P0 | 每个被选 Skill 的 `SKILL.md` 必须包含可解析的 frontmatter `name`；不得回退到目录名 | 稳定身份要求 |
| DSC-003 | P0 | Skill name 必须匹配 `[A-Za-z0-9._-]+`，否则整次事务失败 | 当前安全规则 |
| DSC-004 | P0 | 所有来源产生的最终 Skill name 必须全局唯一；冲突错误必须列出两个 source ID 与 source path | 当前冲突保护 |
| DSC-005 | P0 | 目标目录已存在但不属于 prior lock 时必须失败，不得覆盖、合并或自动改名 | 用户数据保护 |
| DSC-006 | P0 | 物化输入必须来自 Git tree，不得包含 checkout 的 `.git`、未跟踪文件或临时文件 | 当前单技能根复制缺口 |
| DSC-007 | P0 | 选中 tree 包含符号链接或 Git submodule 时必须以 `skills-sync.skill-tree-unsafe` 失败 | 路径逃逸与不可复现风险 |
| DSC-008 | P0 | 除明确排除的非 tree 元数据外，Skill 根下所有受 Git 跟踪的文件、子目录、原始字节和可执行位必须完整保留 | baoyu 脚本与资源完整性 |
| DSC-009 | P0 | `only` / `exclude` 必须按第 10.3 节执行；过滤结果为空必须失败 | 当前过滤契约 |
| DSC-010 | P0 | 来源根不存在、没有发现 Skill 或 frontmatter 非法时，现有可用状态必须保持不变 | 失败原子性 |

### 11.4 Lock 与内容摘要

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| LCK-001 | P0 | lock 必须为 version 2，并按 source 分组记录 source spec、resolved、license files 和 skills | 来源级事务；未来 catalog |
| LCK-002 | P0 | 每个 skill 必须记录 `name`、相对 `sourcePath` 和 `treeDigest` | 漂移检查与物化 |
| LCK-003 | P0 | tree digest 必须使用 SHA-256，对排序后的 POSIX 相对路径、文件类型/可执行位、长度和原始字节做无歧义编码 | 跨平台确定性 |
| LCK-004 | P0 | lock 必须按 source ID、Skill name、license path 排序；相同解析结果不得因运行时间或机器不同产生 diff | 可审查与幂等性 |
| LCK-005 | P0 | lock 不得写入生成时间、临时路径、用户目录、凭据或平台特有绝对路径 | 确定性与保密性 |
| LCK-006 | P0 | lock 只能在完整 Update 事务提交点被替换；普通 sync 不得改变 source spec 或 resolved | Manifest/Lock 分层 |
| LCK-007 | P0 | manifest 与 lock source spec 不一致时，普通 sync 必须失败并要求运行 `--update`，不得隐式升级或剪枝 | 明确命令语义 |
| LCK-008 | P0 | 缺少仓库级许可证时必须记录空列表并输出 warning；存在 `LICENSE*` 时必须记录路径和 SHA-256，不得推断未声明的 SPDX ID | 上游许可证传播 |
| LCK-009 | P0 | manifest 含来源但 lock 缺失时，普通 sync 必须以 `skills-sync.lock-missing` 失败且零修改；只有 `--update` 可以创建首个 lock | sync/update 命令边界 |

#### v2 lock 必需字段

| 层级 | 必需字段 |
|---|---|
| 根 | `version: 2`、`skillsRoot`、`sources[]` |
| `sources[]` | `id`、`repo`、`path`、`track`、规范化后的 `only` / `exclude`（存在时）、`resolved`、`licenseFiles[]`、`skills[]` |
| `licenseFiles[]` | repository-relative `path`、`sha256`、物化后的 `localPath` |
| `skills[]` | `name`、相对 source.path 的 `sourcePath`、`treeDigest` |

### 11.5 Materialize、Sync 与事务

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| MAT-001 | P0 | 普通 sync 必须只使用 lock 中的 resolved SHA，不解析 branch/tag 的当前值 | 可复现性 |
| MAT-002 | P0 | READY 状态下普通 sync 必须零网络、零写入并输出 KEPT | 当前幂等契约 |
| MAT-003 | P0 | Managed Skill 缺失或 drift 时，普通 sync 必须按 resolved SHA 修复；仅在本地没有该 Git tree 时访问来源 | 恢复能力 |
| MAT-004 | P0 | `--force` 必须强制从同一 resolved SHA 重新 staging 和物化，但不得升级 Track | 当前 CLI 能力；诊断恢复 |
| MAT-005 | P0 | 所有新增、替换、剪枝、provenance、lock 和 gitignore 必须属于同一事务 | 全局原子性 |
| MAT-006 | P0 | 事务必须先在与目标相同文件系统完成 staging、摘要校验和冲突预检，再开始提交 | rename/回滚可靠性 |
| MAT-007 | P0 | 任何可处理失败必须自动回滚至执行前状态；进程异常退出后，下次运行必须先根据事务日志恢复 | 故障原子性 |
| MAT-008 | P0 | commit 后必须重新计算物化目录摘要；不匹配时回滚并报 `skills-sync.materialize-verify-failed` | 端到端完整性 |
| MAT-009 | P0 | 只允许剪枝 prior lock 管理、且新 lock 不再引用的目录；不得基于目录扫描猜测所有权 | 内置/手工 Skill 保护 |
| MAT-010 | P0 | 每个来源的仓库级许可证必须复制到 `skillsRoot/.sources/<source-id>/licenses/`；该目录不得包含 `SKILL.md` | 许可证保留；不干扰发现 |
| MAT-011 | P0 | 成功或失败后不得残留 staging、backup、事务日志或临时 checkout；无法清理时必须给出稳定诊断 | 工作区卫生 |
| MAT-012 | P0 | source 删除或过滤变化只能通过 `--update` 形成新 lock 并剪枝；普通 sync 遇到差异必须停止 | 显式期望状态变更 |

### 11.6 Git 忽略与路由

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| IGN-001 | P0 | 同步器必须生成 `skillsRoot/.gitignore`，包含受管 Skill 的根锚定规则 `/<name>/` | “不提交到 GitHub” |
| IGN-002 | P0 | `.gitignore` 必须额外忽略 `/.sources/` 与事务保留目录，但不得使用 `/*`、`**` 等吞掉内置 Skill 的规则 | 内置 Skill 边界 |
| IGN-003 | P0 | 生成内容必须有脚本所有权 header、确定性排序和末尾换行 | 当前契约；幂等性 |
| IGN-004 | P0 | sources 为空时只能删除具有脚本 header 的生成文件；用户自有 `.gitignore` 不得删除 | 用户数据保护 |
| IGN-005 | P0 | 更新不得自动增加、删除或重排 `.agents/skills.json` alias | 路由与来源职责分离 |
| IGN-006 | P0 | 文档必须明确根仓库 `/.agents/` 不会忽略 `overlay/.agents/`，检查必须针对实际 skillsRoot | 当前仓库路径事实 |

### 11.7 CLI 契约

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| CLI-001 | P0 | 默认命令为锁定 sync：`node scripts/skills-sync.mjs [--root <dir>] [--force]` | 安全默认 |
| CLI-002 | P0 | 显式更新命令为 `node scripts/skills-sync.mjs --update [--root <dir>] [--force] [--allow-rewind]` | “拉取最新”；rewind 控制 |
| CLI-003 | P0 | 默认 root 为脚本父目录；所有路径解析必须基于显式 root，而非调用者 cwd | Overlay 复制模型；MCP 复用 |
| CLI-004 | P0 | `--help` 必须列出模式、网络行为、lock 行为、退出码和新会话要求 | 可操作性 |
| CLI-005 | P0 | 成功事件必须保留 `KEPT`、`SYNCED`、`PRUNED` 和最终 `OK`；Update 另输出来源级 `UPDATED` 或 `UNCHANGED` | 当前可观察输出；审查 |
| CLI-006 | P0 | 错误输出必须以稳定 `skills-sync.<id>` 标识；人类信息包含 source/skill、原因和单一修复动作 | 可诊断性 |
| CLI-007 | P0 | 退出码 `0` 表示目标状态已达到；`1` 表示运行时/来源/冲突/校验失败；`2` 表示 usage、manifest、lock 或内部契约错误 | 当前退出码基础 |
| CLI-008 | P0 | CLI 不得交互式询问；认证缺失必须快速失败，由用户在 CLI 外配置 Git 凭据 | 自动化与安全 |
| CLI-009 | P0 | 成功 Update 后必须提示“在新 Agent 会话中加载更新后的 Skills”，但不得自行重启会话 | 会话加载约束 |

#### 稳定错误 ID 最小集合

- `skills-sync.manifest-invalid`
- `skills-sync.manifest-version-unsupported`
- `skills-sync.lock-missing`
- `skills-sync.lock-invalid`
- `skills-sync.lock-stale`
- `skills-sync.source-fetch-failed`
- `skills-sync.source-rewind`
- `skills-sync.source-path-missing`
- `skills-sync.skill-none-selected`
- `skills-sync.skill-frontmatter-invalid`
- `skills-sync.skill-name-invalid`
- `skills-sync.skill-name-conflict`
- `skills-sync.skill-unmanaged-conflict`
- `skills-sync.skill-tree-unsafe`
- `skills-sync.materialize-verify-failed`
- `skills-sync.transaction-recovery-failed`

### 11.8 Harness 一致性检查

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| CHK-001 | P0 | `harness-check context` 必须只读且不访问 Git/网络 | 当前检查器定位 |
| CHK-002 | P0 | 检查必须覆盖 v2 schema、source spec 一致性、完整 SHA、重复名称、缺失目录、tree digest、provenance 和 gitignore | 新不变量 |
| CHK-003 | P0 | 每个 ERROR 必须有稳定 ID 和一条可执行 REPAIR；不得用 warning 降级会破坏可复现性的错误 | 当前测试契约 |
| CHK-004 | P0 | READY 状态必须通过；NEEDS_UPDATE、NEEDS_SYNC、BROKEN_TRANSACTION 必须失败并准确分类 | 状态模型 |
| CHK-005 | P0 | 检查不得因为外部来源暂时离线而失败；它只判断本地控制面和数据面 | 离线 CI |
| CHK-006 | P0 | `harness-check all` 必须继续包含 context 的全部 Skill 检查 | 当前唯一检查入口 |

### 11.9 Overlay 接入

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| OVL-001 | P0 | Overlay 仓库必须提交 v2 manifest、v2 lock、同步脚本和生成的 gitignore，不提交 Managed Skill 与 `.sources` 内容 | 用户请求；复制模型 |
| OVL-002 | P0 | clean clone 后执行普通 sync 必须恢复 committed lock；执行 `--update` 必须改为该时刻最新 branch tip | 两种用户意图 |
| OVL-003 | P0 | `README.md` 与 `HARNESS.md` 必须在复制步骤后分别说明锁定 sync 与主动 update，不得再把二者混为一个命令 | 当前文档缺口 |
| OVL-004 | P0 | 同步必须在新 Agent 会话前完成；文档不得承诺会话内懒加载 | 当前加载契约 |
| OVL-005 | P0 | `cp -R overlay/. <target>/` 前后都必须支持：已物化目录被复制时幂等校验，未物化时按 lock/update 获取 | 本地工作副本与 clean clone 差异 |

### 11.10 MCP 就绪约束

| ID | 优先级 | 需求 | 证据 |
|---|---|---|---|
| MCP-001 | P0 | parser、resolver、discovery、plan、materialize、verify 必须是协议无关 core；不得在 core 中调用 `process.exit` 或直接输出文本 | 用户的 MCP 规划 |
| MCP-002 | P0 | core 必须返回结构化 plan/result/diagnostic，并使用稳定错误 code；CLI 仅负责参数与文本呈现 | MCP Tool 不能解析 CLI 文本 |
| MCP-003 | P0 | Git、filesystem、hash、clock 如被使用都必须位于 adapter 边界；project root 必须显式传入 | 测试性；远程边界 |
| MCP-004 | P0 | catalog 必须可完全由 v2 lock 构建，不依赖扫描任意用户目录或 CLI 进程状态 | MCP 动态发现 |
| MCP-005 | P0 | 未来 Resources 对应 source/lock/Skill 内容，Tools 对应 check updates/update/materialize/verify；本期 core 不绑定这些方法名 | MCP 官方 Resources/Tools 边界 |
| MCP-006 | P0 | filesystem materializer 必须保留为独立 adapter；远程 MCP 不得假定可直接写客户端 `.agents/skills` | stdio 与 Streamable HTTP 差异 |
| MCP-007 | P1 | 后续 MCP adapter 可以从 lock 动态列出能力并发布 list-changed 通知；通知只能作为刷新提示，不能替代客户端重新读取 catalog | MCP 动态 list/通知语义 |

## 12. 非功能需求

| ID | 类别 | 优先级 | 需求 |
|---|---|---|---|
| NFR-001 | 正确性 | P0 | 所有状态转换必须满足第 8.2 节不变量；任何“不确定是否成功”的结果按失败处理 |
| NFR-002 | 确定性 | P0 | 相同 manifest、lock、Git commit 与平台无关地生成相同 lock 排序和 tree digest |
| NFR-003 | 原子性 | P0 | 单次命令以全部来源为事务范围；受控失败零部分更新，异常中断可在下次运行恢复 |
| NFR-004 | 安全 | P0 | 不执行上游代码、不跟随 symlink、不初始化 submodule、不记录凭据、不使用 shell 拼接 |
| NFR-005 | 可移植性 | P0 | 支持项目声明的 Node.js 版本以及 macOS/Linux；Windows 路径必须规范化为相同过滤和摘要语义 |
| NFR-006 | 依赖 | P0 | 运行时只依赖 Node.js 标准库和系统 Git；不得依赖 sklp、skills CLI 或 GitHub API |
| NFR-007 | 性能 | P0 | READY 普通 sync 不启动 Git 子进程；每个远程 Git 操作有默认 120 秒上限；文件处理不得把整个仓库一次性载入内存 |
| NFR-008 | 可观测性 | P0 | 每个来源输出可关联 source ID 的阶段结果；错误保留根因但脱敏凭据 |
| NFR-009 | 可维护性 | P0 | manifest/lock schema、core、CLI adapter、harness check 共享同一字段与摘要定义，禁止复制出第二套解析规则 |
| NFR-010 | 可测试性 | P0 | Git 和 filesystem 边界可用本地临时仓库与故障注入测试；默认测试套件不依赖公网 |
| NFR-011 | 兼容性 | P0 | v2 采用一次 clean cutover：仓库内 manifest、lock、fixture、文档和调用方必须在同一变更中迁移，不保留旧字段 alias |
| NFR-012 | 可恢复性 | P0 | 删除本地 Managed Skill 后可从 committed lock 重建；上游 branch 已前移也不得改变恢复出的旧版本 |

## 13. 验收场景

每条验收必须通过真实 CLI 行为验证；仅检查函数被调用或文本存在不算验收。

### AC-001：默认来源首次 Update

**Given** v2 manifest 含三个默认来源，尚无 lock 和 Managed Skill  
**When** 执行 `node overlay/scripts/skills-sync.mjs --root overlay --update`  
**Then**：

- 生成 v2 lock；
- `web-design` 被发现为单 Skill；
- `baoyu-design` 的整个技能目录完整，包括 `agents/gen-pptx` 等子目录；
- mattpocock 技能组被递归发现，`deprecated/` 与 `in-progress/` 不进入 lock；
- 每个 resolved 都是完整 SHA，每个 Skill 都有 tree digest；
- 所有受管目录与 `.sources` 都被 gitignore 命中；
- 退出码为 0，并提示新开 Agent 会话。

覆盖：OBJ-001、SRC-002、RES-001、DSC-001、DSC-008、LCK-001、IGN-001。

### AC-002：clean clone 的锁定恢复

**Given** clean clone 只有已提交的 manifest、lock、gitignore 和脚本，没有外部技能实体  
**When** 执行普通 sync  
**Then** 从 lock 的 resolved SHA 恢复完全一致的目录；不得解析 `main` 当前 tip；上游 branch 前移不影响结果。

覆盖：OBJ-003、MAT-001、NFR-012、OVL-002。

### AC-003：READY 幂等与离线执行

**Given** 本地为 READY，并阻断 Git/网络调用  
**When** 连续执行两次普通 sync  
**Then** 两次均返回 0，仅输出 KEPT/OK，不启动 Git 子进程，不改写任何文件或 mtime。

覆盖：MAT-002、NFR-002、NFR-007。

### AC-004：主动更新 branch

**Given** prior lock 指向 commit A，上游 `main` 快进到 commit B  
**When** 执行 `--update`  
**Then** 输出 A→B、fast-forward、技能增删与摘要变化；原子提交 B；再次执行 update 为 UNCHANGED 且无文件 diff。

覆盖：RES-002、RES-008、RES-009。

### AC-005：拒绝 branch rewind

**Given** prior resolved 为 A，上游 branch 被重写到非 A 后代 B  
**When** 不带 `--allow-rewind` 执行 update  
**Then** 以 `skills-sync.source-rewind` 和退出码 1 失败，所有本地状态保持 A；带显式参数后才允许更新到 B。

覆盖：RES-006、MAT-005。

### AC-006：跨来源失败原子性

**Given** 来源一可成功更新，来源二的 path 不存在，当前状态为 READY  
**When** 执行 update  
**Then** 返回失败；来源一、来源二、lock、gitignore、provenance 的字节和 mtime 都与执行前一致。

覆盖：OBJ-004、RES-001、MAT-005、MAT-007。

### AC-007：异常中断恢复

**Given** 故障注入使进程在第一个目录提交后异常终止  
**When** 再次运行任一同步命令  
**Then** 先识别事务日志并恢复到旧 READY 状态，再开始新命令；无法恢复时以 `skills-sync.transaction-recovery-failed` 停止，不继续 fetch 或覆盖。

覆盖：MAT-007、CHK-004、NFR-003。

### AC-008：拒绝覆盖手工 Skill

**Given** 目标 Skill name 已存在，但 prior lock 不拥有该目录  
**When** update 发现同名外部 Skill  
**Then** 以 `skills-sync.skill-unmanaged-conflict` 失败，手工目录逐字节保持不变。

覆盖：DSC-005、MAT-009。

### AC-009：来源间重名

**Given** 两个来源通过过滤后都产生 `same-name`  
**When** sync 或 update 预检  
**Then** 整次事务失败，错误列出两个 source ID 与相对路径，不物化任何新内容。

覆盖：DSC-004、MAT-006。

### AC-010：过滤优先级

**Given** `only` 同时选中两个技能，`exclude` 又排除其中一个  
**When** update  
**Then** lock 和磁盘只包含未被 exclude 的技能；过滤后为零时整次事务失败。

覆盖：SRC-002、DSC-009。

### AC-011：内容漂移修复

**Given** lock/manifest 一致，但用户修改、删除或增加了 Managed Skill 文件  
**When** harness-check context 后执行普通 sync  
**Then** check 先报告稳定 drift ID；sync 按相同 resolved 修复；修复后 digest 一致且不升级 branch。

覆盖：LCK-002、MAT-003、CHK-002。

### AC-012：Manifest 变更必须显式 Update

**Given** 用户新增来源、删除来源、改变 track 或过滤条件，lock 仍是旧值  
**When** 执行普通 sync  
**Then** 以 `skills-sync.lock-stale` 失败且不做修改；执行 update 后才生成新 lock 并安全剪枝旧 Managed Skill。

覆盖：SRC-005、LCK-007、MAT-012。

### AC-013：不复制 checkout 元数据

**Given** 单技能仓库在 repository root 含 `SKILL.md`  
**When** 物化该 Skill  
**Then** Skill 目录只包含 Git tree 的受跟踪内容，不含 `.git`、临时 checkout 或未跟踪文件。

覆盖：DSC-006。

### AC-014：拒绝不安全 tree

**Given** 选中 Skill tree 含 symlink 或 submodule  
**When** sync/update 预检  
**Then** 以 `skills-sync.skill-tree-unsafe` 失败，目标状态不变。

覆盖：DSC-007、NFR-004。

### AC-015：许可证保留

**Given** 仓库根存在 `LICENSE`，但 Skill 位于子目录  
**When** 物化  
**Then** license 原文出现在 `.agents/skills/.sources/<id>/licenses/`，lock 记录源路径、本地路径和 SHA-256；该目录被忽略且不被发现为 Skill。

覆盖：LCK-008、MAT-010、IGN-002。

### AC-016：内置 Skills 保护

**Given** Overlay 含 `source-register`、`verification-closeout`、`memory-writeback`  
**When** 执行首次 update、重复 sync、来源删除、过滤变化和失败回滚  
**Then** 三个目录及内容始终不变，生成的 gitignore 不忽略它们。

覆盖：OBJ-005、SRC-007、IGN-002。

### AC-017：控制面可提交、数据面不入库

**Given** 完成一次真实 update  
**When** 检查 Git 状态和 `git check-ignore`  
**Then** manifest、lock、gitignore 可以审查；任何 Managed Skill 文件和 `.sources` 文件都被忽略，根 `/.agents/` 规则不是本验收依据。

覆盖：OBJ-002、IGN-001、IGN-006、OVL-001。

### AC-018：Harness 纯本地检查

**Given** 分别构造 READY、lock 缺失、lock stale、目录缺失、digest drift、gitignore 缺项和中断事务  
**When** 在无网络环境执行 `harness-check context`  
**Then** READY 返回 0；其他状态返回 1，并为每个错误输出稳定 ID 与唯一 REPAIR。

覆盖：CHK-001 至 CHK-006。

### AC-019：v1 clean cutover

**Given** 输入仍使用 v1 manifest 或 lock  
**When** 执行 sync/update/check  
**Then** 不尝试猜测旧 `ref` 语义；输出 `manifest-version-unsupported` 或对应 context ID，并指向一次性 v2 迁移步骤。

覆盖：SRC-006、NFR-011。

### AC-020：CLI 与 Core 分离

**Given** 测试直接调用 core，并注入本地 Git/filesystem adapter  
**When** 执行 resolve、plan、materialize、verify  
**Then** 返回结构化对象和稳定 code，不读取 argv/cwd、不写 stdout/stderr、不终止进程；CLI adapter 将同一结果呈现为规定文本。

覆盖：OBJ-007、MCP-001 至 MCP-004。

### AC-021：缺少 lock 时不隐式解析上游

**Given** v2 manifest 含至少一个来源，但 lock 不存在  
**When** 先执行普通 sync，再执行 `--update`  
**Then** 普通 sync 以 `skills-sync.lock-missing` 和退出码 2 失败且不访问 Git；`--update` 才解析 Track、创建首个 lock 并物化。

覆盖：LCK-009、CLI-001、CLI-002。

### AC-022：拒绝内嵌凭据

**Given** HTTP(S) repo URL 的 authority 中包含用户名、密码或 token  
**When** 解析 manifest  
**Then** 在启动 Git 前以 `skills-sync.manifest-invalid` 拒绝，错误输出不回显秘密；合法的 SSH `user@host` 身份不受影响。

覆盖：SRC-008、RES-007、CLI-008。

## 14. 测试与验证要求

### 14.1 自动化测试

必须扩展现有测试而不是建立第二套测试风格：

- `tests/skills-sync.test.mjs`
  - v2 manifest 与 lock schema；
  - branch A→B 快进、非快进拒绝与 override；
  - locked sync 不受 branch 前移影响；
  - READY 零 Git、零写入；
  - 完整 tree digest 与 drift 修复；
  - 单技能仓库不复制 `.git`；
  - symlink/submodule 拒绝；
  - 来源级/技能级冲突；
  - 多来源失败零部分更新；
  - 事务中断恢复；
  - provenance/license；
  - clean cutover 和稳定错误 ID。
  - 缺少 lock 的 sync/update 分流与内嵌凭据拒绝；
- `tests/harness-check.test.mjs`
  - READY v2 状态；
  - manifest/lock mismatch；
  - 非完整 resolved SHA；
  - digest drift；
  - provenance/gitignore 缺失；
  - 中断事务；
  - 每个 ERROR 对应一个 REPAIR。
- `tests/overlay-copy.test.mjs`
  - clean Overlay 只复制控制面；
  - 已存在被忽略的本地物化目录时不改变 Overlay 的受管文件契约。

默认 `npm test` 必须只使用本地临时 Git 仓库，不访问公网。

### 14.2 真实上游 smoke

真实上游验证必须是独立、显式运行的 smoke，不进入默认测试套件：

```sh
node overlay/scripts/skills-sync.mjs --root overlay --update
node overlay/scripts/harness-check.mjs context --root overlay
git check-ignore overlay/.agents/skills/web-design/SKILL.md
git check-ignore overlay/.agents/skills/baoyu-design/SKILL.md
```

还必须从 v2 lock 随机抽查至少一个 mattpocock Skill，并确认：

- `deprecated/` 与 `in-progress/` 没有产出；
- `baoyu-design/agents/gen-pptx` 等资源存在；
- 任一物化 Skill 下不存在 `.git`；
- 重新运行普通 sync 为 READY 幂等路径。

## 15. 迁移要求

v2 采用 clean cutover，实施变更必须一次更新以下调用方，不留 `ref` alias 或双 lock 解析器：

1. `overlay/.agents/skills.sources.json`：升级为第 10.1 节 v2 默认来源；
2. `overlay/scripts/skills-sync.mjs`：拆分 protocol-free core 与 CLI adapter，实现 sync/update 语义；
3. `overlay/scripts/harness-check.mjs`：读取 v2 lock 和 digest；
4. `tests/skills-sync.test.mjs`、`tests/harness-check.test.mjs` 及 fixtures：全部迁移到 v2；
5. `README.md`、`overlay/HARNESS.md`、manifest description：明确 sync/update 与会话时机；
6. 首次成功 update：生成并审查 v2 lock、gitignore；外部技能实体保持 ignored；
7. `.agents/skills.json`：仅在确有稳定路由需求时人工添加 alias，不由迁移脚本自动改写。

对于已经复制旧 Overlay 的项目，迁移说明必须要求先保存工作区，然后替换控制面文件并执行一次 `--update`；系统不得尝试把旧扁平 lock 静默升级为新 lock。

## 16. 风险与既定处置

| 风险 | 概率 | 影响 | 既定处置 |
|---|---:|---:|---|
| `main` 引入破坏性 Skill 内容 | 35%/年 | 高 | update 显式执行、lock diff 可审查、普通 sync 不升级、可回退旧 SHA |
| branch force-push | 10%/年 | 中高 | 默认拒绝非快进，显式 `--allow-rewind` |
| 技能组新增名称与内置/手工 Skill 冲突 | 20%/年 | 中 | 全局预检，整次事务失败，不自动改名 |
| 网络或认证在多来源中途失败 | 20%/次（不稳定网络） | 中 | 所有来源先 staging，事务提交前零目标修改 |
| 进程在提交阶段崩溃 | <1%/次 | 高 | 同文件系统 staging、事务日志、下次运行先恢复 |
| 上游 Skill 依赖未安装工具 | 40%/新增 Skill | 中 | 同步只保证文件完整，不安装或运行依赖；使用时由 Skill 自身说明 |
| 许可证文件位于 Skill 根外 | 80%/技能组 | 中 | per-source provenance 复制并锁定摘要 |
| 远程 MCP 与客户端无共享文件系统 | 100%（该部署形态） | 高 | filesystem adapter 独立；远程 MCP 返回 Resource/artifact，由客户端物化 |

概率为基于当前结构的工程风险估计，不是历史统计数据。

## 17. 需求追踪矩阵

| 用户约束 | 需求覆盖 | 验收覆盖 |
|---|---|---|
| 添加三个指定来源 | SRC-002、DSC-001、DSC-008 | AC-001、AC-010 |
| 外部技能不提交到 GitHub | IGN-001 至 IGN-004、OVL-001 | AC-015、AC-017 |
| 使用 Overlay 时可拉最新 | RES-001 至 RES-003、CLI-002、OVL-002 | AC-001、AC-004 |
| 不依赖 sklp | RES-005、NFR-006 | AC-001、AC-020 |
| 通用、非 GitHub 专用 | RES-004、RES-005、MCP-003 | AC-020；本地 Git fixture tests |
| 可复现与可回退 | LCK-001 至 LCK-007、MAT-001 至 MAT-008 | AC-002 至 AC-007、AC-011 |
| 未来封装为 MCP | MCP-001 至 MCP-007 | AC-020 |
| 不伤害 Overlay 内置 Skills | SRC-007、DSC-005、MAT-009、IGN-002 | AC-008、AC-016 |

## 18. Definition of Done

本功能只有在以下条件全部满足后才可标记完成：

- 第 11、12 节所有 P0 需求已实现；
- AC-001 至 AC-022 均有通过证据；
- 默认测试套件完整通过，无跳过、无公网依赖；
- 三个真实上游 smoke 成功，lock 中 resolved 和 digest 可核验；
- `harness-check context` 与 `harness-check all` 均通过；
- `git status` 未出现任何外部技能实体、provenance 或事务文件；
- README、HARNESS、manifest 描述与实际 CLI 行为一致；
- v1 字段和旧扁平 lock 调用方已全部迁移，不留兼容分支、别名或废弃代码；
- 变更经过一次从 committed lock 恢复和一次显式 update 的端到端演练；
- 更新后开启新 Agent 会话，确认文件型 Agent 能发现物化 Skills。
