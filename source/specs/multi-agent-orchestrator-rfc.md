# Strict Multi-Agent Orchestrator RFC

Status: proposed for an isolated prototype; not implemented by AI Vibe Demo Kit 0.6.0.

## Decision

严格多 Agent 执行属于独立 Orchestrator。Harness 继续只校验 Workflow、Artifact 和控制状态，不启动 Agent、不读取会话历史、不实现远程调度，也不获得新的外部写权限。

Orchestrator 只能把显式声明、带 Digest 的 context package 物化给目标 Agent。Agent 输出必须先形成结构化 handoff，经 Schema、Digest 和策略校验后才能提升到共享 Evidence。

## `context-package/v1`

```json
{
  "schemaVersion": 1,
  "contract": "context-package/v1",
  "packageId": "ctx-example",
  "workItemId": "wi-example",
  "producer": { "agentId": "planner", "role": "planner" },
  "consumer": { "agentId": "implementer", "role": "implementer" },
  "createdAt": "2026-08-12T00:00:00Z",
  "expiresAt": "2026-08-13T00:00:00Z",
  "inputs": [
    {
      "uri": "context/spec.json",
      "sha256": "sha256:<hex>",
      "access": "read-only",
      "provenance": "work/requirements/wi-example/spec.json"
    }
  ],
  "constraints": ["No access to producer conversation history"],
  "expectedOutputs": [
    { "id": "implementation", "contract": "artifact/file", "required": true }
  ],
  "provenance": ["workflow:example@sha256:<hex>"]
}
```

Required rules:

- `packageId`、`workItemId`、producer、consumer、时间范围、inputs、constraints、expectedOutputs 和 provenance 必填。
- 每个输入只能使用仓库相对路径或 Orchestrator 管理的对象 URI，必须声明 SHA-256 和 `read-only`。
- `expiresAt` 到期、Digest 不匹配、路径越界、Symlink、缺失输入或未声明 Contract 均拒绝启动。
- Package 不包含 Prompt 会话记录、长期凭据、未脱敏客户数据或隐式宿主路径。

## `handoff/v1`

```json
{
  "schemaVersion": 1,
  "contract": "handoff/v1",
  "packageId": "ctx-example",
  "runId": "run-example",
  "agent": { "agentId": "implementer", "role": "implementer" },
  "outcome": "succeeded",
  "summary": "Implemented the declared output",
  "artifacts": [
    {
      "id": "implementation",
      "uri": "output/implementation.patch",
      "sha256": "sha256:<hex>",
      "contract": "artifact/file"
    }
  ],
  "verification": [
    { "command": "node --test", "status": "passed", "exitCode": 0, "evidenceRefs": ["output/test.log"] }
  ],
  "residualRisks": [],
  "nextActions": []
}
```

Required rules:

- `packageId` 必须匹配输入，`runId` 和 Agent 身份由 Orchestrator 签发。
- succeeded 输出必须覆盖所有 required expected outputs，URI 只能位于本次 `/output`，每个文件都校验 SHA-256。
- failed/cancelled 必须包含原因；任何失败输出不得自动提升。
- verification、residualRisks 和 nextActions 必须显式存在，即使为空。

## Isolation and data flow

1. Orchestrator 校验 context package 后创建一次性 OCI 容器和工作目录。
2. `/context` 只读挂载已声明输入；`/output` 是唯一可写挂载；宿主仓库、其他 Agent 工作目录和会话存储不挂载。
3. 容器 root filesystem 只读、默认禁网、丢弃 Linux capabilities，并设置 CPU、内存、进程数和执行超时。
4. 需要模型网络或凭据时必须由单独 capability policy 授权，只注入短期、最小权限凭据，且不得写入 Artifact。
5. Agent 完成后 Orchestrator 在容器外校验 handoff、输出路径和 Digest，再以原子操作提升通过的文件。
6. Agent 间依赖只能引用已提升 Artifact；禁止从会话历史、共享终端或未声明目录传递状态。

Run 状态固定为 `queued -> materializing -> running -> validating -> succeeded|failed|cancelled -> archived`。状态变化写追加式审计日志；重试创建新 `runId`，不覆盖旧记录。

## Retention and cleanup

- succeeded：handoff 提升完成后立即删除容器、临时 context 副本和工作目录。
- failed/cancelled：只保留脱敏诊断、结构化错误和审计元数据，最长 24 小时后自动清理。
- 正式 context package、handoff 和提升后的 Evidence 进入项目配置的 Evidence retention；Harness 不自动删除这些受治理文件。
- 清理失败形成 Policy Failure，不能把 run 标记为 archived 或把依赖任务解锁。

## OCI prototype gate

在创建 Orchestrator v1 实现任务前，独立原型必须用 Docker/OCI 自动证明：

1. Agent 读取未声明宿主文件、其他 Agent 输出或会话目录时得到 permission denied/not found。
2. 输入内容、Digest、有效期或 handoff 身份被篡改时，Agent 不启动或输出不提升。
3. 两个有依赖的 Agent 只能通过 `context-package/v1 -> handoff/v1` 文件链传递数据。
4. 进程崩溃、超时和校验失败产生可恢复的结构化终态，不留下可运行容器。
5. succeeded 后容器和临时目录立即消失；failed/cancelled 诊断在 24 小时清理策略内可验证删除。
6. 原型报告记录实际 OCI 命令、退出码、挂载、网络策略、Digest、清理证据和残留风险，并通过人工 Gate。

原型未通过全部门槛前，项目不得声明严格多 Agent 隔离或开始生产 Orchestrator v1。
