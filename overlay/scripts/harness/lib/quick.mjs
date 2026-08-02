// quick.mjs — Slice 级 Quick 验证与 runnable 绑定（PRD 9.5/16.1/16.4、FR-S02、FR-E01、NFR-12）。
// Quick 报告绑定：workItem/slice/revision、base integration commit、精确 change/content
// digest、config digest、contract/dependency digests、commands/results、时间与
// environment-sensitive TTL。Quick 不以 HEAD 作为唯一内容身份：内容、config 或声明的
// contract/dependency 变化立即使 Quick stale（场景 10）。本地确定性结果不因时间过期；
// environment-sensitive check 独立 TTL，过期只重跑该 check（§16.4）。

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readdir, readFile, readlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { E } from "./errors.mjs";

// Quick 只在 implementing/runnable 可全量执行：implementing 产出首份报告，
// runnable 上重跑用于 stale 后刷新；下游状态（human-reviewed/verified）只允许纯 TTL
// 刷新（见 opVerifyQuick）——内容漂移必须回 implementing 重新走正常路径（PRD 9.6）。
export const QUICK_ALLOWED_STATUSES = new Set(["implementing", "runnable"]);

// 下游状态允许 verify quick 的唯一情形：报告通过、digest 未漂移，仅刷新过期
// environment-sensitive check（§16.4 只重跑该 check，其余证据保留）。
export const QUICK_TTL_REFRESH_STATUSES = new Set(["human-reviewed", "verified"]);

// advance 目标态需要当前通过的 Quick（FR-S02；verified/done 另由 slice 04 叠加集成语义）。
export const QUICK_GATED_TARGETS = new Set(["runnable", "human-reviewed", "verified", "done"]);

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// 验证计划归一化（PRD 9.2 verification.quick）

/**
 * 归一化一条 quick 声明：字符串为本地确定性 check；
 * { command, environmentSensitiveTtlSeconds } 声明 environment-sensitive check 及其独立 TTL（§16.4）。
 */
export function normalizeQuickEntry(entry) {
  if (typeof entry === "string") {
    if (entry.trim() === "") throw E.INVALID_QUICK_CHECK("quick 命令必须是非空字符串");
    return { command: entry, environmentSensitiveTtlSeconds: null };
  }
  if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
    if (typeof entry.command !== "string" || entry.command.trim() === "") {
      throw E.INVALID_QUICK_CHECK(`quick check 缺 command：${JSON.stringify(entry)}`);
    }
    const ttl = entry.environmentSensitiveTtlSeconds;
    if (ttl !== undefined && (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < 0)) {
      throw E.INVALID_QUICK_CHECK(`environmentSensitiveTtlSeconds 必须是非负秒数：${JSON.stringify(entry)}`);
    }
    return { command: entry.command, environmentSensitiveTtlSeconds: ttl ?? null };
  }
  throw E.INVALID_QUICK_CHECK(`quick 条目必须是命令字符串或 {command, environmentSensitiveTtlSeconds}：${JSON.stringify(entry)}`);
}

export function normalizeQuickPlan(quick) {
  return quick.map(normalizeQuickEntry);
}

// ---------------------------------------------------------------------------
// 内容 digest（NFR-12：逐文件 SHA-256 manifest，可对实际内容反查）

/** 收集 writeScope 覆盖的候选路径：exact + rename from/to + subtree 递归展开（去重、排序）。 */
async function scopePaths(root, writeScope) {
  const paths = new Set([...writeScope.exact, ...writeScope.renames.flatMap((rename) => [rename.from, rename.to])]);
  const walk = async (rel) => {
    const entries = await readdir(join(root, rel), { withFileTypes: true });
    for (const entry of entries) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else paths.add(child);
    }
  };
  for (const subtree of writeScope.subtrees) {
    try {
      await walk(subtree);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      paths.add(subtree); // subtree 尚不存在：以 ABSENT 标记参与 digest，创建后即 drift
    }
  }
  return [...paths].sort();
}

/**
 * 计算当前 Slice 内容身份：digest + 逐文件 manifest（{path, mode, sha256|null}）。
 * manifest 直接给出反查依据（NFR-12）；哈希原始字节与 Git 模式（100644/100755/120000），
 * symlink 以其 target 为内容。scope 外路径绝不参与（Quick 只覆盖当前 Slice 风险，FR-E01）。
 */
export async function computeContentDigest(root, writeScope) {
  const files = [];
  for (const path of await scopePaths(root, writeScope)) {
    let entry = { path, mode: null, sha256: null };
    try {
      const info = await lstat(join(root, path));
      if (info.isSymbolicLink()) {
        entry = { path, mode: "120000", sha256: `sha256:${sha256Hex(await readlink(join(root, path)))}` };
      } else if (info.isFile()) {
        const mode = (info.mode & 0o111) !== 0 ? "100755" : "100644";
        entry = { path, mode, sha256: `sha256:${sha256Hex(await readFile(join(root, path)))}` };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error; // EACCES/EIO 等读取失败不得伪装成 ABSENT
    }
    files.push(entry);
  }
  const digest = `sha256:${sha256Hex(files.map((file) => `${file.mode ?? "ABSENT"} ${file.sha256 ?? "-"}  ${file.path}\n`).join(""))}`;
  return { digest, files };
}

/** config digest：实际生效配置文件（resolveContext 的 configPath）精确内容的 SHA-256。 */
export async function computeConfigDigest(root, configPath) {
  const content = await readFile(join(root, configPath));
  return { path: configPath, digest: `sha256:${sha256Hex(content)}` };
}

/**
 * 解析声明的 contract/dependency pin 到实际内容：ref 是既有 repo 文件时计算实际 SHA-256；
 * 非文件引用（外部契约等）actual=null，以声明 pin 为绑定。返回 {ref, pinned, actual}[]。
 */
export async function resolvePinnedDigests(root, refs) {
  const resolved = [];
  for (const { ref, digest } of refs) {
    let actual = null;
    try {
      if ((await stat(join(root, ref))).isFile()) actual = `sha256:${sha256Hex(await readFile(join(root, ref)))}`;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    resolved.push({ ref, pinned: digest, actual });
  }
  return resolved;
}

/** 声明 pin 与实际内容漂移：Quick 不能对漂移契约背书（PRD 9.3 固定语义）。 */
export function assertNoContractDrift(resolved) {
  for (const entry of resolved) {
    if (entry.actual !== null && entry.actual !== entry.pinned) {
      throw E.CONTRACT_DRIFT(entry.ref, entry.pinned, entry.actual);
    }
  }
}

// ---------------------------------------------------------------------------
// check 执行

const OUTPUT_TAIL_LIMIT = 4000;

function tail(text) {
  return text.length <= OUTPUT_TAIL_LIMIT ? text : `…（截断，共 ${text.length} 字符）\n${text.slice(-OUTPUT_TAIL_LIMIT)}`;
}

/**
 * 以 sh -c 在 repo root 执行一条命令；永远不抛，非零退出即 check 失败。
 * 流式收集且只保留尾部（不受 execFile 默认缓冲上限影响），stdin 立即关闭
 * （读取 stdin 的命令不会挂到超时）。
 */
function execCheck(root, command) {
  return new Promise((resolvePromise) => {
    const child = spawn("sh", ["-c", command], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = tail(stdout + chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = tail(stderr + chunk);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 600_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: 1, stdoutTail: stdout, stderrTail: tail(`${stderr}${String(error.message)}`) });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const timedOut = signal === "SIGKILL";
      resolvePromise({
        exitCode: code ?? 1,
        stdoutTail: stdout,
        stderrTail: timedOut ? tail(`${stderr}命令超过 600s 超时，已终止`) : stderr,
      });
    });
  });
}

async function runCheck(root, entry, at) {
  const started = Date.now();
  const outcome = await execCheck(root, entry.command);
  const ttl = entry.environmentSensitiveTtlSeconds;
  const expiresAt = ttl === null ? null : new Date(started + ttl * 1000).toISOString();
  return {
    command: entry.command,
    environmentSensitiveTtlSeconds: ttl,
    exitCode: outcome.exitCode,
    passed: outcome.exitCode === 0,
    stdoutTail: outcome.stdoutTail,
    stderrTail: outcome.stderrTail,
    durationMs: Date.now() - started,
    executedAt: at,
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Quick 报告（PRD 9.5 全部绑定字段）

/** 当前 Slice 的全部内容身份输入（一次计算，quick 与 staleness 判定共用）。 */
export async function computeQuickInputs(root, slice, baseIntegrationCommit, configPath) {
  const [content, config, contractRefs, dependencyDigests] = await Promise.all([
    computeContentDigest(root, slice.writeScope),
    computeConfigDigest(root, configPath),
    resolvePinnedDigests(root, slice.contractRefs),
    resolvePinnedDigests(root, slice.dependencyDigests),
  ]);
  return { baseIntegrationCommit, content, config, contractRefs, dependencyDigests };
}

function samePinned(a, b) {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return entry.ref === other.ref && entry.pinned === other.pinned && entry.actual === other.actual;
  });
}

function expiredCheck(check, at) {
  return check.expiresAt !== null && Date.parse(check.expiresAt) <= Date.parse(at);
}

/** 报告绑定与当前内容身份的逐项 drift 原因；空数组 = 绑定仍然精确（唯一比较点）。 */
export function driftReasons(report, inputs) {
  const reasons = [];
  if (report.baseIntegrationCommit !== inputs.baseIntegrationCommit) reasons.push("base integration commit 已漂移");
  if (report.content.digest !== inputs.content.digest) reasons.push("内容已变化");
  if (report.config.digest !== inputs.config.digest) reasons.push("config 已变化");
  if (!samePinned(report.contractRefs, inputs.contractRefs)) reasons.push("contract digest 已变化");
  if (!samePinned(report.dependencyDigests, inputs.dependencyDigests)) reasons.push("dependency digest 已变化");
  return reasons;
}

/** 报告的全部 digest 绑定是否仍等于当前内容身份（不含 TTL 与 passed）。 */
export function digestsMatch(report, inputs) {
  return driftReasons(report, inputs).length === 0;
}

/**
 * Quick 报告对当前内容身份的时效判定（纯函数）。
 * none：当前 revision 无报告；failed：最近 Quick 未通过；
 * stale：内容/config/contract/dependency drift 或 environment-sensitive check TTL 过期；
 * current：可背书 runnable。
 */
export function quickCurrency(slice, inputs, at) {
  const report = slice.quickReport;
  if (report === null || report.revision !== slice.revision) return { state: "none", reasons: [] };
  const reasons = driftReasons(report, inputs);
  const expired = report.checks.filter((check) => expiredCheck(check, at)).map((check) => check.command);
  if (expired.length > 0) reasons.push(`environment-sensitive check TTL 过期：${expired.join("、")}`);
  if (reasons.length > 0) return { state: "stale", reasons };
  if (!report.passed) return { state: "failed", reasons: ["最近 Quick 未通过"] };
  return { state: "current", reasons: [] };
}

/**
 * advance 门禁（FR-S02）：目标态需要当前通过的 Quick。
 * 由 opSliceAdvance 在转移表校验后叠加；纯判定，IO 由调用方完成。
 */
export function requireQuickForAdvance(slice, to, currency) {
  if (!QUICK_GATED_TARGETS.has(to)) return;
  if (currency.state === "none") throw E.QUICK_REQUIRED(slice.sliceId, to);
  if (currency.state === "failed") {
    const failed = slice.quickReport.checks.filter((check) => !check.passed).map((check) => check.command);
    throw E.QUICK_FAILED(failed.join("、"));
  }
  if (currency.state === "stale") throw E.QUICK_STALE(currency.reasons.join("；"));
}

/**
 * 构建/刷新 Quick 报告。
 * 报告 current（同 revision、同 digest）时：无过期 check → 原样复用（本地确定性结果不因
 * 时间过期，§16.4）；有过期 environment-sensitive check → 只重跑过期项，其余结果保留。
 * 其余情况（无报告/失败/drift）→ 全部重跑。
 */
export async function buildQuickReport(root, slice, inputs, at) {
  const prior = slice.quickReport;
  const bound = prior !== null && prior.revision === slice.revision && prior.passed && digestsMatch(prior, inputs);
  if (bound) {
    const rerun = new Map(); // 按 index 匹配：相同命令出现多次时各自独立重跑
    for (const [index, check] of prior.checks.entries()) {
      if (expiredCheck(check, at)) {
        rerun.set(index, await runCheck(root, { command: check.command, environmentSensitiveTtlSeconds: check.environmentSensitiveTtlSeconds }, at));
      }
    }
    if (rerun.size === 0) return { report: prior, ran: [], reused: prior.checks.map((check) => check.command) };
    const checks = prior.checks.map((check, index) => rerun.get(index) ?? check);
    return {
      report: { ...prior, checks, passed: checks.every((check) => check.passed), executedAt: at },
      ran: [...rerun.values()].map((check) => check.command),
      reused: prior.checks.filter((check) => !expiredCheck(check, at)).map((check) => check.command),
    };
  }
  const checks = [];
  for (const entry of normalizeQuickPlan(slice.verificationPlan.quick)) {
    checks.push(await runCheck(root, entry, at));
  }
  return {
    report: {
      version: 1,
      workItemId: slice.workItemId,
      sliceId: slice.sliceId,
      revision: slice.revision,
      baseIntegrationCommit: inputs.baseIntegrationCommit,
      content: inputs.content,
      config: inputs.config,
      contractRefs: inputs.contractRefs,
      dependencyDigests: inputs.dependencyDigests,
      checks,
      passed: checks.every((check) => check.passed),
      executedAt: at,
    },
    ran: checks.map((check) => check.command),
    reused: [],
  };
}
