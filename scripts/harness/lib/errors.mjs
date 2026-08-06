export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;
export const EXIT_USAGE = 2;

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

const usage = (message, repair = "运行 harness --help 查看支持的命令") =>
  new HarnessError("E_USAGE", message, { repair, exitCode: EXIT_USAGE });

export const E = {
  USAGE: usage,
  STATE: (message, repair = "运行 harness status --json 检查本地控制状态") =>
    new HarnessError("E_STATE", message, { repair, exitCode: EXIT_USAGE }),
  ACTIVE: (id) => new HarnessError("E_ACTIVE", `已有活动任务 ${id}`, { repair: "先完成或 abort 当前任务" }),
  IDLE: () => new HarnessError("E_IDLE", "当前没有活动任务", { repair: "运行 harness align 创建任务" }),
  PHASE: (phase, action) =>
    new HarnessError("E_PHASE", `${phase} 阶段不能执行 ${action}`, { repair: "运行 harness status 查看下一动作" }),
  CONFIRM_REQUIRED: (kind, digest) =>
    new HarnessError("E_CONFIRM_REQUIRED", `${kind} 需要用户确认`, {
      repair: `使用 --confirm ${digest} --quote "<用户原话>" 重试`,
      facts: { kind, confirmationDigest: digest },
    }),
  CONFIRM_STALE: () =>
    new HarnessError("E_CONFIRM_STALE", "确认摘要与当前事实不一致", { repair: "重新读取当前摘要后确认" }),
  GIT_DIRTY: () =>
    new HarnessError("E_GIT_DIRTY", "工作区必须干净", { repair: "提交、暂存到其他位置或恢复当前修改后重试" }),
  GIT_DRIFT: (message) =>
    new HarnessError("E_GIT_DRIFT", message, { repair: "回到任务起始分支并保持 baseline 为候选祖先" }),
  CONTEXT_BLOCKED: (digest) =>
    new HarnessError("E_CONTEXT_BLOCKED", "已交付写前上下文；使用同一 session 重试", {
      repair: "读取交付内容后，以相同 --session 重试写入",
      facts: { resolutionDigest: digest },
    }),
  VERIFY_FAILED: (report) =>
    new HarnessError("E_VERIFY_FAILED", `${report.profile} 验证未通过`, {
      repair: `修复失败命令后重新运行 ${report.profile === "quick" ? "harness check" : "harness finish"}`,
      facts: { report },
    }),
  VERIFY_STALE: () =>
    new HarnessError("E_VERIFY_STALE", "验证证据已因代码、配置或命令计划变化而失效", {
      repair: "重新运行验证并使用新的确认摘要",
    }),

  // Context index parser failures are usage/configuration errors, not lifecycle states.
  CONTEXT_CONFIG_INVALID: (detail) => usage(`目录上下文配置非法：${detail}`, "修正 .harness/config.json 的 contextIndex"),
  CONTEXT_TARGET_INVALID: (target) => usage(`Context Guard 目标非法：${target}`, "使用仓库内普通文件路径"),
  CONTEXT_SESSION_REQUIRED: () => usage("受管写入缺少会话标识", "提供稳定的 --session <id>"),
  CONTEXT_INDEX_REQUIRED: (path) => usage(`Code Root 缺少 ${path}`, "为每个受管根创建 .harness-index.json"),
  CONTEXT_INDEX_INVALID: (path, detail) => usage(`目录索引 ${path} 非法：${detail}`),
  CONTEXT_REFERENCE_INVALID: (indexPath, ref, detail) => usage(`目录上下文引用非法（${indexPath} -> ${ref}）：${detail}`),
  CONTEXT_REFERENCE_NOT_TEXT: (path) => usage(`目录上下文前置不是 UTF-8 文本：${path}`),
  CONTEXT_DEPENDENCY_CYCLE: (paths) => usage(`目录上下文依赖成环：${paths.join(" -> ")}`),
  CONTEXT_FILE_TOO_LARGE: (path, limit) => usage(`目录上下文文件超过 ${limit} 字节：${path}`),
  CONTEXT_CLOSURE_TOO_LARGE: (limit) => usage(`目录上下文闭包超过 ${limit} 字节`),
  CONTEXT_DELIVERY_REQUIRED: () => usage("Context Guard 缺少交付回调"),
};
