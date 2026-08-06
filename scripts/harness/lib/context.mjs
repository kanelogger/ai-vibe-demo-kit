import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { E } from "./errors.mjs";
import { repoRoot } from "./git.mjs";

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw E.USAGE(`${label} 必须是字符串数组`);
  }
  return value.map((entry) => entry.trim());
}

function commandGroup(value, label) {
  if (value === undefined) return { static: [], test: [] };
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw E.USAGE(`${label} 必须是 object`);
  return {
    static: stringArray(value.static ?? [], `${label}.static`),
    test: stringArray(value.test ?? [], `${label}.test`),
  };
}

export function validateConfig(value) {
  if (value?.version !== 2) throw E.USAGE(".harness/config.json version 必须是 2");
  if (typeof value.project?.name !== "string" || value.project.name.trim() === "") throw E.USAGE("project.name 必须非空");
  if (typeof value.project?.summary !== "string" || value.project.summary.trim() === "") throw E.USAGE("project.summary 必须非空");
  const config = {
    version: 2,
    project: {
      name: value.project.name.trim(),
      summary: value.project.summary.trim(),
      hasUserInterface: value.project.hasUserInterface === true,
    },
    contextIndex: { codeRoots: stringArray(value.contextIndex?.codeRoots ?? [], "contextIndex.codeRoots") },
    risk: { highRiskPaths: stringArray(value.risk?.highRiskPaths ?? [], "risk.highRiskPaths") },
    commands: {
      quick: commandGroup(value.commands?.quick, "commands.quick"),
      full: commandGroup(value.commands?.full, "commands.full"),
      contracts: stringArray(value.commands?.contracts ?? [], "commands.contracts"),
    },
    criticalUserPaths: stringArray(value.criticalUserPaths ?? [], "criticalUserPaths"),
    verification: {
      commandTimeoutMs: value.verification?.commandTimeoutMs ?? 600_000,
    },
    recovery: {
      testDataCleanup: stringArray(value.recovery?.testDataCleanup ?? [], "recovery.testDataCleanup"),
      rollback: stringArray(value.recovery?.rollback ?? [], "recovery.rollback"),
    },
  };
  if (!Number.isInteger(config.verification.commandTimeoutMs) || config.verification.commandTimeoutMs <= 0) {
    throw E.USAGE("verification.commandTimeoutMs 必须是正整数");
  }
  return config;
}

export async function resolveContext({ root = null } = {}) {
  const resolvedRoot = await repoRoot(resolve(root ?? process.cwd()));
  const path = join(resolvedRoot, ".harness", "config.json");
  let raw;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw E.USAGE("缺少 .harness/config.json");
    if (error instanceof SyntaxError) throw E.USAGE(".harness/config.json 不是合法 JSON");
    throw error;
  }
  return { root: resolvedRoot, config: validateConfig(raw) };
}
