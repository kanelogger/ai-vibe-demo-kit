import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { validateConfig } from "./harness/lib/context.mjs";

const execFileAsync = promisify(execFile);

const RUNTIME_FILES = [
  "HARNESS.md",
  "scripts/harness/cli.mjs",
  "scripts/harness/lib/context-guard.mjs",
  "scripts/harness/lib/context.mjs",
  "scripts/harness/lib/control.mjs",
  "scripts/harness/lib/errors.mjs",
  "scripts/harness/lib/git.mjs",
  "scripts/harness/lib/state.mjs",
  "scripts/harness/lib/verification.mjs",
];

const PLATFORM_FILES = {
  codex: [
    ".codex/hooks.json",
    "scripts/harness/adapters/hook-core.mjs",
    "scripts/harness/adapters/pre-tool-use.mjs",
  ],
  claude: [
    ".claude/settings.json",
    "CLAUDE.md",
    "scripts/harness/adapters/hook-core.mjs",
    "scripts/harness/adapters/pre-tool-use.mjs",
  ],
  omp: [
    ".omp/extensions/harness-context-guard.js",
    "scripts/harness/adapters/hook-core.mjs",
  ],
};

const SHARED_HIGH_RISK_PATHS = [
  ".harness/config.json",
  "AGENTS.md",
  "HARNESS.md",
  "SPECS/architecture.md",
  "scripts/harness",
];

const PLATFORM_HIGH_RISK_PATHS = {
  codex: [".codex/hooks.json"],
  claude: [".claude/settings.json", "CLAUDE.md"],
  omp: [".omp/extensions"],
};

export class OverlayInstallError extends Error {
  constructor(code, message, { exitCode = 1, repair = null, facts = null } = {}) {
    super(message);
    this.name = "OverlayInstallError";
    this.code = code;
    this.exitCode = exitCode;
    this.repair = repair;
    this.facts = facts;
  }
}

function fail(code, message, options) {
  throw new OverlayInstallError(code, message, options);
}

function validatePlatform(platform) {
  if (!Object.hasOwn(PLATFORM_FILES, platform)) {
    fail("overlay-install.usage", `未知平台：${platform ?? "<missing>"}`, {
      exitCode: 2,
      repair: "--platform 只接受 codex、claude 或 omp",
    });
  }
}

async function gitRoot(target) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", target, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    return await realpath(stdout.trim());
  } catch {
    fail("overlay-install.target", `目标不是 Git 仓库：${target}`, {
      exitCode: 2,
      repair: "先在目标目录初始化或克隆 Git 仓库",
    });
  }
}

async function assertBaseline(target) {
  try {
    await execFileAsync("git", ["-C", target, "rev-parse", "--verify", "HEAD"], { encoding: "utf8" });
  } catch {
    fail("overlay-install.prerequisite", "目标 Git 仓库还没有 baseline commit", {
      repair: "先提交目标项目的可运行最小基线，再接入 Overlay",
    });
  }
}

async function existingRoot(path, kind) {
  try {
    return await realpath(resolve(path));
  } catch {
    fail(`overlay-install.${kind}`, `${kind === "source" ? "母仓库" : "目标"}路径不存在：${path}`, {
      exitCode: 2,
      repair: kind === "source" ? "从完整的 Overlay 母仓库运行安装器" : "--target 指向现有 Git 仓库根目录",
    });
  }
}

async function regularFile(root, path, label) {
  if (!safeRelativePath(path)) fail("overlay-install.prerequisite", `${label}路径越界：${path}`);
  const segments = path.split("/");
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") {
        fail("overlay-install.prerequisite", `缺少${label}：${path}`, {
          repair: "按 README 写入目标项目的真实事实后重试",
        });
      }
      throw error;
    }
    const final = index === segments.length - 1;
    if (metadata.isSymbolicLink() || (final ? !metadata.isFile() : !metadata.isDirectory())) {
      fail("overlay-install.prerequisite", `${label}必须是仓库内普通文件：${path}`, {
        repair: "移除 symlink 或非文件条目，改用仓库内普通文件",
      });
    }
  }
  return readFile(current, "utf8");
}

function coversPath(entries, path) {
  return entries.some((entry) => path === entry.replace(/\/$/, "") || path.startsWith(`${entry.replace(/\/$/, "")}/`));
}

async function validateProjectFacts(root, platform) {
  let config;
  try {
    config = validateConfig(JSON.parse(await regularFile(root, ".harness/config.json", "项目配置")));
  } catch (error) {
    if (error instanceof OverlayInstallError) throw error;
    fail("overlay-install.prerequisite", `项目配置无效：${error.message}`, {
      repair: "按 README 的 v2 schema 修正 .harness/config.json",
    });
  }
  const fullCommands = [
    ...config.commands.full.static,
    ...config.commands.full.test,
    ...config.commands.contracts,
    ...config.criticalUserPaths,
  ];
  if (fullCommands.length === 0) {
    fail("overlay-install.prerequisite", "Full 验证计划不能为空", {
      repair: "在 .harness/config.json 中登记至少一个真实 Full、契约或关键路径命令",
    });
  }
  const requiredHighRisk = [...SHARED_HIGH_RISK_PATHS, ...PLATFORM_HIGH_RISK_PATHS[platform]];
  const missingHighRisk = requiredHighRisk.filter((path) => !coversPath(config.risk.highRiskPaths, path));
  if (missingHighRisk.length > 0) {
    fail("overlay-install.prerequisite", `高风险路径未覆盖 Overlay 控制面：${missingHighRisk.join(", ")}`, {
      repair: "将缺少的控制面和平台 Adapter 路径加入 risk.highRiskPaths",
      facts: { missingHighRisk },
    });
  }

  const agents = await regularFile(root, "AGENTS.md", "Agent 指令");
  if (!agents.includes("scripts/harness/cli.mjs")) {
    fail("overlay-install.prerequisite", "AGENTS.md 尚未接入 Harness CLI", {
      repair: "将 README 中的最小 Harness 指令合并进目标仓库 AGENTS.md",
    });
  }
  const architecture = await regularFile(root, "SPECS/architecture.md", "项目架构");
  if (architecture.trim() === "") {
    fail("overlay-install.prerequisite", "SPECS/architecture.md 不能为空", {
      repair: "记录目标项目的真实架构、模块位置和验证事实",
    });
  }
  return config;
}

function safeRelativePath(path) {
  const normalized = normalize(path);
  return !isAbsolute(normalized) && normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

function containsAdapterCommand(value) {
  if (Array.isArray(value)) return value.some(containsAdapterCommand);
  if (value && typeof value === "object") {
    if (value.type === "command" && typeof value.command === "string") {
      return value.command.includes("scripts/harness/adapters/pre-tool-use.mjs");
    }
    return Object.values(value).some(containsAdapterCommand);
  }
  return false;
}

function preservesPlatformIntegration(path, content) {
  if (path === "CLAUDE.md") return content.toString("utf8").includes("@AGENTS.md");
  if (path !== ".codex/hooks.json" && path !== ".claude/settings.json") return false;
  try {
    const parsed = JSON.parse(content.toString("utf8"));
    return Array.isArray(parsed?.hooks?.PreToolUse) && containsAdapterCommand(parsed.hooks.PreToolUse);
  } catch {
    return false;
  }
}

async function preflightDestination(root, path, sourceContent) {
  if (!safeRelativePath(path)) fail("overlay-install.source", `发布清单路径越界：${path}`, { exitCode: 2 });
  const segments = path.split("/");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) return { status: "conflict", path };
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }

  const destination = join(root, path);
  try {
    const metadata = await lstat(destination);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return { status: "conflict", path };
    const existing = await readFile(destination);
    if (existing.equals(sourceContent)) return { status: "kept", path };
    return { status: preservesPlatformIntegration(path, existing) ? "preserved" : "conflict", path };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "create", path };
    throw error;
  }
}

async function loadPlan(sourceRoot, targetRoot, platform) {
  const paths = [...new Set([...RUNTIME_FILES, ...PLATFORM_FILES[platform]])].sort();
  const plan = [];
  for (const path of paths) {
    const source = join(sourceRoot, path);
    let metadata;
    try {
      metadata = await lstat(source);
    } catch (error) {
      if (error?.code === "ENOENT") {
        fail("overlay-install.source", `母仓库缺少发布文件：${path}`, {
          exitCode: 2,
          repair: "恢复母仓库文件并运行其 Full 测试",
        });
      }
      throw error;
    }
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      fail("overlay-install.source", `发布文件必须是普通文件：${path}`, { exitCode: 2 });
    }
    const content = await readFile(source);
    const destination = await preflightDestination(targetRoot, path, content);
    plan.push({ path, content, mode: metadata.mode & 0o777, status: destination.status });
  }
  const conflicts = plan.filter((entry) => entry.status === "conflict").map((entry) => entry.path);
  if (conflicts.length > 0) {
    fail("overlay-install.conflict", `拒绝覆盖目标仓库已有条目：${conflicts.join(", ")}`, {
      repair: "先人工审查并合并冲突文件；安装器不会覆盖或删除目标内容",
      facts: { conflicts },
    });
  }
  return plan;
}

async function applyPlan(root, plan) {
  const created = [];
  try {
    for (const entry of plan) {
      if (entry.status !== "create") continue;
      const destination = join(root, entry.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, entry.content, { flag: "wx", mode: entry.mode });
      created.push(entry.path);
      await chmod(destination, entry.mode);
    }
  } catch (error) {
    for (const path of created.reverse()) await rm(join(root, path), { force: true });
    fail("overlay-install.write", `安装写入失败：${error.message}`, {
      repair: "修复目标目录权限或并发写入后重试；已创建文件已回收",
    });
  }
  return created.sort();
}

export async function installOverlay({ sourceRoot, targetRoot, platform }) {
  if (typeof sourceRoot !== "string" || typeof targetRoot !== "string") {
    fail("overlay-install.usage", "sourceRoot 和 targetRoot 必须是路径", { exitCode: 2 });
  }
  validatePlatform(platform);
  const source = await existingRoot(sourceRoot, "source");
  const requestedTarget = await existingRoot(targetRoot, "target");
  const target = await gitRoot(requestedTarget);
  if (target !== requestedTarget) {
    fail("overlay-install.target", `--target 必须指向 Git 仓库根目录：${target}`, {
      exitCode: 2,
      repair: `改用 --target ${target}`,
    });
  }
  if (source === target) {
    fail("overlay-install.target", "不能把 Overlay 安装回母仓库自身", {
      exitCode: 2,
      repair: "--target 指向另一个业务 Git 仓库",
    });
  }
  await assertBaseline(target);
  await validateProjectFacts(target, platform);
  const plan = await loadPlan(source, target, platform);
  const created = await applyPlan(target, plan);
  return {
    target,
    platform,
    created,
    kept: plan.filter((entry) => entry.status === "kept").map((entry) => entry.path).sort(),
    preserved: plan.filter((entry) => entry.status === "preserved").map((entry) => entry.path).sort(),
    next: [
      "审查并提交项目事实、Overlay 运行时和平台 Adapter",
      "在干净工作区运行 node scripts/harness/cli.mjs status --json",
    ],
  };
}
