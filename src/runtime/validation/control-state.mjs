const issue = (code, path, message) => ({ code, path, message });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";

function validateWorkRecord(record, path, errors, { terminal = false } = {}) {
  if (!object(record)) {
    errors.push(issue("E_STATE_RECORD", path, "work record must be an object"));
    return;
  }
  if (!nonEmpty(record.id) || !nonEmpty(record.intent)) errors.push(issue("E_STATE_RECORD", path, "work record requires id and intent"));
  if (!object(record.workflow) || !nonEmpty(record.workflow.id) || !Number.isInteger(record.workflow.version) || !nonEmpty(record.workflow.ref) || !nonEmpty(record.workflow.digest)) {
    errors.push(issue("E_STATE_WORKFLOW", `${path}.workflow`, "workflow binding requires id, version, ref and digest"));
  }
  // Profile binding fields were introduced with schemaVersion 1 Profile
  // orchestration; records written before it are tolerated, but a record
  // carrying any binding field must carry all of them, well-formed.
  const bindingFields = ["profileId", "workflowRef", "bindingDigest", "bindingLockDigest"];
  const present = bindingFields.filter((field) => record[field] !== undefined);
  if (present.length > 0 && present.length < bindingFields.length) {
    errors.push(issue("E_STATE_BINDING", `${path}.binding`, "profile binding requires profileId, workflowRef, bindingDigest and bindingLockDigest"));
  } else if (present.length === bindingFields.length) {
    if (record.profileId !== null && !nonEmpty(record.profileId)) errors.push(issue("E_STATE_BINDING", `${path}.profileId`, "profileId must be null or a profile id"));
    if (!nonEmpty(record.workflowRef)) errors.push(issue("E_STATE_BINDING", `${path}.workflowRef`, "workflowRef must be non-empty"));
    if (!nonEmpty(record.bindingDigest)) errors.push(issue("E_STATE_BINDING", `${path}.bindingDigest`, "bindingDigest must be non-empty"));
    if (record.bindingLockDigest !== null && !nonEmpty(record.bindingLockDigest)) errors.push(issue("E_STATE_BINDING", `${path}.bindingLockDigest`, "bindingLockDigest must be null or a digest"));
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
    if (kind === "policy" && (!Array.isArray(pending.unmet) || pending.unmet.length === 0 || pending.unmet.some((entry) => !nonEmpty(entry)))) errors.push(issue("E_STATE_POLICY", `${prefix}.unmet`, "pending policy requires unmet policy ids"));
  }
  return { valid: errors.length === 0, errors, warnings };
}
