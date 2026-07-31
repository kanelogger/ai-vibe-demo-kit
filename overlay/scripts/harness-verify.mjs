#!/usr/bin/env node
// harness-verify.mjs — 执行项目验证命令、关键用户路径和测试数据清理，生成机器可审计报告。

import { exec } from "node:child_process";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  VERIFICATION_REPORT_VERSION,
  commandPlan,
  createWorkspaceFingerprint,
  isSafeRelativePath,
  sha256,
  verificationSettings,
} from "./harness-runtime.mjs";

const execAsync = promisify(exec);
const CONTRACT_SOURCES = ["SPECS/API.md", "SPECS/DATABASE.md"];
const REPORT_FIELDS = [
  "Machine report",
  "Commands",
  "Results",
  "Executed at",
  "User-path evidence",
  "Cleanup performed",
  "Rollback steps",
];

function fail(id, path, problem, repair, code = 2) {
  process.stdout.write(`ERROR ${id} ${path}: ${problem}\n`);
  process.stdout.write(`REPAIR: ${repair}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = [...argv];
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const rootIndex = args.indexOf("--root");
  if (rootIndex !== -1) {
    if (!args[rootIndex + 1]) fail("verify.usage", ".", "--root requires a directory.", "Pass --root <project-directory>.");
    root = resolve(args[rootIndex + 1]);
    args.splice(rootIndex, 2);
  }
  const sprintIndex = args.indexOf("--sprint");
  const sprint = sprintIndex === -1 ? "tasks/sprint-01.md" : args[sprintIndex + 1];
  if (sprintIndex !== -1) args.splice(sprintIndex, 2);
  const profile = args.shift();
  if (!profile || !["quick", "full"].includes(profile) || args.length > 0 || !isSafeRelativePath(sprint)) {
    fail(
      "verify.usage",
      ".",
      "Expected quick|full and a safe optional --sprint path.",
      "Run: node scripts/harness-verify.mjs full --sprint tasks/sprint-01.md",
    );
  }
  return { profile, root, sprint };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function trimOutput(value) {
  const text = String(value ?? "").trim();
  return text.length > 16_384 ? text.slice(-16_384) : text;
}

async function runCommand(root, timeout, item) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  process.stdout.write(`RUN ${item.kind} ${item.command}\n`);
  try {
    const result = await execAsync(item.command, {
      cwd: root,
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    });
    process.stdout.write(`PASS ${item.kind} ${item.command}\n`);
    return {
      ...item,
      status: "passed",
      exitCode: 0,
      startedAt,
      durationMs: Date.now() - started,
      stdout: trimOutput(result.stdout),
      stderr: trimOutput(result.stderr),
    };
  } catch (error) {
    process.stdout.write(`FAIL ${item.kind} ${item.command}\n`);
    return {
      ...item,
      status: "failed",
      exitCode: Number.isInteger(error?.code) ? error.code : null,
      startedAt,
      durationMs: Date.now() - started,
      stdout: trimOutput(error?.stdout),
      stderr: trimOutput(error?.stderr || error?.message),
    };
  }
}

async function verifyUserPath(root, timeout, entry) {
  const verify = entry.verify;
  if (verify.mode === "command") {
    const result = await runCommand(root, timeout, { kind: `user-path:${entry.id}`, command: verify.command });
    return { id: entry.id, description: entry.description, verify, ...result };
  }
  const evidencePath = verify.evidence;
  const full = join(root, evidencePath);
  if (!(await exists(full))) {
    process.stdout.write(`FAIL user-path:${entry.id} missing evidence ${evidencePath}\n`);
    return { id: entry.id, description: entry.description, verify, status: "failed", problem: `Missing evidence: ${evidencePath}` };
  }
  const evidence = await readFile(full);
  const status = evidence.length > 0 ? "passed" : "failed";
  process.stdout.write(`${status === "passed" ? "PASS" : "FAIL"} user-path:${entry.id} ${evidencePath}\n`);
  return {
    id: entry.id,
    description: entry.description,
    verify,
    status,
    evidenceBytes: evidence.length,
    evidenceSha256: sha256(evidence),
  };
}

function replaceReportField(content, label, value) {
  const pattern = new RegExp(`^- ${label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}:.*$`, "m");
  if (!pattern.test(content)) throw new Error(`Sprint Verification Report is missing "- ${label}:".`);
  return content.replace(pattern, `- ${label}: ${value}`);
}

async function updateSprint(root, sprint, report) {
  const path = join(root, sprint);
  let content = await readFile(path, "utf8");
  if (!/^##\s+Verification Report/m.test(content)) throw new Error("Sprint document has no Verification Report section.");
  const values = {
    "Machine report": `${report.reportPath}#${report.reportId}`,
    Commands: report.checks.map((item) => item.command).join("; ") || "none",
    Results: report.status,
    "Executed at": report.generatedAt,
    "User-path evidence": report.criticalUserPaths.map((item) => `${item.id}=${item.status}`).join("; ") || "none registered",
    "Cleanup performed": report.cleanup.map((item) => item.mode === "none" ? `none: ${item.reason}` : `${item.command}=${item.status}`).join("; "),
    "Rollback steps": report.rollback.join("; "),
  };
  for (const label of REPORT_FIELDS) content = replaceReportField(content, label, values[label]);
  await writeFile(path, content, "utf8");
}

async function writeReport(root, reportPath, report) {
  const full = join(root, reportPath);
  await mkdir(dirname(full), { recursive: true });
  const temporary = `${full}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporary, full);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function hasValidUserPath(entry) {
  if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.description) || !isRecord(entry.verify)) return false;
  if (entry.verify.mode === "command") return isNonEmptyString(entry.verify.command);
  return entry.verify.mode === "manual" && isNonEmptyString(entry.verify.instructions) && isSafeRelativePath(entry.verify.evidence);
}

function hasValidCleanup(entry) {
  return isRecord(entry) && ((entry.mode === "command" && isNonEmptyString(entry.command)) || (entry.mode === "none" && isNonEmptyString(entry.reason)));
}

async function main() {
  const { profile, root, sprint } = parseArgs(process.argv.slice(2));
  const configPath = join(root, ".harness", "config.json");
  const configRaw = await readFile(configPath, "utf8");
  const config = JSON.parse(configRaw);
  const state = JSON.parse(await readFile(join(root, "workflow-state.json"), "utf8"));
  if (state.stage !== "implementation-ready") {
    fail("verify.stage-not-ready", "workflow-state.json", `Verification requires implementation-ready; current stage is "${state.stage}".`, "Complete the implementation-ready gate before running verification.", 1);
  }
  if (!(await exists(join(root, sprint)))) {
    fail("verify.sprint-missing", sprint, "Sprint document is missing.", "Create the sprint document from tasks/sprint.template.md before verification.", 1);
  }

  const settings = verificationSettings(config);
  const rawVerification = isRecord(config.verification) ? config.verification : {};
  const paths = config.criticalUserPaths;
  const cleanupSteps = config.recovery?.testDataCleanup;
  if (
    !isSafeRelativePath(settings.reportPath) ||
    settings.maxAgeHours <= 0 ||
    settings.commandTimeoutMs <= 0 ||
    !["git", "none"].includes(rawVerification.workspaceFingerprint) ||
    !Array.isArray(paths) ||
    !paths.every(hasValidUserPath) ||
    new Set(paths.map((entry) => entry.id)).size !== paths.length ||
    !Array.isArray(cleanupSteps) ||
    cleanupSteps.length === 0 ||
    !cleanupSteps.every(hasValidCleanup) ||
    !Array.isArray(config.recovery?.rollback) ||
    config.recovery.rollback.length === 0 ||
    !config.recovery.rollback.every(isNonEmptyString) ||
    (settings.workspaceFingerprint === "none" && !isNonEmptyString(config.notes))
  ) {
    fail("verify.config-invalid", ".harness/config.json", "verification, criticalUserPaths or recovery settings are invalid.", "Run node scripts/harness-check.mjs evidence and repair every configuration error before execution.");
  }
  const hasContractSources = (await Promise.all(CONTRACT_SOURCES.map((path) => exists(join(root, path))))).some(Boolean);
  const plan = commandPlan(config, profile, hasContractSources);
  if (!plan.some((item) => item.kind === "static") || !plan.some((item) => item.kind === "test") || !plan.every((item) => isNonEmptyString(item.command))) {
    fail("verify.commands-missing", ".harness/config.json", "The selected profile has invalid or missing static/test commands.", "Register executable string commands for this profile.");
  }

  const checks = [];
  for (const item of plan) checks.push(await runCommand(root, settings.commandTimeoutMs, item));

  const criticalUserPaths = [];
  for (const entry of paths) {
    criticalUserPaths.push(await verifyUserPath(root, settings.commandTimeoutMs, entry));
  }

  const cleanup = [];
  for (const entry of cleanupSteps) {
    if (entry.mode === "none") cleanup.push({ ...entry, status: "passed" });
    else cleanup.push({ ...entry, ...(await runCommand(root, settings.commandTimeoutMs, { kind: "cleanup", command: entry.command })) });
  }

  const exclusions = [settings.reportPath, sprint, "workflow/acceptance.md", "workflow-state.json"];
  let workspace = null;
  if (settings.workspaceFingerprint === "git") {
    try {
      workspace = await createWorkspaceFingerprint(root, exclusions);
    } catch (error) {
      fail("verify.git-fingerprint-failed", ".", error instanceof Error ? error.message : String(error), "Run verification inside the configured Git repository, or explicitly configure workspaceFingerprint as none with a recorded reason.");
    }
  }

  const passed = [...checks, ...criticalUserPaths, ...cleanup].every((item) => item.status === "passed");
  const generatedAt = new Date().toISOString();
  const report = {
    version: VERIFICATION_REPORT_VERSION,
    reportId: `verify-${generatedAt.replace(/[^0-9]/g, "")}`,
    reportPath: settings.reportPath,
    generatedAt,
    project: config.project?.name ?? "",
    sourceStage: state.stage,
    sprint,
    profile,
    configSha256: sha256(configRaw),
    workspace,
    status: passed ? "passed" : "failed",
    checks,
    criticalUserPaths,
    cleanup,
    rollback: config.recovery?.rollback ?? [],
  };
  await writeReport(root, settings.reportPath, report);
  await updateSprint(root, sprint, report);
  process.stdout.write(`REPORT ${settings.reportPath} ${report.status}\n`);
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`ERROR verify.internal: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(2);
});
