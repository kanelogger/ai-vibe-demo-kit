---
status: proposed
optionIds: [standalone-guard, unified-guard, audited-guard]
---
# 目录上下文门禁方案选项

## Source Register

| 来源 | 用途 |
| --- | --- |
| `workflow/requirements.md` | 已确认的问题、边界、需求与验收标准 |
| `SPECS/architecture.md` | Node ESM、零第三方依赖、模块和持久契约事实 |
| `scripts/harness/lib/context.mjs` | 复用项目根与生效配置解析 |
| `scripts/harness/lib/errors.mjs` | 复用稳定错误码和退出码契约 |
| `scripts/harness/lib/quick.mjs` | 复用原始字节摘要与漂移判断先例 |
| `.agents/hooks/README.md` | Hook Adapter 不复制领域门禁逻辑 |
| `scripts/harness/test/helpers.mjs` | 隔离临时 Git 仓库和 CLI 驱动测试先例 |
| 用户确认 | `.harness-index.json`、祖先累加、精确文件追加、显式 codeRoots、首次阻断重试、单一 guard Interface |

## 统一语言

- **Code Root**：项目配置显式登记、必须受目录上下文门禁管理的仓库相对目录。
- **Directory Index**：与代码共置的 `.harness-index.json`，是模块摘要与文件前置关系的唯一事实源。
- **Context Closure**：目标文件经祖先索引、精确文件追加和传递前置递归展开后的有序、去重文件集合。
- **Context Receipt**：证明某个会话已经收到某个目标当前 Context Closure 的短期私有摘要记录，不证明模型理解。
- **Context Guard**：写入前唯一 Interface；根据目标、会话、当前索引和回执返回 `unmanaged`、`blocked` 或 `allowed`。
- **Hook Adapter**：把平台写入事件规范化为 Context Guard 输入，不拥有索引或放行规则。

## 共同模块设计

所有方案都保持一个外部 Interface：Context Guard 接收目标文件和会话标识并返回决策、稳定错误或上下文包。索引发现、schema 校验、路径规范化、传递闭包、循环检测、原始字节摘要和回执判断封装在同一 Module 内；CLI、检查器和 Hook Adapter 只调用它。测试优先覆盖 Context Guard 和 CLI 的可观察结果，不绑定内部遍历函数。

## 方案：standalone-guard（独立门禁）

- 目标：以最少现有控制面改动交付完整硬门禁。
- 边界：新增独立 Context Guard Module、独立上下文 CLI 和 Hook Adapter；现有统一 `harness` CLI 只保持原状，检查器调用新模块的静态校验入口。
- 收益：改动面最小；不依赖 v2 stateRef 迁移；可在旧项目接入后立即使用。
- 代价：用户需要记住统一 Harness CLI 之外的第二个命令入口；CLI 用法和错误渲染存在重复 Adapter。
- 风险：长期容易形成“工作流命令”和“上下文命令”两套发现路径，削弱 Harness 控制面的统一性。
- 验证：独立 CLI 首次阻断/重试场景、检查器静态错误、前置漂移和现有完整测试套件。

## 方案：unified-guard（统一门禁，推荐）

- 目标：把目录上下文作为现有 Harness 控制面的原生能力，同时保持运行时与 Slice 状态解耦。
- 边界：新增深 Context Guard Module；统一 `harness context guard` 命令作为 CLI Adapter；Hook Adapter 调用同一命令/模块；检查器复用同一索引校验。回执保存在 Git 私有运行目录，不写工作树或 stateRef。
- 收益：一个命令入口、一个错误契约、一个配置解析路径；未迁移 v2 或没有 active Slice 时仍可工作；后续可由 Write Scope 调用而不反向耦合。
- 代价：需要修改统一 CLI 分发、帮助文本、错误表和检查器；变更横跨多个既有模块。
- 风险：若 Module Interface 不够深，CLI、Hook 和检查器可能泄漏遍历细节；通过只公开 guard 与静态 validate 两种用例控制。
- 验证：Context Guard 行为测试、统一 CLI 端到端测试、Hook Adapter 真实两次调用、检查器 fixture、现有 Slice/Quick/路由全套回归。

## 方案：audited-guard（状态审计门禁）

- 目标：除硬门禁外，把每次上下文交付与放行写入 v2 stateRef 审计账本，并绑定 active Slice revision 与 Write Scope。
- 边界：在 unified-guard 基础上要求项目已迁移 v2、存在 active Work Item/Slice，并增加 Context Receipt 事务和 Slice 写范围校验。
- 收益：上下文交付、Slice、写范围和审计事件形成完整可追溯链；适合强合规项目。
- 代价：任何文件写入都依赖 v2 生命周期和 Git ref 事务；接入、延迟、并发冲突及恢复复杂度最高。
- 风险：把目录导航能力耦合到尚未完整交付的 Slice 生命周期；当前仓库 `stateRef` 尚未迁移，无法满足“具体项目接入即可使用”。
- 验证：除 unified-guard 全部验证外，增加 stateRef CAS、active Slice/Write Scope、审计一致性、无 active Work Item 和迁移失败场景。

## 比较结论

| 维度 | standalone-guard | unified-guard | audited-guard |
| --- | --- | --- | --- |
| 满足已确认需求 | 是 | 是 | 是，但附加 v2 前置 |
| 控制面一致性 | 低 | 高 | 高 |
| 未迁移项目可用 | 是 | 是 | 否 |
| 审计深度 | 会话私有回执 | 会话私有回执 | stateRef 事件级审计 |
| 实现与回归风险 | 低 | 中 | 高 |
| 后续演进 | 容易形成第二 CLI | 可平滑接入 Slice | 已与 Slice 强耦合 |

推荐 `unified-guard`：它满足硬门禁且不把基础代码导航能力绑定到 v2 迁移状态；Context Guard 保持深 Module，CLI 与 Hook 只是 Adapter，复杂性集中且可测试。
