import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { firstSymlinkInPath } from "../shared/path-safety.mjs";
import { inspectRuntimeReadiness } from "../runtime/readiness.mjs";
import { validateEnvironmentManifest } from "../runtime/validation/index.mjs";

const issue = (code, path, message, facts = null) => ({ code, path, message, facts });

export function runtimeLayoutOutdated(targets, ledger) {
  const expectedByPath = new Map(targets.map((entry) => [entry.targetPath, entry.kind]));
  const ledgerByPath = new Map(ledger.files.map((entry) => [entry.path, entry]));
  return targets.some((entry) => ledgerByPath.get(entry.targetPath)?.kind !== entry.kind)
    || ledger.files.some((entry) => entry.state !== "orphaned" && expectedByPath.get(entry.path) !== entry.kind);
}

async function regularFile(root, path) {
  const target = join(root, path);
  try {
    if (await firstSymlinkInPath(root, target)) return false;
    return (await lstat(target)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function inspectDoctorReadiness({ root, runtimeFilesHealthy, allowLegacy }) {
  const readiness = { runtimeReady: false, governanceReady: false, completionEvidenceToolingReady: false };
  const warnings = [];
  const errors = [];

  const inspected = await inspectRuntimeReadiness({ root, allowLegacy });
  readiness.runtimeReady = runtimeFilesHealthy && inspected.runtimeReady;
  readiness.completionEvidenceToolingReady = inspected.completionEvidenceToolingReady;
  warnings.push(...inspected.warnings);
  errors.push(...inspected.errors);

  if (await regularFile(root, "AGENTS.md") && await regularFile(root, "AI_ENVIRONMENT.md")) {
    const content = await readFile(join(root, "AI_ENVIRONMENT.md"), "utf8");
    const report = validateEnvironmentManifest(content);
    const hasUnknown = /\|\s*`?unknown`?\s*\|/i.test(content);
    readiness.governanceReady = report.valid && !hasUnknown;
    if (!readiness.governanceReady) warnings.push(issue("W_GOVERNANCE_INCOMPLETE", "AI_ENVIRONMENT.md", "environment governance contains unknown or incomplete facts", { ...report, hasUnknown }));
  } else {
    warnings.push(issue("W_GOVERNANCE_INCOMPLETE", null, "effective AGENTS.md and AI_ENVIRONMENT.md are required for Governance readiness"));
  }

  return { readiness, warnings, errors };
}
