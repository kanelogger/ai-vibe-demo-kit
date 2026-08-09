import { lstat, readFile, realpath } from "node:fs/promises";
import { firstSymlinkInPath, resolveInside } from "./path-safety.mjs";

const TERMINALS = new Set(["complete", "blocked", "aborted"]);
const CONDITION_STATUSES = new Set(["passed", "failed", "not-applicable"]);
const SKILL_STATUSES = new Set(["succeeded", "failed", "skipped"]);
const CHECK_STATUSES = new Set(["passed", "failed", "skipped"]);
const CHECK_KINDS = new Set(["automated", "critical-path", "manual"]);
const CLEANUP_STATUSES = new Set(["removed", "not-created", "retained"]);
const ARTIFACT_CONTRACTS = new Set(["verification-report/v1"]);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function issue(code, path, message) {
  return { code, path, message };
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
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
      await validateFileOrUri(root, ref, errors, {
        path: `${conditionPath}.evidenceRefs.${evidenceIndex}`,
        missingCode: "E_EVIDENCE_MISSING",
        uriCode: "E_EVIDENCE_URI",
      });
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
      await validateFileOrUri(root, ref, errors, {
        path: `${checkPath}.evidenceRefs.${evidenceIndex}`,
        missingCode: "E_EVIDENCE_MISSING",
        uriCode: "E_EVIDENCE_URI",
      });
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
      await validateFileOrUri(root, ref, errors, {
        path: `${cleanupPath}.evidenceRefs.${evidenceIndex}`,
        missingCode: "E_EVIDENCE_MISSING",
        uriCode: "E_EVIDENCE_URI",
      });
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

function duplicates(values) {
  const seen = new Set();
  const result = new Set();
  for (const value of values) {
    if (seen.has(value)) result.add(value);
    seen.add(value);
  }
  return result;
}

export async function validateWorkflow(workflow, { root, workflowPath = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!object(workflow)) return { valid: false, errors: [issue("E_WORKFLOW_INVALID", "$", "workflow must be an object")], warnings };
  if (workflow.schemaVersion !== 2) errors.push(issue("E_WORKFLOW_VERSION", "schemaVersion", "schemaVersion must be 2"));
  if (!nonEmpty(workflow.id) || !ID.test(workflow.id)) errors.push(issue("E_WORKFLOW_ID", "id", "workflow id is invalid"));
  if (!Number.isInteger(workflow.version) || workflow.version < 1) errors.push(issue("E_WORKFLOW_VERSION", "version", "version must be a positive integer"));
  if (!object(workflow.stages) || Object.keys(workflow.stages).length === 0) errors.push(issue("E_STAGES_REQUIRED", "stages", "at least one stage is required"));
  const stages = object(workflow.stages) ? workflow.stages : {};
  const stageIds = Object.keys(stages);
  if (!stageIds.includes(workflow.initialStage)) errors.push(issue("E_INITIAL_STAGE", "initialStage", "initialStage must name a declared stage"));

  const catalogIds = new Set();
  if (nonEmpty(workflow.skillsCatalogRef) && root) {
    const catalog = await readJsonPath(root, workflow.skillsCatalogRef, errors, "E_SKILL_CATALOG");
    for (const entry of catalog?.skills ?? []) if (nonEmpty(entry?.id)) catalogIds.add(entry.id);
  }

  for (const [stageId, stage] of Object.entries(stages)) {
    const path = `stages.${stageId}`;
    if (!ID.test(stageId)) errors.push(issue("E_STAGE_ID", path, "stage id is invalid"));
    if (!object(stage) || !nonEmpty(stage.goal)) errors.push(issue("E_STAGE_GOAL", `${path}.goal`, "stage goal is required"));
    if (!Array.isArray(stage?.outcomes) || stage.outcomes.length === 0) errors.push(issue("E_STAGE_OUTCOMES", `${path}.outcomes`, "stage outcomes are required"));
    const outcomes = Array.isArray(stage?.outcomes) ? stage.outcomes : [];
    for (const duplicate of duplicates(outcomes)) errors.push(issue("E_OUTCOME_DUPLICATE", `${path}.outcomes`, `duplicate outcome: ${duplicate}`));
    for (const outcome of outcomes) if (!nonEmpty(outcome) || !ID.test(outcome)) errors.push(issue("E_OUTCOME_INVALID", `${path}.outcomes`, `invalid outcome: ${String(outcome)}`));

    const conditions = stage?.exitConditions ?? [];
    if (!Array.isArray(conditions)) errors.push(issue("E_CONDITIONS_INVALID", `${path}.exitConditions`, "exitConditions must be an array"));
    for (const duplicate of duplicates(Array.isArray(conditions) ? conditions.map((entry) => entry?.id) : [])) errors.push(issue("E_CONDITION_DUPLICATE", `${path}.exitConditions`, `duplicate condition: ${duplicate}`));
    for (const [index, condition] of (Array.isArray(conditions) ? conditions : []).entries()) {
      if (!object(condition) || !nonEmpty(condition.id) || !ID.test(condition.id) || !nonEmpty(condition.description) || typeof condition.required !== "boolean") {
        errors.push(issue("E_CONDITION_INVALID", `${path}.exitConditions.${index}`, "condition requires id, description and boolean required"));
      }
    }

    const skills = stage?.skillCalls ?? [];
    if (!Array.isArray(skills)) errors.push(issue("E_SKILLS_INVALID", `${path}.skillCalls`, "skillCalls must be an array"));
    for (const duplicate of duplicates(Array.isArray(skills) ? skills.map((entry) => entry?.id) : [])) errors.push(issue("E_SKILL_DUPLICATE", `${path}.skillCalls`, `duplicate skill call: ${duplicate}`));
    for (const [index, call] of (Array.isArray(skills) ? skills : []).entries()) {
      if (!object(call) || !nonEmpty(call.id) || !ID.test(call.id) || !nonEmpty(call.skill) || !ID.test(call.skill) || typeof call.required !== "boolean") {
        errors.push(issue("E_SKILL_INVALID", `${path}.skillCalls.${index}`, "skill call requires id, skill and boolean required"));
      } else if (workflow.skillsCatalogRef && !catalogIds.has(call.skill)) {
        errors.push(issue("E_SKILL_UNKNOWN", `${path}.skillCalls.${index}.skill`, `skill is not present in catalog: ${call.skill}`));
      }
    }
    const conditionIds = new Set((Array.isArray(conditions) ? conditions : []).map((entry) => entry?.id));
    for (const call of (Array.isArray(skills) ? skills : [])) {
      if (conditionIds.has(call?.id)) errors.push(issue("E_POLICY_ID_DUPLICATE", `${path}.skillCalls`, `condition and skill call share a policy id: ${call.id}`));
    }

    const artifacts = stage?.requiredArtifacts ?? [];
    if (!Array.isArray(artifacts)) errors.push(issue("E_ARTIFACTS_INVALID", `${path}.requiredArtifacts`, "requiredArtifacts must be an array"));
    for (const duplicate of duplicates(Array.isArray(artifacts) ? artifacts.map((entry) => entry?.id) : [])) errors.push(issue("E_ARTIFACT_DUPLICATE", `${path}.requiredArtifacts`, `duplicate artifact: ${duplicate}`));
    for (const [index, artifact] of (Array.isArray(artifacts) ? artifacts : []).entries()) {
      if (!object(artifact) || !nonEmpty(artifact.id) || !ID.test(artifact.id) || typeof artifact.required !== "boolean") errors.push(issue("E_ARTIFACT_INVALID", `${path}.requiredArtifacts.${index}`, "artifact requires id and boolean required"));
      else if (artifact.contract !== undefined && !ARTIFACT_CONTRACTS.has(artifact.contract)) errors.push(issue("E_ARTIFACT_CONTRACT", `${path}.requiredArtifacts.${index}.contract`, `unsupported artifact contract: ${artifact.contract}`));
    }

    if (nonEmpty(stage?.instructionsRef) && root) {
      const target = resolveInside(root, stage.instructionsRef);
      if (!target) errors.push(issue("E_PATH_OUTSIDE", `${path}.instructionsRef`, "instructionsRef must stay inside the repository"));
      else {
        try {
          if (await firstSymlinkInPath(root, target)) errors.push(issue("E_PATH_SYMLINK", `${path}.instructionsRef`, "instructionsRef must not use symlinks"));
          else await realpath(target);
        } catch (error) {
          errors.push(issue("E_REFERENCE_INVALID", `${path}.instructionsRef`, error.code === "ENOENT" ? "instructionsRef does not exist" : error.message));
        }
      }
    }
  }

  if (!Array.isArray(workflow.transitions)) errors.push(issue("E_TRANSITIONS_REQUIRED", "transitions", "transitions must be an array"));
  const transitions = Array.isArray(workflow.transitions) ? workflow.transitions : [];
  for (const duplicate of duplicates(transitions.map((entry) => entry?.id))) errors.push(issue("E_TRANSITION_ID_DUPLICATE", "transitions", `duplicate transition id: ${duplicate}`));
  const routeKeys = transitions.map((entry) => `${entry?.from}\0${entry?.on}`);
  for (const duplicate of duplicates(routeKeys)) errors.push(issue("E_TRANSITION_DUPLICATE", "transitions", `duplicate route: ${duplicate.replace("\0", "/")}`));
  for (const [index, transition] of transitions.entries()) {
    const path = `transitions.${index}`;
    if (!object(transition) || !nonEmpty(transition.id) || !ID.test(transition.id)) errors.push(issue("E_TRANSITION_ID", `${path}.id`, "transition id is invalid"));
    if (!stageIds.includes(transition?.from)) errors.push(issue("E_TRANSITION_FROM", `${path}.from`, "transition source is unknown"));
    if (!stageIds.includes(transition?.to) && !TERMINALS.has(transition?.to)) errors.push(issue("E_TRANSITION_TO", `${path}.to`, "transition target is unknown"));
    if (stageIds.includes(transition?.from) && !stages[transition.from].outcomes?.includes(transition.on)) errors.push(issue("E_TRANSITION_OUTCOME", `${path}.on`, "transition outcome is not declared by its source stage"));
    if (!object(transition?.gate) || !new Set(["auto", "human"]).has(transition.gate.mode)) errors.push(issue("E_GATE_MODE", `${path}.gate`, "gate mode must be auto or human"));
    if (transition?.gate?.mode === "human") {
      if (!nonEmpty(transition.gate.prompt)) errors.push(issue("E_GATE_PROMPT", `${path}.gate.prompt`, "human gate prompt is required"));
      if (transition.gate.onReject !== undefined && !stageIds.includes(transition.gate.onReject)) errors.push(issue("E_GATE_REJECT_TARGET", `${path}.gate.onReject`, "onReject must name a declared stage"));
    }
  }
  const declaredRoutes = new Set(transitions.map((entry) => `${entry?.from}\0${entry?.on}`));
  for (const [stageId, stage] of Object.entries(stages)) {
    for (const outcome of stage.outcomes ?? []) {
      if (!declaredRoutes.has(`${stageId}\0${outcome}`)) errors.push(issue("E_TRANSITION_MISSING", `stages.${stageId}.outcomes`, `outcome has no transition: ${outcome}`));
    }
  }

  if (stageIds.includes(workflow.initialStage)) {
    const reachable = new Set([workflow.initialStage]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const transition of transitions) {
        if (reachable.has(transition.from) && stageIds.includes(transition.to) && !reachable.has(transition.to)) {
          reachable.add(transition.to);
          changed = true;
        }
      }
    }
    for (const stageId of stageIds) if (!reachable.has(stageId)) errors.push(issue("E_STAGE_UNREACHABLE", `stages.${stageId}`, "stage is unreachable from initialStage"));
  }

  if (workflowPath && root && !resolveInside(root, workflowPath)) errors.push(issue("E_PATH_OUTSIDE", "workflowPath", "workflow path must stay inside the repository"));
  return { valid: errors.length === 0, errors, warnings };
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
    if (Array.isArray(entry?.evidenceRefs)) {
      for (const [index, ref] of entry.evidenceRefs.entries()) {
        await validateFileOrUri(root, ref, errors, {
          path: `conditions.${entry?.id}.evidenceRefs.${index}`,
          missingCode: "E_EVIDENCE_MISSING",
          uriCode: "E_EVIDENCE_URI",
        });
      }
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
    await validateFileOrUri(root, artifact.uri, errors, {
      path: `artifacts.${artifact.id}`,
      missingCode: "E_ARTIFACT_MISSING",
      uriCode: "E_ARTIFACT_URI",
    });
  }
  for (const artifact of stage.requiredArtifacts ?? []) if (artifact.required && !artifactMap.has(artifact.id)) errors.push(issue("E_RESULT_ARTIFACT_MISSING", `artifacts.${artifact.id}`, "required artifact is missing"));

  return { valid: errors.length === 0, errors, warnings, policyFailures };
}

function validateWorkRecord(record, path, errors, { terminal = false } = {}) {
  if (!object(record)) {
    errors.push(issue("E_STATE_RECORD", path, "work record must be an object"));
    return;
  }
  if (!nonEmpty(record.id) || !nonEmpty(record.intent)) errors.push(issue("E_STATE_RECORD", path, "work record requires id and intent"));
  if (!object(record.workflow) || !nonEmpty(record.workflow.id) || !Number.isInteger(record.workflow.version) || !nonEmpty(record.workflow.ref) || !nonEmpty(record.workflow.digest)) {
    errors.push(issue("E_STATE_WORKFLOW", `${path}.workflow`, "workflow binding requires id, version, ref and digest"));
  }
  if (!terminal && !new Set(["active", "paused", "awaiting-human", "policy-blocked"]).has(record.status)) errors.push(issue("E_STATE_STATUS", `${path}.status`, "active work status is invalid"));
  if (!terminal && !nonEmpty(record.stage)) errors.push(issue("E_STATE_STAGE", `${path}.stage`, "active work requires a stage"));
  for (const field of ["acceptedRisks", "results", "decisions", "events"]) if (!Array.isArray(record[field])) errors.push(issue("E_STATE_COLLECTION", `${path}.${field}`, `${field} must be an array`));
  if (Array.isArray(record.events)) {
    record.events.forEach((entry, index) => {
      if (!object(entry) || entry.sequence !== index + 1 || !nonEmpty(entry.type) || !nonEmpty(entry.at)) errors.push(issue("E_STATE_EVENT", `${path}.events.${index}`, "events require contiguous sequence, type and timestamp"));
    });
  }
  if (terminal && !nonEmpty(record.outcome)) errors.push(issue("E_STATE_OUTCOME", `${path}.outcome`, "terminal work requires an outcome"));
}

export function validateControlState(state) {
  const errors = [];
  const warnings = [];
  if (!object(state) || state.schemaVersion !== 1 || !Number.isInteger(state.revision) || state.revision < 0) {
    return { valid: false, errors: [issue("E_STATE_INVALID", "$", "state requires schemaVersion 1 and a non-negative integer revision")], warnings };
  }
  if (state.active !== null) validateWorkRecord(state.active, "active", errors);
  if (state.last !== null && state.last?.legacy !== true) validateWorkRecord(state.last, "last", errors, { terminal: true });
  return { valid: errors.length === 0, errors, warnings };
}

export function validateStateAgainstWorkflow(state, workflow) {
  const errors = [];
  const warnings = [];
  const active = state?.active;
  if (!active) return { valid: true, errors, warnings };
  if (active.workflow.id !== workflow.id || active.workflow.version !== workflow.version) errors.push(issue("E_STATE_WORKFLOW", "active.workflow", "active work is bound to a different workflow identity"));
  if (!workflow.stages[active.stage]) errors.push(issue("E_STATE_STAGE", "active.stage", `active stage is not declared: ${active.stage}`));
  const transitions = new Map(workflow.transitions.map((entry) => [entry.id, entry]));
  const effectiveStatus = active.status === "paused" ? active.paused?.previousStatus : active.status;
  if (active.status === "paused") {
    if (!object(active.paused) || !new Set(["active", "awaiting-human", "policy-blocked"]).has(effectiveStatus)) errors.push(issue("E_STATE_PAUSE", "active.paused", "paused status requires a valid previous status"));
  } else if (active.paused !== null) errors.push(issue("E_STATE_PAUSE", "active.paused", "non-paused work must not retain pause data"));
  if (effectiveStatus === "active" && active.pendingGate) errors.push(issue("E_STATE_GATE", "active.pendingGate", "active status must not have a pending gate"));
  if (effectiveStatus === "active" && active.pendingPolicy) errors.push(issue("E_STATE_POLICY", "active.pendingPolicy", "active status must not have pending policy data"));
  if (effectiveStatus === "awaiting-human" && !active.pendingGate) errors.push(issue("E_STATE_GATE", "active.pendingGate", "awaiting-human status requires a pending gate"));
  if (effectiveStatus === "awaiting-human" && active.pendingPolicy) errors.push(issue("E_STATE_POLICY", "active.pendingPolicy", "awaiting-human status must not have pending policy data"));
  if (effectiveStatus === "policy-blocked" && !active.pendingPolicy) errors.push(issue("E_STATE_POLICY", "active.pendingPolicy", "policy-blocked status requires pending policy data"));
  if (effectiveStatus === "policy-blocked" && active.pendingGate) errors.push(issue("E_STATE_GATE", "active.pendingGate", "policy-blocked status must not have a pending gate"));
  const results = Array.isArray(active.results) ? active.results : [];
  for (const [index, result] of results.entries()) {
    const stage = workflow.stages[result?.stage];
    if (!stage) errors.push(issue("E_STATE_RESULT_STAGE", `active.results.${index}.stage`, "result stage is not declared"));
    else if (!stage.outcomes.includes(result?.value?.outcome)) errors.push(issue("E_STATE_RESULT_OUTCOME", `active.results.${index}.value.outcome`, "result outcome is not declared by its stage"));
    if (!new Set(["current", "superseded"]).has(result?.status)) errors.push(issue("E_STATE_RESULT_STATUS", `active.results.${index}.status`, "result status is invalid"));
  }
  for (const [kind, pending] of [["gate", active.pendingGate], ["policy", active.pendingPolicy]]) {
    if (!pending) continue;
    const transition = transitions.get(pending.transitionId);
    const prefix = kind === "gate" ? "active.pendingGate" : "active.pendingPolicy";
    if (!transition) {
      errors.push(issue("E_STATE_TRANSITION", `${prefix}.transitionId`, `pending ${kind} transition is not declared`));
      continue;
    }
    if (transition.from !== active.stage) errors.push(issue("E_STATE_TRANSITION", `${prefix}.transitionId`, `pending ${kind} transition does not leave the active stage`));
    if (kind === "gate" && transition.gate.mode !== "human") errors.push(issue("E_STATE_GATE", prefix, "pending gate must reference a human transition"));
    const result = results.find((entry) => entry.id === pending.resultId);
    if (!result) errors.push(issue("E_STATE_RESULT", `${prefix}.resultId`, `pending ${kind} result does not exist`));
    else if (result.value?.outcome !== transition.on) errors.push(issue("E_STATE_TRANSITION", `${prefix}.transitionId`, `pending ${kind} transition does not match its result outcome`));
    if (kind === "policy" && (!Array.isArray(pending.unmet) || pending.unmet.length === 0 || pending.unmet.some((entry) => !nonEmpty(entry)))) {
      errors.push(issue("E_STATE_POLICY", `${prefix}.unmet`, "pending policy requires unmet policy ids"));
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
