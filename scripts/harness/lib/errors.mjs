// errors.mjs — v2 稳定错误码与退出码契约（PRD 12.1 / NFR-03）。
// 所有对外拒绝都带稳定 code、原因与一条首选修复命令。

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1; // 领域门禁拒绝
export const EXIT_USAGE = 2; // 用法错误、IO/解析失败、Git 不可用

export class HarnessError extends Error {
  constructor(code, message, { repair = null, exitCode = EXIT_REFUSED, facts = null } = {}) {
    super(message);
    this.name = "HarnessError";
    this.code = code;
    this.repair = repair;
    this.exitCode = exitCode;
    this.facts = facts;
  }
}

export const E = {
  USAGE: (msg, repair) => new HarnessError("E_USAGE", msg, { repair, exitCode: EXIT_USAGE }),
  GIT: (msg) => new HarnessError("E_GIT", msg, { exitCode: EXIT_USAGE }),
  NOT_MIGRATED: (stateRef) =>
    new HarnessError("E_NOT_MIGRATED", `state ref ${stateRef} 不存在；项目尚未迁移到 v2 状态拓扑`, {
      repair: "harness migrate-state",
    }),
  STATE_INCONSISTENT: (detail) =>
    new HarnessError("E_STATE_INCONSISTENT", `registry 与 audit ledger 不一致：${detail}`, {
      repair: "harness status --json 检查 sequence/lastTransactionId；从备份恢复后重试",
    }),
  REF_DRIFT: (ref) =>
    new HarnessError("E_REF_DRIFT", `${ref} 在事务期间被并发更新`, {
      repair: "重新读取状态后重试同一命令",
    }),
  NO_TARGET_REF: (ref) =>
    new HarnessError("E_NO_TARGET_REF", `配置的 targetRef ${ref} 不存在`, {
      repair: "在 .harness/config.json 的 git.targetRef 配置存在的分支",
    }),
  STATE_EXISTS: (ref) =>
    new HarnessError("E_STATE_EXISTS", `${ref} 已存在但不含有效 registry；拒绝覆盖`, {
      repair: "人工核对后删除该 ref 或修复 registry.json",
    }),
  MIGRATION_FAILED: (detail) =>
    new HarnessError("E_MIGRATION_FAILED", `v1→v2 迁移失败：${detail}`, {
      repair: "修复原因后重试 harness migrate-state；target/state ref 与工作区保持不变",
    }),
  ACTIVE_EXISTS: (id) =>
    new HarnessError("E_ACTIVE_EXISTS", `已存在 active Work Item ${id}`, {
      repair: `harness suspend 后重试，或使用 harness suspend-and-start / close-and-start`,
    }),
  NO_ACTIVE: () =>
    new HarnessError("E_NO_ACTIVE", "当前没有 active Work Item", {
      repair: "harness start --type <type> --quote \"<任务原话>\" 或 harness resume <id>",
    }),
  ITEM_NOT_FOUND: (id) =>
    new HarnessError("E_ITEM_NOT_FOUND", `Work Item ${id} 不存在`, {
      repair: "harness status --json 查看 active/suspended；closed 项位于 stateRef 历史",
    }),
  ITEM_NOT_ACTIVE: (id, status) =>
    new HarnessError("E_ITEM_NOT_ACTIVE", `Work Item ${id} 状态为 ${status}，不可执行该动作`, {
      repair: status === "suspended" ? `harness resume ${id}` : "harness status 查看当前事实",
    }),
  ITEM_NOT_SUSPENDED: (id, status) =>
    new HarnessError("E_ITEM_NOT_SUSPENDED", `Work Item ${id} 状态为 ${status}，不可 resume`, {
      repair: "harness status --json 查看 suspendedWorkItemIds",
    }),
  ILLEGAL_TRANSITION: (type, from, to) =>
    new HarnessError("E_ILLEGAL_TRANSITION", `${type} 不允许 ${from} → ${to}`, {
      repair: "harness status 查看当前允许动作；事实问题走 reopen，不跳转阶段",
    }),
  INVALID_TYPE: (type) =>
    new HarnessError("E_INVALID_TYPE", `未知 Work Item 类型 ${type}`, {
      exitCode: EXIT_USAGE,
      repair: "类型必须是 feature|bugfix|maintenance|optimization|migration|rollback",
    }),
  SKILL_ROUTING_INVALID: (detail) =>
    new HarnessError("E_SKILL_ROUTING_INVALID", `Skill 路由配置非法：${detail}`, {
      exitCode: EXIT_USAGE,
      repair: "修复 .agents/skills.json 后运行 harness skills route --type <type> --stage <stage> --json",
    }),
  SKILL_ROUTE_NOT_FOUND: (context, detail = null) =>
    new HarnessError("E_SKILL_ROUTE_NOT_FOUND", `没有可用 Skill 路由：${context}${detail ? `；${detail}` : ""}`, {
      exitCode: EXIT_USAGE,
      repair: "检查 Work Item 类型/阶段，或在 .agents/skills.json 添加无条件 fallback route",
    }),
  SKILL_ROUTE_CONFLICT: (context, routeIds) =>
    new HarnessError("E_SKILL_ROUTE_CONFLICT", `Skill 路由同优先级冲突：${context} → ${routeIds.join("、")}`, {
      exitCode: EXIT_USAGE,
      repair: "收窄 matcher，或按 routing.precedence 增加更具体的唯一 route",
    }),
  INVALID_OUTCOME: (outcome) =>
    new HarnessError("E_INVALID_OUTCOME", `未知关闭结果 ${outcome}`, {
      exitCode: EXIT_USAGE,
      repair: "outcome 必须是 accepted|abandoned|superseded",
    }),
  INVALID_RISK_INPUT: (msg, repair) => new HarnessError("E_INVALID_RISK_INPUT", msg, { exitCode: EXIT_USAGE, repair }),
  RISK_BELOW_FLOOR: (override, floor) =>
    new HarnessError("E_RISK_BELOW_FLOOR", `风险等级 ${override} 低于规则下限 ${floor}；Developer 可上调不可下调`, {
      repair: `harness start 携带 --risk-level ${floor} 或更高，或修正风险事实后重试`,
    }),
  RISK_TOO_HIGH_FOR_BRIEF: (level) =>
    new HarnessError("E_RISK_TOO_HIGH_FOR_BRIEF", `风险等级 ${level} 不满足 low allowlist，不能使用 Brief 批量确认`, {
      repair: "按 medium/high 分阶段路径逐段 advance 并确认事实；或在 start 时修正风险事实",
    }),
  BRIEF_NOT_ALLOWED: (type, reason) =>
    new HarnessError("E_BRIEF_NOT_ALLOWED", `${type} 不可使用 Brief 批量确认：${reason}`, {
      repair: "harness status 查看当前允许动作；按类型生命周期分阶段推进",
    }),
  BRIEF_INCOMPLETE: (required, missing) =>
    new HarnessError("E_BRIEF_INCOMPLETE", `Brief 缺段：${missing.join("、")}`, {
      repair: `Brief 必须包含：${required.join(", ")}`,
    }),
  FACT_FROZEN: (kind) =>
    new HarnessError("E_FACT_FROZEN", `事实 ${kind} 已确认为不可变 revision，不可重复确认`, {
      repair: "事实错误走 reopen 创建后继 revision（Phase C），不覆盖已冻结事实",
    }),
  DEFECT_INCOMPLETE: (missing) =>
    new HarnessError("E_DEFECT_INCOMPLETE", `defect 事实缺项：${missing.join("、")}`, {
      repair: "defect 必须同时引用既有契约（contractRef）与可复现偏差（reproduction）",
    }),
  DEFECT_CONTRACT_MISMATCH: (expected, actual) =>
    new HarnessError("E_DEFECT_CONTRACT_MISMATCH", `defect.contractRef ${actual} 与 start 声明的既有承诺 ${expected} 不一致`, {
      repair: "修正 Brief 的 contractRef；没有既有承诺的新增期望应 close-and-start 为 feature",
    }),
  DIAGNOSIS_INCOMPLETE: (missing) =>
    new HarnessError("E_DIAGNOSIS_INCOMPLETE", `diagnosis 事实缺项：${missing.join("、")}`, {
      repair: "diagnosis 必须有证据支持的因果解释（causality + evidence），不能只描述症状",
    }),
  SCOPE_INCOMPLETE: (missing) =>
    new HarnessError("E_SCOPE_INCOMPLETE", `maintenance scope 缺项：${missing.join("、")}`, {
      repair: "scope 必须声明目标（goal）、保持不变量（invariants）、风险画像（riskProfile）与回退边界（rollbackBoundary）",
    }),
  DEFECT_NO_CONTRACT: () =>
    new HarnessError("E_DEFECT_NO_CONTRACT", "Bugfix 必须声明要恢复的既有承诺（契约、不变量或已验收行为）", {
      repair: "harness start --type bugfix --contract-ref <契约引用>；没有既有承诺的新增期望应改用 --type feature",
    }),
  SLICE_NOT_FOUND: (id) =>
    new HarnessError("E_SLICE_NOT_FOUND", `Slice ${id} 不存在于当前 Work Item`, {
      repair: "harness slice list --json 查看当前 Work Item 的 Slice",
    }),
  SLICE_EXISTS: (id) =>
    new HarnessError("E_SLICE_EXISTS", `Slice ${id} 已存在`, {
      repair: "harness slice list 查看已有 Slice；换用唯一 sliceId 或 update-scope 修订既有 Slice",
    }),
  SLICE_INCOMPLETE: (missing) =>
    new HarnessError("E_SLICE_INCOMPLETE", `Slice spec 缺项：${missing.join("、")}`, {
      repair: "spec 必须包含 sliceId、primaryUncertainty、acceptanceCriteria、writeScope、verification.quick",
    }),
  ILLEGAL_SLICE_TRANSITION: (from, to) =>
    new HarnessError("E_ILLEGAL_SLICE_TRANSITION", `Slice 不允许 ${from} → ${to}`, {
      repair:
        "六态须逐态推进 ready → implementing → runnable → human-reviewed → verified → done；harness slice list 查看当前状态",
    }),
  SLICE_BLOCKED: (id, pending) =>
    new HarnessError("E_SLICE_BLOCKED", `Slice ${id} 的前驱未完成（${pending.join("、")}），不进入 frontier`, {
      repair: "等待前驱 Slice 全部 done 后再 advance；harness slice list --json 查看 frontier",
    }),
  INVALID_WRITE_SCOPE: (reason) =>
    new HarnessError("E_INVALID_WRITE_SCOPE", `Write Scope 非法：${reason}`, {
      repair:
        "Write Scope 只支持 exact file 与 directory subtree（不支持 glob）；rename 必须同时有 source 与 destination，且 destination 落在 owned subtree",
    }),
  UNKNOWN_SLICE_REF: (ref) =>
    new HarnessError("E_UNKNOWN_SLICE_REF", `dependsOn 引用未知 Slice ${ref}`, {
      repair: "harness slice list --json 查看已有 Slice；先创建被依赖的 Slice",
    }),
  SLICE_CYCLE: (detail) =>
    new HarnessError("E_SLICE_CYCLE", `dependsOn 构成环依赖：${detail}`, {
      repair: "调整 dependsOn 使 Slice 依赖图保持 DAG",
    }),
  SCOPE_OVERLAP: (id, other, detail) =>
    new HarnessError("E_SCOPE_OVERLAP", `Slice ${id} 与 ${other} 的 Write Scope 重叠：${detail}`, {
      repair: "缩小一方 scope，或用 dependsOn 串行化共享路径的修改",
    }),
  UNPINNED_CONTRACT: (ref) =>
    new HarnessError("E_UNPINNED_CONTRACT", `共享契约 ${ref} 未固定 digest，Slice 不进入 frontier`, {
      repair: "contractRefs/dependencyDigests 条目必须携带固定 digest（{ref, digest}）；先形成 Contract Baseline",
    }),
  INVALID_QUICK_CHECK: (reason) =>
    new HarnessError("E_INVALID_QUICK_CHECK", `Quick 验证计划非法：${reason}`, {
      repair:
        "verification.quick 条目为命令字符串或 {command, environmentSensitiveTtlSeconds}（TTL 为非负秒数）",
    }),
  QUICK_NOT_ALLOWED: (sliceId, status) =>
    new HarnessError("E_QUICK_NOT_ALLOWED", `Slice ${sliceId} 状态为 ${status}，不能执行 verify quick`, {
      repair:
        "全量 Quick 只在 implementing/runnable；human-reviewed/verified 仅允许纯 TTL 刷新（报告通过且 digest 未漂移）；内容修改须回 implementing 重新走正常路径",
    }),
  QUICK_REQUIRED: (sliceId, to) =>
    new HarnessError("E_QUICK_REQUIRED", `Slice ${sliceId} 当前 revision 没有 Quick 报告，不能进入 ${to}`, {
      repair: `harness verify quick --slice ${sliceId}`,
    }),
  QUICK_FAILED: (detail) =>
    new HarnessError("E_QUICK_FAILED", `Quick 未通过：${detail}`, {
      repair: "修复失败 check 后重跑 harness verify quick；报告见 stateRef 中 Slice 的 quickReport",
    }),
  QUICK_STALE: (reasons) =>
    new HarnessError("E_QUICK_STALE", `Quick 已 stale：${reasons}`, {
      repair: "harness verify quick 重新验证；内容/config/contract/dependency 变化立即使 Quick 失效（PRD 9.5）",
    }),
  CONTRACT_DRIFT: (ref, pinned, actual) =>
    new HarnessError("E_CONTRACT_DRIFT", `声明契约 ${ref} 实际内容漂移：pinned ${pinned}，actual ${actual}`, {
      repair: "恢复契约内容或走新 revision 更新 pin；Quick 不能对漂移契约背书",
    }),
  ROLLBACK_TARGET_NOT_ACCEPTED: (id) =>
    new HarnessError("E_ROLLBACK_TARGET_NOT_ACCEPTED", `Rollback 目标 ${id} 不在 accepted lineage 中`, {
      repair: "harness status --json 查看 Accepted Baseline；目标必须是已 accepted 关闭的 Work Item",
    }),
  ROLLBACK_REQUIRES_CASCADE: (id, successors) =>
    new HarnessError(
      "E_ROLLBACK_REQUIRES_CASCADE",
      `目标 ${id} 之后存在后继 accepted 项（${successors.join("、")}），单独 revert 不安全`,
      {
        repair: `harness rollback ${id}（去掉 --only），自动按逆序级联全部后继项`,
      },
    ),
};
