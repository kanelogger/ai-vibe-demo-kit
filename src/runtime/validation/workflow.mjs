import { lstat, readFile, realpath } from "node:fs/promises";
import { firstSymlinkInPath, resolveInside } from "../../shared/path-safety.mjs";

const TERMINALS = new Set(["complete", "blocked", "aborted"]);
const ARTIFACT_CONTRACTS = new Set(["execution-trace/v1", "test-impact/v1", "verification-report/v1"]);
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

export function parseSkillDocument(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(content);
  if (!match) return null;
  const metadata = {};
  for (const raw of match[1].split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    const entry = /^([a-zA-Z0-9_-]+):\s*(.+)$/.exec(raw);
    if (!entry) return null;
    let value = entry[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    metadata[entry[1]] = value;
  }
  return { metadata, body: match[2] };
}

async function validateSkillEntity(root, catalogEntry, call, errors, warnings, path) {
  const problems = [];
  if (!object(catalogEntry) || !nonEmpty(catalogEntry.skillRef)) problems.push("catalog entry requires skillRef");
  const target = catalogEntry?.skillRef ? resolveInside(root, catalogEntry.skillRef) : null;
  if (catalogEntry?.skillRef && !target) problems.push("skillRef must be a safe repository-relative path");
  if (target) {
    try {
      if (await firstSymlinkInPath(root, target)) problems.push("skillRef must not pass through a symlink");
      else {
        const stat = await lstat(target);
        if (!stat.isFile()) problems.push("skillRef must be a regular file");
        else {
          const document = parseSkillDocument(await readFile(target, "utf8"));
          if (!document) problems.push("SKILL.md frontmatter is invalid");
          else {
            const { metadata } = document;
            const keys = Object.keys(metadata).sort();
            if (keys.join(",") !== "description,name") problems.push("SKILL.md frontmatter may contain only name and description");
            if (metadata.name !== catalogEntry.id) problems.push("SKILL.md name must equal the Catalog id");
            if (!nonEmpty(metadata.description)) problems.push("SKILL.md description must be non-empty");
          }
        }
      }
    } catch (error) {
      problems.push(error.code === "ENOENT" ? "skillRef does not exist" : error.message);
    }
  }
  for (const message of problems) {
    const targetIssues = call.required ? errors : warnings;
    targetIssues.push(issue(call.required ? "E_SKILL_ENTITY" : "W_SKILL_UNAVAILABLE", path, message));
  }
}

export async function validateWorkflow(workflow, { root, workflowPath = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!object(workflow)) return { valid: false, errors: [issue("E_WORKFLOW_INVALID", "$", "workflow must be an object")], warnings };
  if (!new Set([2, 3]).has(workflow.schemaVersion)) errors.push(issue("E_WORKFLOW_VERSION", "schemaVersion", "schemaVersion must be 2 or 3"));
  if (!nonEmpty(workflow.id) || !ID.test(workflow.id)) errors.push(issue("E_WORKFLOW_ID", "id", "workflow id is invalid"));
  if (!Number.isInteger(workflow.version) || workflow.version < 1) errors.push(issue("E_WORKFLOW_VERSION", "version", "version must be a positive integer"));
  if (!object(workflow.stages) || Object.keys(workflow.stages).length === 0) errors.push(issue("E_STAGES_REQUIRED", "stages", "at least one stage is required"));
  const stages = object(workflow.stages) ? workflow.stages : {};
  const stageIds = Object.keys(stages);
  if (!stageIds.includes(workflow.initialStage)) errors.push(issue("E_INITIAL_STAGE", "initialStage", "initialStage must name a declared stage"));

  const catalogEntries = new Map();
  if (nonEmpty(workflow.skillsCatalogRef) && root) {
    const catalog = await readJsonPath(root, workflow.skillsCatalogRef, errors, "E_SKILL_CATALOG");
    for (const entry of catalog?.skills ?? []) if (nonEmpty(entry?.id)) catalogEntries.set(entry.id, entry);
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
      if (!object(condition) || !nonEmpty(condition.id) || !ID.test(condition.id) || !nonEmpty(condition.description) || typeof condition.required !== "boolean") errors.push(issue("E_CONDITION_INVALID", `${path}.exitConditions.${index}`, "condition requires id, description and boolean required"));
      if (condition?.requiredForOutcomes !== undefined) {
        const conditionPath = `${path}.exitConditions.${index}.requiredForOutcomes`;
        if (workflow.schemaVersion !== 3) errors.push(issue("E_CONDITION_OUTCOMES", conditionPath, "requiredForOutcomes requires Workflow schemaVersion 3"));
        if (!Array.isArray(condition.requiredForOutcomes)) errors.push(issue("E_CONDITION_OUTCOMES", conditionPath, "requiredForOutcomes must be an array"));
        else {
          for (const duplicate of duplicates(condition.requiredForOutcomes)) errors.push(issue("E_CONDITION_OUTCOME_DUPLICATE", conditionPath, `duplicate required outcome: ${duplicate}`));
          for (const outcome of condition.requiredForOutcomes) if (!outcomes.includes(outcome)) errors.push(issue("E_CONDITION_OUTCOME_UNKNOWN", conditionPath, `required outcome is not declared by the Stage: ${String(outcome)}`));
        }
      }
    }

    const skills = stage?.skillCalls ?? [];
    const declaredArtifactIds = new Set((Array.isArray(stage?.requiredArtifacts) ? stage.requiredArtifacts : []).map((entry) => entry?.id));
    if (!Array.isArray(skills)) errors.push(issue("E_SKILLS_INVALID", `${path}.skillCalls`, "skillCalls must be an array"));
    for (const duplicate of duplicates(Array.isArray(skills) ? skills.map((entry) => entry?.id) : [])) errors.push(issue("E_SKILL_DUPLICATE", `${path}.skillCalls`, `duplicate skill call: ${duplicate}`));
    for (const [index, call] of (Array.isArray(skills) ? skills : []).entries()) {
      if (!object(call) || !nonEmpty(call.id) || !ID.test(call.id) || !nonEmpty(call.skill) || !ID.test(call.skill) || typeof call.required !== "boolean") {
        errors.push(issue("E_SKILL_INVALID", `${path}.skillCalls.${index}`, "skill call requires id, skill and boolean required"));
      } else if (workflow.skillsCatalogRef && !catalogEntries.has(call.skill)) {
        errors.push(issue("E_SKILL_UNKNOWN", `${path}.skillCalls.${index}.skill`, `skill is not present in catalog: ${call.skill}`));
      } else {
        if (call.artifactIds !== undefined && !Array.isArray(call.artifactIds)) errors.push(issue("E_SKILL_ARTIFACTS", `${path}.skillCalls.${index}.artifactIds`, "artifactIds must be an array"));
        const artifactIds = Array.isArray(call.artifactIds) ? call.artifactIds : [];
        for (const duplicate of duplicates(artifactIds)) errors.push(issue("E_SKILL_ARTIFACT_DUPLICATE", `${path}.skillCalls.${index}.artifactIds`, `duplicate artifact id: ${duplicate}`));
        for (const id of artifactIds) if (!nonEmpty(id) || !ID.test(id) || !declaredArtifactIds.has(id)) errors.push(issue("E_SKILL_ARTIFACT_UNKNOWN", `${path}.skillCalls.${index}.artifactIds`, `artifactIds must name current Stage requiredArtifacts: ${String(id)}`));
        if (root && workflow.skillsCatalogRef) await validateSkillEntity(root, catalogEntries.get(call.skill), call, errors, warnings, `${path}.skillCalls.${index}.skill`);
      }
    }
    const conditionIds = new Set((Array.isArray(conditions) ? conditions : []).map((entry) => entry?.id));
    for (const call of (Array.isArray(skills) ? skills : [])) if (conditionIds.has(call?.id)) errors.push(issue("E_POLICY_ID_DUPLICATE", `${path}.skillCalls`, `condition and skill call share a policy id: ${call.id}`));

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
    for (const outcome of stage.outcomes ?? []) if (!declaredRoutes.has(`${stageId}\0${outcome}`)) errors.push(issue("E_TRANSITION_MISSING", `stages.${stageId}.outcomes`, `outcome has no transition: ${outcome}`));
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
