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
  INVALID_OUTCOME: (outcome) =>
    new HarnessError("E_INVALID_OUTCOME", `未知关闭结果 ${outcome}`, {
      exitCode: EXIT_USAGE,
      repair: "outcome 必须是 accepted|abandoned|superseded",
    }),
};
