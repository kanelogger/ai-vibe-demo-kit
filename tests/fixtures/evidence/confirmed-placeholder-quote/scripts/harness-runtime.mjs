#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const VERIFICATION_REPORT_VERSION = 1;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.trim() === "" || isAbsolute(value)) return false;
  const normalized = normalize(value);
  return normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

export function verificationSettings(config) {
  const settings = config && typeof config.verification === "object" && config.verification !== null ? config.verification : {};
  return {
    reportPath: typeof settings.reportPath === "string" ? settings.reportPath : ".harness/verification-report.json",
    maxAgeHours: Number.isFinite(settings.maxAgeHours) ? settings.maxAgeHours : 24,
    commandTimeoutMs: Number.isFinite(settings.commandTimeoutMs) ? settings.commandTimeoutMs : 600_000,
    workspaceFingerprint: settings.workspaceFingerprint === "none" ? "none" : "git",
  };
}

export function commandPlan(config, profile, hasContractSources) {
  const commands = config.commands ?? {};
  const quick = commands.quick ?? {};
  const full = commands.full ?? {};
  const select = (kind) => {
    const quickCommands = Array.isArray(quick[kind]) ? quick[kind] : [];
    const fullCommands = Array.isArray(full[kind]) ? full[kind] : [];
    return profile === "full" && fullCommands.length > 0 ? fullCommands : quickCommands;
  };
  return [
    ...select("static").map((command) => ({ kind: "static", command })),
    ...select("test").map((command) => ({ kind: "test", command })),
    ...(hasContractSources && Array.isArray(commands.contracts)
      ? commands.contracts.map((command) => ({ kind: "contract", command }))
      : []),
  ];
}

function isExcluded(path, exclusions) {
  return exclusions.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

export async function createWorkspaceFingerprint(root, exclusions = []) {
  const normalizedExclusions = exclusions
    .filter(isSafeRelativePath)
    .map((path) => path.split(sep).join("/"));
  const pathspecs = ["--", ".", ...normalizedExclusions.map((path) => `:(exclude)${path}`)];
  const options = { cwd: root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 };
  const [{ stdout: head }, { stdout: diff }, { stdout: untracked }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], options),
    execFileAsync("git", ["diff", "--binary", "HEAD", ...pathspecs], options),
    execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], options),
  ]);

  const hash = createHash("sha256");
  hash.update(head);
  hash.update(Buffer.from([0]));
  hash.update(diff);
  const untrackedPaths = untracked
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((path) => !isExcluded(path, normalizedExclusions))
    .sort();
  for (const path of untrackedPaths) {
    const full = normalize(`${root}/${path}`);
    const rel = relative(root, full);
    if (!isSafeRelativePath(rel)) throw new Error(`Unsafe untracked path: ${path}`);
    hash.update(path);
    hash.update(Buffer.from([0]));
    hash.update(await readFile(full));
    hash.update(Buffer.from([0]));
  }
  return {
    head: head.toString("utf8").trim(),
    sha256: hash.digest("hex"),
  };
}
