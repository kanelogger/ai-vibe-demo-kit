import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadHarnessManifest } from "../shared/manifest.mjs";
import { validateWorkflow } from "./validation/index.mjs";

const issue = (code, path, message, facts = null) => ({ code, path, message, facts });
const DEFAULT_WORKFLOW = "source/workflows/workflow-template.json";
const STAGE_RESULT_TEMPLATE = "source/workflows/stage-result-template.json";
const VERIFICATION_REPORT_TEMPLATE = "source/workflows/verification-report-template.json";

async function readJson(root, path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

export async function inspectRuntimeReadiness({ root, allowLegacy = false }) {
  const errors = [];
  const warnings = [];
  let runtimeReady = false;
  let completionEvidenceToolingReady = false;
  let manifest = null;
  try { manifest = await loadHarnessManifest(root, { allowLegacy }); }
  catch (error) { errors.push(issue(error.code ?? "E_MANIFEST_INVALID", ".harness/manifest.json", error.message)); }

  if (manifest) {
    try {
      const workflow = await readJson(root, DEFAULT_WORKFLOW);
      const report = await validateWorkflow(workflow, { root, workflowPath: DEFAULT_WORKFLOW });
      warnings.push(...report.warnings);
      if (!report.valid) errors.push(issue("E_RUNTIME_DAMAGED", DEFAULT_WORKFLOW, "default Workflow or Required Skill is invalid", report));
      else runtimeReady = true;
    } catch (error) {
      errors.push(issue(error.code ?? "E_RUNTIME_DAMAGED", DEFAULT_WORKFLOW, error.message));
    }

    try {
      const stageTemplate = await readJson(root, STAGE_RESULT_TEMPLATE);
      const reportTemplate = await readJson(root, VERIFICATION_REPORT_TEMPLATE);
      completionEvidenceToolingReady = manifest.schemaVersion === 2
        && manifest.capabilities.commands.includes("check-result")
        && manifest.capabilities.contracts.includes("verification-report/v1")
        && Array.isArray(stageTemplate.conditions)
        && Array.isArray(stageTemplate.skills)
        && Array.isArray(stageTemplate.artifacts)
        && reportTemplate.schemaVersion === 1
        && Array.isArray(reportTemplate.conditions)
        && Array.isArray(reportTemplate.checks)
        && Array.isArray(reportTemplate.cleanup);
    } catch {
      completionEvidenceToolingReady = false;
    }
    if (!completionEvidenceToolingReady && manifest.schemaVersion === 2) errors.push(issue("E_COMPLETION_TOOLING", null, "completion Evidence tooling is incomplete"));
  }

  return { runtimeReady, completionEvidenceToolingReady, warnings, errors };
}
