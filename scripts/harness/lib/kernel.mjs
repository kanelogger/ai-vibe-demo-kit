import { createHash, randomUUID } from "node:crypto";
import { HarnessError, fail } from "./errors.mjs";

const TERMINALS = new Set(["complete", "blocked", "aborted"]);

export function createIdleState() {
  return { schemaVersion: 1, revision: 0, active: null, last: null };
}

function timestamp(now) {
  const value = now();
  return value instanceof Date ? value.toISOString() : value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function digestValue(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function clone(value) {
  return structuredClone(value);
}

function assertRevision(state, expectedRevision, command) {
  if (state.revision === expectedRevision) return;
  const signalDigest = command.kind === "signal" ? digestValue(command.result) : null;
  const records = state.active?.results ?? state.last?.results ?? [];
  if (signalDigest && state.active?.status !== "paused") {
    const prior = records.find((entry) => entry.baseRevision === expectedRevision);
    if (prior?.digest === signalDigest) return "idempotent";
    if (prior) fail("E_SIGNAL_CONFLICT", "the same revision already accepted different signal content", { facts: { expectedRevision, currentRevision: state.revision } });
  }
  fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${state.revision}`, { facts: { expectedRevision, currentRevision: state.revision } });
}

function event(active, type, at, details = {}) {
  const entry = { sequence: active.events.length + 1, type, at, ...details };
  active.events.push(entry);
  return entry;
}

function route(workflow, stage, outcome) {
  const transition = workflow.transitions.find((entry) => entry.from === stage && entry.on === outcome);
  if (!transition) fail("E_TRANSITION_MISSING", `no transition for ${stage}/${outcome}`);
  return transition;
}

function policyFailuresFor(workflow, stageId, result) {
  const stage = workflow.stages[stageId];
  const conditions = new Map((result.conditions ?? []).map((entry) => [entry.id, entry]));
  const skills = new Map((result.skills ?? []).map((entry) => [entry.id, entry]));
  return [
    ...(stage.exitConditions ?? [])
      .filter((entry) => entry.required && conditions.get(entry.id)?.status !== "passed")
      .map((entry) => ({ id: entry.id, kind: "condition", status: conditions.get(entry.id)?.status ?? "missing" })),
    ...(stage.skillCalls ?? [])
      .filter((entry) => entry.required && skills.get(entry.id)?.status !== "succeeded")
      .map((entry) => ({ id: entry.id, kind: "skill", status: skills.get(entry.id)?.status ?? "missing" })),
  ];
}

function decisionFor(state, kind, details = {}) {
  return {
    kind,
    revision: state.revision,
    status: state.active?.status ?? state.last?.outcome ?? "idle",
    stage: state.active?.stage ?? null,
    pendingGate: state.active?.pendingGate ?? null,
    ...details,
  };
}

function finish(state, active, target, at) {
  const outcome = target === "complete"
    ? active.acceptedRisks.length > 0 ? "completed-with-override" : "completed"
    : target;
  active.status = outcome;
  active.closedAt = at;
  active.outcome = outcome;
  event(active, "work-closed", at, { outcome });
  state.last = active;
  state.active = null;
}

function enterTarget(state, workflow, transition, at, { overridden = false } = {}) {
  const active = state.active;
  active.pendingGate = null;
  active.pendingPolicy = null;
  active.paused = null;
  if (TERMINALS.has(transition.to)) {
    finish(state, active, transition.to, at);
    return;
  }
  active.stage = transition.to;
  active.status = "active";
  event(active, "stage-entered", at, { stage: transition.to, transitionId: transition.id, overridden });
}

function requireActive(state) {
  if (!state.active) fail("E_IDLE", "there is no active work item");
  return state.active;
}

function equalSets(left, right) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function allowedActions(active) {
  if (!active) return ["start"];
  if (active.status === "paused") return ["resume", "redirect", "abort"];
  if (active.pendingGate) return ["approve", "reject", "pause", "redirect", "abort"];
  if (active.pendingPolicy) return ["override", "pause", "redirect", "abort"];
  return ["signal", "pause", "redirect", "abort"];
}

export function inspectState(state) {
  return {
    revision: state.revision,
    active: state.active ? clone(state.active) : null,
    last: state.last ? clone(state.last) : null,
    allowedActions: allowedActions(state.active),
  };
}

export function applyControl({ state, workflow, command, now = () => new Date(), idFactory = () => `wi-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}` }) {
  const next = clone(state);
  const at = timestamp(now);

  if (command.kind === "start") {
    if (next.active) fail("E_ACTIVE", `work item ${next.active.id} is already active`);
    const active = {
      id: idFactory(),
      intent: command.intent?.trim(),
      workflow: { id: workflow.id, version: workflow.version, ref: command.workflowRef, digest: command.workflowDigest },
      status: "active",
      stage: workflow.initialStage,
      pendingGate: null,
      pendingPolicy: null,
      paused: null,
      acceptedRisks: [],
      results: [],
      decisions: [],
      events: [],
      createdAt: at,
      updatedAt: at,
    };
    if (!active.intent) fail("E_USAGE", "intent is required");
    event(active, "work-started", at, { stage: active.stage });
    next.active = active;
    next.revision += 1;
    return { state: next, decision: decisionFor(next, "ready") };
  }

  const idempotent = assertRevision(next, command.expectedRevision, command);
  if (idempotent) return { state: next, decision: decisionFor(next, "idempotent") };
  const active = requireActive(next);

  if (command.kind === "signal") {
    if (active.status !== "active") fail("E_PHASE", `cannot submit a signal while status is ${active.status}`, { exitCode: 1 });
    const transition = route(workflow, active.stage, command.result.outcome);
    const signalDigest = digestValue(command.result);
    const policyFailures = policyFailuresFor(workflow, active.stage, command.result);
    const record = {
      id: `result-${active.results.length + 1}`,
      stage: active.stage,
      status: "current",
      digest: signalDigest,
      baseRevision: command.expectedRevision,
      value: clone(command.result),
      recordedAt: at,
    };
    active.results.push(record);
    event(active, "stage-result", at, { stage: active.stage, outcome: command.result.outcome, resultId: record.id });
    if (policyFailures.length > 0) {
      const unmet = policyFailures.map((entry) => entry.id).sort();
      active.pendingPolicy = { transitionId: transition.id, resultId: record.id, unmet };
      active.status = "policy-blocked";
      event(active, "policy-blocked", at, { transitionId: transition.id, unmet });
    } else if (transition.gate.mode === "human") {
      active.pendingGate = { transitionId: transition.id, resultId: record.id, prompt: transition.gate.prompt };
      active.status = "awaiting-human";
      event(active, "gate-pending", at, { transitionId: transition.id });
    } else {
      enterTarget(next, workflow, transition, at);
    }
    if (next.active) next.active.updatedAt = at;
    next.revision += 1;
    const kind = next.active?.pendingPolicy ? "policy-blocked" : next.active?.pendingGate ? "await-human" : next.active ? "ready" : "complete";
    return { state: next, decision: decisionFor(next, kind, { unmet: next.active?.pendingPolicy?.unmet ?? [] }) };
  }

  if (command.kind !== "decide") fail("E_USAGE", `unknown command kind: ${command.kind}`);
  const human = command.decision;
  if (!human || !human.action || !human.actor?.trim() || !human.reason?.trim()) fail("E_DECISION_INVALID", "human decision requires action, actor and reason");
  const allowed = new Set(["approve", "reject", "pause", "resume", "redirect", "override", "abort"]);
  if (!allowed.has(human.action)) fail("E_DECISION_INVALID", `unknown human action: ${human.action}`);
  if (active.status === "paused" && !new Set(["resume", "redirect", "abort"]).has(human.action)) {
    fail("E_PHASE", `cannot ${human.action} while work is paused`, { exitCode: 1 });
  }

  const recordDecision = (extra = {}) => {
    const entry = { action: human.action, actor: human.actor.trim(), reason: human.reason.trim(), at, ...extra };
    active.decisions.push(entry);
    event(active, "human-decision", at, entry);
  };

  if (human.action === "abort") {
    recordDecision();
    finish(next, active, "aborted", at);
  } else if (human.action === "pause") {
    if (active.status === "paused") fail("E_PHASE", "work item is already paused", { exitCode: 1 });
    active.paused = { previousStatus: active.status, at };
    active.status = "paused";
    recordDecision();
  } else if (human.action === "resume") {
    if (active.status !== "paused") fail("E_PHASE", "resume requires a paused work item", { exitCode: 1 });
    active.status = active.paused.previousStatus;
    active.paused = null;
    recordDecision();
  } else if (human.action === "redirect") {
    if (!workflow.stages[human.target]) fail("E_REDIRECT_TARGET", `unknown redirect target: ${human.target}`);
    for (const result of active.results) if (result.status === "current") result.status = "superseded";
    active.stage = human.target;
    active.status = "active";
    active.pendingGate = null;
    active.pendingPolicy = null;
    active.paused = null;
    recordDecision({ target: human.target });
    event(active, "stage-entered", at, { stage: human.target, redirected: true });
  } else if (human.action === "approve") {
    if (!active.pendingGate) fail("E_GATE_PENDING", "approve requires a pending human gate", { exitCode: 1 });
    const transition = workflow.transitions.find((entry) => entry.id === active.pendingGate.transitionId);
    recordDecision({ transitionId: transition.id });
    enterTarget(next, workflow, transition, at);
  } else if (human.action === "reject") {
    if (!active.pendingGate) fail("E_GATE_PENDING", "reject requires a pending human gate", { exitCode: 1 });
    const transition = workflow.transitions.find((entry) => entry.id === active.pendingGate.transitionId);
    const target = transition.gate.onReject ?? transition.from;
    const result = active.results.find((entry) => entry.id === active.pendingGate.resultId);
    if (result) result.status = "superseded";
    active.stage = target;
    active.status = "active";
    active.pendingGate = null;
    recordDecision({ transitionId: transition.id, target });
    event(active, "stage-entered", at, { stage: target, rejected: true });
  } else if (human.action === "override") {
    if (!active.pendingPolicy) fail("E_POLICY_UNMET", "override requires a policy-blocked transition", { exitCode: 1 });
    const accepted = Array.isArray(human.acceptRisk) ? [...new Set(human.acceptRisk)] : [];
    if (!equalSets(accepted, active.pendingPolicy.unmet)) fail("E_OVERRIDE_INCOMPLETE", "accepted risks must exactly match unmet policy conditions", { exitCode: 1, facts: { required: active.pendingPolicy.unmet, accepted } });
    const transition = workflow.transitions.find((entry) => entry.id === active.pendingPolicy.transitionId);
    active.acceptedRisks = [...new Set([...active.acceptedRisks, ...accepted])].sort();
    recordDecision({ transitionId: transition.id, acceptedRisks: accepted });
    if (transition.gate.mode === "human") {
      active.pendingPolicy = null;
      active.pendingGate = { transitionId: transition.id, resultId: active.results.at(-1).id, prompt: transition.gate.prompt };
      active.status = "awaiting-human";
    } else enterTarget(next, workflow, transition, at, { overridden: true });
  }

  if (next.active) next.active.updatedAt = at;
  next.revision += 1;
  const kind = next.active?.status === "paused" ? "paused" : next.active?.pendingGate ? "await-human" : next.active ? "ready" : "complete";
  return { state: next, decision: decisionFor(next, kind) };
}

export { HarnessError };
