import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { headSnapshot, workspaceDigest, worktreeStatus } from "./git.mjs";

const execAsync = promisify(exec);
const OUTPUT_LIMIT = 4096;
const NEXT_ACTIONS = {
  "command-failed": "查看失败命令的 stdout/stderr，修复后重新运行当前验证命令",
  "cleanup-failed": "检查 Full 清理命令并恢复测试数据后重新运行 finish",
  "workspace-mutated": "检查验证命令的工作区副作用，恢复候选内容后重新运行验证",
  "candidate-drift": "恢复任务分支和候选 HEAD，确认工作区干净后重新运行 finish",
};

export function digest(value) {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verificationPlan(config, profile) {
  const group = config.commands[profile];
  const commands = [...group.static, ...group.test];
  if (profile === "full") commands.push(...config.commands.contracts, ...config.criticalUserPaths);
  return commands;
}

export function verificationDigests(config, profile) {
  return { configDigest: digest(config), planDigest: digest(verificationPlan(config, profile)) };
}

async function runCommand(root, command, timeout) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: root, timeout, maxBuffer: 8 * 1024 * 1024 });
    return { command, passed: true, durationMs: Date.now() - startedAt, stdout: stdout.slice(-OUTPUT_LIMIT), stderr: stderr.slice(-OUTPUT_LIMIT) };
  } catch (error) {
    return {
      command,
      passed: false,
      durationMs: Date.now() - startedAt,
      exitCode: Number.isInteger(error.code) ? error.code : null,
      timedOut: error.killed === true && error.signal === "SIGTERM",
      stdout: String(error.stdout ?? "").slice(-OUTPUT_LIMIT),
      stderr: String(error.stderr ?? error.message ?? "").slice(-OUTPUT_LIMIT),
    };
  }
}

function failureSummary(entry) {
  return {
    command: entry.command,
    exitCode: entry.exitCode ?? null,
    timedOut: entry.timedOut ?? false,
  };
}

function classifyFailure(facts) {
  if (facts.failedCommands.length > 0) return "command-failed";
  if (facts.cleanupFailures.length > 0) return "cleanup-failed";
  if (facts.workspaceChanged) return "workspace-mutated";
  if (facts.candidateChanged || !facts.worktreeClean) return "candidate-drift";
  return null;
}

export async function runVerification({ root, config, profile, now = () => new Date() }) {
  const commands = verificationPlan(config, profile);
  const beforeCandidate = profile === "full" ? await headSnapshot(root) : null;
  const beforeDigest = await workspaceDigest(root);
  const results = [];
  for (const command of commands) results.push(await runCommand(root, command, config.verification.commandTimeoutMs));
  const cleanup = [];
  if (profile === "full") {
    for (const command of config.recovery.testDataCleanup) {
      cleanup.push(await runCommand(root, command, config.verification.commandTimeoutMs));
    }
  }
  const afterDigest = await workspaceDigest(root);
  const { configDigest, planDigest } = verificationDigests(config, profile);
  const report = {
    profile,
    passed: results.every((entry) => entry.passed) && cleanup.every((entry) => entry.passed) && beforeDigest === afterDigest,
    ranAt: now().toISOString(),
    workspaceDigest: afterDigest,
    configDigest,
    planDigest,
    results,
    cleanup,
  };
  if (profile === "full") {
    report.candidate = await headSnapshot(root);
    report.clean = (await worktreeStatus(root)) === "";
    report.candidateUnchanged =
      report.candidate.branch === beforeCandidate.branch &&
      report.candidate.commit === beforeCandidate.commit &&
      report.candidate.tree === beforeCandidate.tree;
    report.passed = report.passed && report.clean && report.candidateUnchanged;
  }
  const candidateChanged = profile === "full" && !report.candidateUnchanged;
  const failureFacts = {
    failedCommands: results.filter((entry) => !entry.passed).map(failureSummary),
    cleanupFailures: cleanup.filter((entry) => !entry.passed).map(failureSummary),
    workspaceChanged: beforeDigest !== afterDigest && !candidateChanged,
    candidateChanged,
    worktreeClean: profile === "full" ? report.clean : true,
  };
  report.failureClass = classifyFailure(failureFacts);
  report.failureFacts = report.failureClass === null ? null : failureFacts;
  report.nextAction = report.failureClass === null ? null : NEXT_ACTIONS[report.failureClass];
  return report;
}
