# AI Environment Index

> 将本文件复制为仓库根目录的 `AI_ENVIRONMENT.md`。它是环境资料的路由索引，不是机器状态的完整快照。只记录不敏感的事实；未知项写 `unknown`，不适用项写 `not-applicable`，并附证据来源和负责人。

## 用途与加载规则

本索引帮助 Agent 根据任务加载最小必要环境信息。普通任务不要求预读全部环境资料。

| 任务 | 读取入口 |
| --- | --- |
| 执行、修改或注册命令 | `docs/agent-environment/commands.md` |
| 启动、停止或排查服务 | `docs/agent-environment/services.md` |
| 判断可用工具、Skill、Connector 或权限 | `docs/agent-environment/capabilities.md` |
| 网络、沙箱、文件系统或 GUI 操作 | `docs/agent-environment/network-filesystem.md` |
| CI、发布或环境差异 | `docs/agent-environment/ci-parity.md` |
| 规则维护、备份、审阅或新上下文验收 | `.agents/skills/agents-maintenance/SKILL.md` 及其 references |

若入口文件不存在，先报告缺失并使用当前会话实际暴露的能力；不得根据模板猜测工具或权限。

## 常驻约束

- 项目命令和写入范围以 `project.yml` 为准；环境事实以对应章节最近一次可复现探测为准。
- 有效能力必须同时满足项目要求、机器可用性和 Agent 当前权限。状态为 `healthy` 才能直接执行。
- 不记录密钥、令牌、客户数据、设备序列号、个人账户或其他敏感值；只记录变量名、来源和安全存在性检查。
- 发布、生产写入和破坏性操作需要项目规定的人工批准。仓库内可逆编辑和无生产访问的本地检查按任务授权执行。

## Contract metadata

| Field | Value |
| --- | --- |
| Schema version | `2` |
| Manifest owner | `unknown`（在项目实例中填写角色） |
| Project reference | `project.yml` |
| Source of truth | 本索引及其按需章节；冲突时以最新证据为准 |
| Last verified at | `unknown` |
| Verified by | `unknown` |
| Refresh trigger | 工具链、依赖、CI 镜像、权限、网络策略或服务配置变化 |

## Environment profiles

| Profile | Purpose | Configuration source | Supported | Owner |
| --- | --- | --- | --- | --- |
| local | 本地开发与验证 | `project.yml` 及项目配置 | `unknown` | `unknown` |
| ci | 持续集成 | CI workflow | `unknown` | `unknown` |
| release | 发布（不适用时写 `not-applicable`） | 发布配置 | `unknown` | `unknown` |

## Freshness record

按需章节中的每项机器事实至少记录以下字段，过期事实不得视为当前能力：

```yaml
fact: "事实名称"
observed: "unknown"
evidence: "探测命令、配置文件或 CI 日志路径"
verified_at: "ISO-8601 时间或 unknown"
refresh_when: "触发重新探测的变化"
owner: "负责人或 unknown"
status: "unknown | unavailable | installed | available | authenticated | authorized | healthy | blocked-by-policy"
```

## Project and permission links

- 项目事实、命令、写入根和人工门禁：`project.yml`
- Agent 能力来源：`project.yml#capabilities.skill_sources` 指向的 Skill 索引
- 维护流程：`.agents/skills/agents-maintenance/SKILL.md`（仅在规则维护或严格模式任务中加载）

## Completion and reporting

环境相关任务完成的条件是：读取了与任务匹配的章节，运行了必要的安全探测或验证，处理了由本次改动导致的失败，并报告未执行、失败、过期或未知的检查。调查任务在给出证据、影响和下一步后停止。

## Instance checklist

- [ ] 本文件已复制到仓库根目录并更新索引路径。
- [ ] 按需章节存在，链接路径可解析。
- [ ] 每项已记录事实都有证据来源、验证时间、刷新条件和状态。
- [ ] 未写入密钥或其他敏感值。
- [ ] `project.yml` 中没有未解析占位符或不存在的默认命令。
