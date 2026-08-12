import { lstat, readFile } from "node:fs/promises";
import { firstSymlinkInPath, resolveInside } from "../../shared/path-safety.mjs";

const CONDITION_STATUSES = new Set(["passed", "failed", "not-applicable"]);
const SKILL_STATUSES = new Set(["succeeded", "failed", "skipped"]);
const CHECK_STATUSES = new Set(["passed", "failed", "skipped"]);
const CHECK_KINDS = new Set(["automated", "critical-path", "manual"]);
const CLEANUP_STATUSES = new Set(["removed", "not-created", "retained"]);
const CHANGE_KINDS = new Set(["added", "modified", "deleted"]);
const TEST_IMPACT_CLASSIFICATIONS = new Set(["behavioral", "non-behavioral"]);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const issue = (code, path, message) => ({ code, path, message });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";

function duplicates(values) {
  const seen = new Set();
  const result = new Set();
  for (const value of values) {
    if (seen.has(value)) result.add(value);
    seen.add(value);
  }
  return result;
}

function externalUri(value) {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return nonEmpty(parsed.protocol) && (nonEmpty(parsed.hostname) || nonEmpty(parsed.pathname));
  } catch {
    return null;
  }
}

async function validateFileOrUri(root, value, errors, { path, missingCode, uriCode }) {
  if (!nonEmpty(value)) {
    errors.push(issue(uriCode, path, "reference must be a non-empty path or external URI"));
    return;
  }
  if (/^file:\/\//i.test(value)) {
    errors.push(issue(uriCode, path, "file:// references are not accepted; use a repository-relative path"));
    return;
  }
  const external = externalUri(value);
  if (external === true) return;
  if (external === null) {
    errors.push(issue(uriCode, path, "external URI is malformed"));
    return;
  }
  if (!root) return;
  const target = resolveInside(root, value);
  if (!target) {
    errors.push(issue("E_PATH_OUTSIDE", path, "reference path must stay inside the repository"));
    return;
  }
  if (await firstSymlinkInPath(root, target)) {
    errors.push(issue("E_PATH_SYMLINK", path, "reference path must not use symlinks"));
    return;
  }
  try {
    const stat = await lstat(target);
    if (!stat.isFile()) errors.push(issue(missingCode, path, "reference must be a file"));
  } catch (error) {
    errors.push(issue(missingCode, path, error.code === "ENOENT" ? "referenced file does not exist" : error.message));
  }
}

async function readJsonPath(root, path, errors, code = "E_REFERENCE_INVALID") {
  const target = resolveInside(root, path);
  if (!target) {
    errors.push(issue("E_PATH_OUTSIDE", path, "path must stay inside the repository"));
    return null;
  }
  if (await firstSymlinkInPath(root, target)) {
    errors.push(issue("E_PATH_SYMLINK", path, "symlink paths are not accepted"));
    return null;
  }
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    errors.push(issue(code, path, error.code === "ENOENT" ? "referenced file does not exist" : `invalid JSON: ${error.message}`));
    return null;
  }
}

async function validateVerificationReport(root, path, stageConditions, errors) {
  const report = await readJsonPath(root, path, errors, "E_VERIFICATION_REPORT");
  if (!report) return null;
  if (report.schemaVersion !== 1 || !nonEmpty(report.summary) || !Array.isArray(report.conditions) || !Array.isArray(report.checks) || !Array.isArray(report.cleanup) || report.cleanup.length === 0) {
    errors.push(issue("E_VERIFICATION_REPORT", path, "verification-report/v1 requires schemaVersion 1, summary, conditions, checks and non-empty cleanup"));
    return null;
  }
  const reportConditions = new Map();
  for (const duplicate of duplicates(report.conditions.map((entry) => entry?.id))) errors.push(issue("E_VERIFICATION_CONDITION", path, `duplicate verification condition: ${duplicate}`));
  for (const [index, condition] of report.conditions.entries()) {
    const conditionPath = `${path}.conditions.${index}`;
    if (!object(condition) || !nonEmpty(condition.id) || !ID.test(condition.id) || !CONDITION_STATUSES.has(condition.status) || !Array.isArray(condition.checkRefs) || !Array.isArray(condition.cleanupRefs) || !Array.isArray(condition.evidenceRefs)) {
      errors.push(issue("E_VERIFICATION_CONDITION", conditionPath, "verification condition requires id, status, checkRefs, cleanupRefs and evidenceRefs"));
      continue;
    }
    if (condition.status === "passed" && condition.checkRefs.length + condition.cleanupRefs.length + condition.evidenceRefs.length === 0) errors.push(issue("E_VERIFICATION_CONDITION", conditionPath, "passed verification condition requires referenced checks, cleanup or evidence"));
    if (condition.status !== "passed" && !nonEmpty(condition.reason)) errors.push(issue("E_VERIFICATION_CONDITION", conditionPath, "failed or not-applicable verification condition requires a reason"));
    for (const [evidenceIndex, ref] of condition.evidenceRefs.entries()) {
      await validateFileOrUri(root, ref, errors, { path: `${conditionPath}.evidenceRefs.${evidenceIndex}`, missingCode: "E_EVIDENCE_MISSING", uriCode: "E_EVIDENCE_URI" });
    }
    reportConditions.set(condition.id, condition);
  }
  const stageConditionMap = new Map(stageConditions.map((entry) => [entry?.id, entry]));
  for (const [id, condition] of stageConditionMap) {
    const reported = reportConditions.get(id);
    if (!reported || reported.status !== condition.status) errors.push(issue("E_VERIFICATION_CONDITION", path, `verification condition must match stage result: ${id}`));
  }
  for (const id of reportConditions.keys()) if (!stageConditionMap.has(id)) errors.push(issue("E_VERIFICATION_CONDITION", path, `verification report contains an unknown stage condition: ${id}`));

  const checks = new Map();
  for (const duplicate of duplicates(report.checks.map((entry) => entry?.id))) errors.push(issue("E_VERIFICATION_CHECK", path, `duplicate verification check: ${duplicate}`));
  for (const [index, check] of report.checks.entries()) {
    const checkPath = `${path}.checks.${index}`;
    if (!object(check) || !nonEmpty(check.id) || !ID.test(check.id) || !CHECK_KINDS.has(check.kind) || !CHECK_STATUSES.has(check.status) || !Array.isArray(check.evidenceRefs)) {
      errors.push(issue("E_VERIFICATION_CHECK", checkPath, "verification check requires id, kind, status and evidenceRefs"));
      continue;
    }
    if (check.kind === "automated" && !nonEmpty(check.command)) errors.push(issue("E_VERIFICATION_CHECK", checkPath, "automated verification check requires a command"));
    if (check.status !== "skipped" && !Number.isInteger(check.exitCode)) errors.push(issue("E_VERIFICATION_CHECK", checkPath, "executed verification check requires an integer exitCode"));
    if (check.status === "passed" && check.exitCode !== 0) errors.push(issue("E_VERIFICATION_CHECK", checkPath, "passed verification check requires exitCode 0"));
    if (check.status === "passed" && check.evidenceRefs.length === 0) errors.push(issue("E_VERIFICATION_CHECK", checkPath, "passed verification check requires evidenceRefs"));
    if (check.status !== "passed" && !nonEmpty(check.reason)) errors.push(issue("E_VERIFICATION_CHECK", checkPath, "failed or skipped verification check requires a reason"));
    for (const [evidenceIndex, ref] of check.evidenceRefs.entries()) {
      await validateFileOrUri(root, ref, errors, { path: `${checkPath}.evidenceRefs.${evidenceIndex}`, missingCode: "E_EVIDENCE_MISSING", uriCode: "E_EVIDENCE_URI" });
    }
    checks.set(check.id, check);
  }
  for (const condition of reportConditions.values()) {
    for (const ref of condition.checkRefs ?? []) {
      const check = checks.get(ref);
      if (!check) errors.push(issue("E_VERIFICATION_CHECK_REF", path, `verification condition references an unknown check: ${ref}`));
      else if (condition.status === "passed" && check.status !== "passed") errors.push(issue("E_VERIFICATION_CONDITION", path, `passed verification condition references a non-passing check: ${ref}`));
    }
  }

  const cleanup = new Map();
  for (const duplicate of duplicates(report.cleanup.map((entry) => entry?.id))) errors.push(issue("E_VERIFICATION_CLEANUP", path, `duplicate cleanup item: ${duplicate}`));
  for (const [index, item] of report.cleanup.entries()) {
    const cleanupPath = `${path}.cleanup.${index}`;
    const evidenceRefs = Array.isArray(item?.evidenceRefs) ? item.evidenceRefs : [];
    if (!object(item) || !nonEmpty(item.id) || !ID.test(item.id) || !nonEmpty(item.resource) || !nonEmpty(item.action) || !CLEANUP_STATUSES.has(item.status)) {
      errors.push(issue("E_VERIFICATION_CLEANUP", cleanupPath, "cleanup item requires id, resource, action and status"));
      continue;
    }
    if (item.status === "removed" && evidenceRefs.length === 0) errors.push(issue("E_VERIFICATION_CLEANUP", cleanupPath, "removed cleanup item requires evidenceRefs"));
    if (item.status === "retained" && !nonEmpty(item.reason)) errors.push(issue("E_VERIFICATION_CLEANUP", cleanupPath, "retained cleanup item requires a reason"));
    if (item.status === "not-created" && evidenceRefs.length === 0 && !nonEmpty(item.reason)) errors.push(issue("E_VERIFICATION_CLEANUP", cleanupPath, "not-created cleanup item requires evidenceRefs or a reason"));
    for (const [evidenceIndex, ref] of evidenceRefs.entries()) {
      await validateFileOrUri(root, ref, errors, { path: `${cleanupPath}.evidenceRefs.${evidenceIndex}`, missingCode: "E_EVIDENCE_MISSING", uriCode: "E_EVIDENCE_URI" });
    }
    cleanup.set(item.id, item);
  }
  for (const condition of reportConditions.values()) {
    for (const ref of condition.cleanupRefs ?? []) {
      const item = cleanup.get(ref);
      if (!item) errors.push(issue("E_VERIFICATION_CLEANUP_REF", path, `verification condition references an unknown cleanup item: ${ref}`));
      else if (condition.status === "passed" && !new Set(["removed", "not-created"]).has(item.status)) errors.push(issue("E_VERIFICATION_CONDITION", path, `passed verification condition references incomplete cleanup: ${ref}`));
    }
  }
  return report;
}

function safeChangePath(value) {
  return nonEmpty(value) && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..");
}

async function validateTestImpact(root, path, errors) {
  const impact = await readJsonPath(root, path, errors, "E_TEST_IMPACT");
  if (!impact) return null;
  if (impact.schemaVersion !== 1 || !nonEmpty(impact.summary) || !TEST_IMPACT_CLASSIFICATIONS.has(impact.classification) || !Array.isArray(impact.sourceChanges) || !Array.isArray(impact.testChanges) || !Array.isArray(impact.checks)) {
    errors.push(issue("E_TEST_IMPACT", path, "test-impact/v1 requires schemaVersion 1, summary, classification, sourceChanges, testChanges and checks"));
    return null;
  }
  for (const [group, changes] of [["sourceChanges", impact.sourceChanges], ["testChanges", impact.testChanges]]) {
    for (const [index, change] of changes.entries()) {
      if (!object(change) || !safeChangePath(change.path) || !CHANGE_KINDS.has(change.change)) errors.push(issue("E_TEST_IMPACT_CHANGE", `${path}.${group}.${index}`, "change requires a safe repository-relative path and added, modified or deleted change kind"));
    }
  }
  let passedChecks = 0;
  for (const [index, check] of impact.checks.entries()) {
    const checkPath = `${path}.checks.${index}`;
    const evidenceRefs = Array.isArray(check?.evidenceRefs) ? check.evidenceRefs : [];
    if (!object(check) || check.kind !== "automated" || !nonEmpty(check.command) || !CHECK_STATUSES.has(check.status) || !Array.isArray(check.evidenceRefs)) {
      errors.push(issue("E_TEST_IMPACT_CHECK", checkPath, "check requires kind automated, command, status and evidenceRefs"));
      continue;
    }
    if (check.status !== "skipped" && !Number.isInteger(check.exitCode)) errors.push(issue("E_TEST_IMPACT_CHECK", checkPath, "executed check requires an integer exitCode"));
    if (check.status === "passed") {
      passedChecks += 1;
      if (check.exitCode !== 0 || evidenceRefs.length === 0) errors.push(issue("E_TEST_IMPACT_CHECK", checkPath, "passed check requires exitCode 0 and evidenceRefs"));
    } else if (!nonEmpty(check.reason)) errors.push(issue("E_TEST_IMPACT_CHECK", checkPath, "failed or skipped check requires a reason"));
    for (const [evidenceIndex, ref] of evidenceRefs.entries()) await validateFileOrUri(root, ref, errors, { path: `${checkPath}.evidenceRefs.${evidenceIndex}`, missingCode: "E_EVIDENCE_MISSING", uriCode: "E_EVIDENCE_URI" });
  }
  if (impact.classification === "behavioral") {
    if (impact.sourceChanges.length === 0 || impact.testChanges.length === 0) errors.push(issue("E_TEST_IMPACT_BEHAVIORAL", path, "behavioral impact requires non-empty sourceChanges and testChanges"));
    if (passedChecks === 0) errors.push(issue("E_TEST_IMPACT_BEHAVIORAL", path, "behavioral impact requires at least one passed automated check"));
  } else if (!nonEmpty(impact.reason)) errors.push(issue("E_TEST_IMPACT_REASON", path, "non-behavioral impact requires a reason"));
  return impact;
}

export async function validateStageResult(workflow, stageId, result, { root } = {}) {
  const errors = [];
  const warnings = [];
  const policyFailures = [];
  const stage = workflow?.stages?.[stageId];
  if (!stage) return { valid: false, errors: [issue("E_STAGE_UNKNOWN", "stage", "current stage is not declared")], warnings, policyFailures };
  if (!object(result) || !nonEmpty(result.summary)) errors.push(issue("E_RESULT_INVALID", "$", "stage result requires a summary"));
  if (!stage.outcomes.includes(result?.outcome)) errors.push(issue("E_RESULT_OUTCOME", "outcome", "result outcome is not declared by the stage"));

  const conditionEntries = Array.isArray(result?.conditions) ? result.conditions : [];
  const conditionMap = new Map(conditionEntries.map((entry) => [entry?.id, entry]));
  for (const duplicate of duplicates(conditionEntries.map((entry) => entry?.id))) errors.push(issue("E_RESULT_CONDITION_DUPLICATE", "conditions", `duplicate condition result: ${duplicate}`));
  const declaredConditions = new Map((stage.exitConditions ?? []).map((entry) => [entry.id, entry]));
  for (const entry of conditionEntries) {
    if (!declaredConditions.has(entry?.id)) errors.push(issue("E_RESULT_CONDITION_UNKNOWN", "conditions", `unknown condition: ${entry?.id}`));
    if (!CONDITION_STATUSES.has(entry?.status)) errors.push(issue("E_RESULT_CONDITION_STATUS", `conditions.${entry?.id}`, "condition status is invalid"));
    if (entry?.status === "passed" && (!Array.isArray(entry.evidenceRefs) || entry.evidenceRefs.length === 0)) errors.push(issue("E_RESULT_EVIDENCE_REQUIRED", `conditions.${entry?.id}`, "passed condition requires evidenceRefs"));
    if (entry?.status !== "passed" && !nonEmpty(entry?.reason)) errors.push(issue("E_RESULT_REASON_REQUIRED", `conditions.${entry?.id}`, "failed or not-applicable condition requires a reason"));
    for (const [index, ref] of (Array.isArray(entry?.evidenceRefs) ? entry.evidenceRefs : []).entries()) {
      await validateFileOrUri(root, ref, errors, { path: `conditions.${entry?.id}.evidenceRefs.${index}`, missingCode: "E_EVIDENCE_MISSING", uriCode: "E_EVIDENCE_URI" });
    }
  }
  for (const condition of stage.exitConditions ?? []) {
    const entry = conditionMap.get(condition.id);
    if (!entry) errors.push(issue("E_RESULT_CONDITION_MISSING", `conditions.${condition.id}`, "condition result is required"));
    else if (condition.required && entry.status !== "passed") policyFailures.push({ id: condition.id, kind: "condition", status: entry.status });
  }

  const skillEntries = Array.isArray(result?.skills) ? result.skills : [];
  const skillMap = new Map(skillEntries.map((entry) => [entry?.id, entry]));
  for (const duplicate of duplicates(skillEntries.map((entry) => entry?.id))) errors.push(issue("E_RESULT_SKILL_DUPLICATE", "skills", `duplicate skill receipt: ${duplicate}`));
  const declaredSkills = new Map((stage.skillCalls ?? []).map((entry) => [entry.id, entry]));
  for (const entry of skillEntries) {
    if (!declaredSkills.has(entry?.id)) errors.push(issue("E_RESULT_SKILL_UNKNOWN", "skills", `unknown skill call: ${entry?.id}`));
    if (!SKILL_STATUSES.has(entry?.status)) errors.push(issue("E_RESULT_SKILL_STATUS", `skills.${entry?.id}`, "skill status is invalid"));
    if (entry?.status === "succeeded" && (!Array.isArray(entry.artifactRefs) || entry.artifactRefs.length === 0)) errors.push(issue("E_RESULT_SKILL_ARTIFACT", `skills.${entry?.id}`, "succeeded skill requires artifactRefs"));
    for (const duplicate of duplicates(Array.isArray(entry?.artifactRefs) ? entry.artifactRefs : [])) errors.push(issue("E_RESULT_SKILL_ARTIFACT_DUPLICATE", `skills.${entry?.id}.artifactRefs`, `duplicate artifact reference: ${duplicate}`));
    if (entry?.status !== "succeeded" && !nonEmpty(entry?.reason)) errors.push(issue("E_RESULT_REASON_REQUIRED", `skills.${entry?.id}`, "failed or skipped skill requires a reason"));
  }
  for (const call of stage.skillCalls ?? []) {
    const entry = skillMap.get(call.id);
    if (!entry) errors.push(issue("E_RESULT_SKILL_MISSING", `skills.${call.id}`, "skill receipt is required"));
    else if (call.required && entry.status !== "succeeded") policyFailures.push({ id: call.id, kind: "skill", status: entry.status });
  }

  const artifactEntries = Array.isArray(result?.artifacts) ? result.artifacts : [];
  const artifactMap = new Map(artifactEntries.map((entry) => [entry?.id, entry]));
  for (const duplicate of duplicates(artifactEntries.map((entry) => entry?.id))) errors.push(issue("E_RESULT_ARTIFACT_DUPLICATE", "artifacts", `duplicate artifact: ${duplicate}`));
  const declaredArtifacts = new Map((stage.requiredArtifacts ?? []).map((entry) => [entry.id, entry]));
  for (const skill of skillEntries) {
    for (const ref of skill?.artifactRefs ?? []) if (!artifactMap.has(ref)) errors.push(issue("E_ARTIFACT_REF", `skills.${skill?.id}.artifactRefs`, `artifact reference does not resolve: ${ref}`));
    const call = declaredSkills.get(skill?.id);
    if (skill?.status === "succeeded" && call) {
      const receipt = new Set(skill.artifactRefs ?? []);
      for (const required of call.artifactIds ?? []) if (!receipt.has(required)) errors.push(issue("E_SKILL_ARTIFACT_REQUIRED", `skills.${skill.id}.artifactRefs`, `required Skill artifact is missing: ${required}`));
    }
  }
  for (const artifact of artifactEntries) {
    const declaration = declaredArtifacts.get(artifact?.id);
    if (!declaration) errors.push(issue("E_RESULT_ARTIFACT_UNKNOWN", "artifacts", `unknown artifact: ${artifact?.id}`));
    if (!nonEmpty(artifact?.uri)) {
      errors.push(issue("E_ARTIFACT_URI", `artifacts.${artifact?.id}`, "artifact uri is required"));
      continue;
    }
    if (declaration?.contract && externalUri(artifact.uri) === true) {
      errors.push(issue("E_ARTIFACT_CONTRACT_URI", `artifacts.${artifact.id}`, "contracted artifacts must use a repository-relative path"));
      continue;
    }
    if (declaration?.contract === "verification-report/v1") {
      await validateVerificationReport(root, artifact.uri, conditionEntries, errors);
      continue;
    }
    if (declaration?.contract === "test-impact/v1") {
      await validateTestImpact(root, artifact.uri, errors);
      continue;
    }
    await validateFileOrUri(root, artifact.uri, errors, { path: `artifacts.${artifact.id}`, missingCode: "E_ARTIFACT_MISSING", uriCode: "E_ARTIFACT_URI" });
  }
  for (const artifact of stage.requiredArtifacts ?? []) if (artifact.required && !artifactMap.has(artifact.id)) errors.push(issue("E_RESULT_ARTIFACT_MISSING", `artifacts.${artifact.id}`, "required artifact is missing"));

  return { valid: errors.length === 0, errors, warnings, policyFailures };
}
