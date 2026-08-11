import { readFile, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { applyControl, digestValue, inspectState } from "./kernel.mjs";
import { HarnessError, fail } from "../shared/errors.mjs";
import { loadHarnessManifest } from "../shared/manifest.mjs";
import { firstSymlinkInPath, isInside, resolveInside } from "../shared/path-safety.mjs";
import { formatRecoveryCommand, readCanonicalMaintenance, repositoryPaths } from "../shared/repository-guard.mjs";
import { loadState, mutateState, readGitActor } from "./store.mjs";
import { validateEnvironmentManifest, validateStageResult, validateStateAgainstWorkflow, validateWorkflow } from "./validation/index.mjs";

const DEFAULT_WORKFLOW = "source/workflows/workflow-template.json";

async function readRepoText(root, path, label) {
  if (typeof path !== "string" || path.trim() === "" || isAbsolute(path)) fail("E_PATH_OUTSIDE", `${label} path must be repository-relative`);
  const target = resolveInside(root, path);
  if (!target) fail("E_PATH_OUTSIDE", `${label} path leaves the repository`);
  try {
    if (await firstSymlinkInPath(root, target)) fail("E_PATH_SYMLINK", `${label} path must not use symlinks`);
    const actual = await realpath(target);
    if (!isInside(root, actual)) fail("E_PATH_OUTSIDE", `${label} resolves outside the repository`);
    return await readFile(target, "utf8");
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    if (error.code === "ENOENT") fail("E_REFERENCE_INVALID", `${label} file does not exist: ${path}`);
    fail("E_REFERENCE_INVALID", `${label} cannot be read: ${error.message}`);
  }
}

async function readRepoJson(root, path, label) {
  const content = await readRepoText(root, path, label);
  try { return JSON.parse(content); }
  catch (error) { fail("E_REFERENCE_INVALID", `${label} is not valid JSON: ${error.message}`); }
}

async function loadWorkflow(root, path) {
  const workflow = await readRepoJson(root, path, "workflow");
  const report = await validateWorkflow(workflow, { root, workflowPath: path });
  return { workflow, report, digest: digestValue(workflow) };
}

function nextActionsFor(value) {
  const revisionArg = `--revision ${value.revision}`;
  return (value.allowedActions ?? []).map((action) => {
    if (action === "start") return `./harness start --workflow ${DEFAULT_WORKFLOW} --intent "<intent>"`;
    if (action === "signal") return `./harness signal ${revisionArg} --file "<stage-result.json>"`;
    if (action === "redirect") return `./harness decide ${revisionArg} --action redirect --target "<stage>" --reason "<reason>"`;
    if (action === "override") {
      const risks = value.active?.pendingPolicy?.unmet ?? [];
      const accepted = risks.length > 0 ? risks.map((id) => `--accept-risk ${JSON.stringify(id)}`).join(" ") : '--accept-risk "<condition-id>"';
      return `./harness decide ${revisionArg} --action override ${accepted} --reason "<reason>"`;
    }
    return `./harness decide ${revisionArg} --action ${action} --reason "<reason>"`;
  });
}

function publicState(state, extra = {}) {
  const view = inspectState(state);
  const result = {
    revision: view.revision,
    status: view.active?.status ?? "idle",
    stage: view.active?.stage ?? null,
    pendingGate: view.active?.pendingGate ?? null,
    allowedActions: view.allowedActions,
    active: view.active,
    last: view.last ? {
      id: view.last.id,
      outcome: view.last.outcome,
      closedAt: view.last.closedAt ?? null,
      legacy: view.last.legacy === true,
    } : null,
    ...extra,
  };
  result.nextActions = nextActionsFor(result);
  return result;
}

function signalState(state, { applied, ...extra }) {
  return publicState(state, {
    ...extra,
    applied,
    requiresHumanAction: new Set(["awaiting-human", "policy-blocked"]).has(state.active?.status),
  });
}

function signalRevisionMismatch(state, expectedRevision, stageResult) {
  const facts = { expectedRevision, currentRevision: state.revision };
  if (state.active?.status === "paused") fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${state.revision}`, { facts });
  const signalDigest = digestValue(stageResult);
  const records = state.active?.results ?? state.last?.results ?? [];
  const prior = records.find((entry) => entry.baseRevision === expectedRevision);
  if (prior?.digest === signalDigest) return { exitCode: 0, payload: signalState(state, { decision: "idempotent", applied: false }) };
  if (prior) fail("E_SIGNAL_CONFLICT", "the same revision already accepted different signal content", { facts });
  fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${state.revision}`, { facts });
}

async function assertCurrentWorkflow(root, state) {
  if (!state.active) fail("E_IDLE", "there is no active work item");
  const loaded = await loadWorkflow(root, state.active.workflow.ref);
  if (!loaded.report.valid) fail("E_WORKFLOW_INVALID", "active workflow is structurally invalid", { facts: loaded.report });
  if (loaded.digest !== state.active.workflow.digest) fail("E_WORKFLOW_DRIFT", "active workflow changed after work started", { facts: { expected: state.active.workflow.digest, actual: loaded.digest } });
  const stateReport = validateStateAgainstWorkflow(state, loaded.workflow);
  if (!stateReport.valid) fail("E_STATE_INVALID", "active state does not match its workflow", { facts: stateReport });
  return loaded;
}

async function execute({ runtimeRoot, cwd, command, context }) {
  if (command.kind === "version") {
    const manifest = await loadHarnessManifest(runtimeRoot);
    return { exitCode: 0, payload: { schemaVersion: 1, name: manifest.name, version: manifest.version, minimumNodeVersion: manifest.minimumNodeVersion } };
  }
  const root = (await repositoryPaths(await realpath(cwd))).root;
  if (command.kind === "check-environment") {
    const payload = validateEnvironmentManifest(await readRepoText(root, command.file, "AI environment manifest"));
    return { exitCode: payload.valid ? 0 : 1, payload };
  }
  if (command.kind === "check-result") {
    const loaded = await loadWorkflow(root, command.workflow);
    const stageResult = await readRepoJson(root, command.file, "stage result");
    const validation = loaded.report.valid
      ? await validateStageResult(loaded.workflow, command.stage, stageResult, { root })
      : { valid: false, errors: [], warnings: [], policyFailures: [] };
    const transition = loaded.workflow.transitions?.find((entry) => entry.from === command.stage && entry.on === stageResult.outcome) ?? null;
    const errors = [...loaded.report.errors, ...validation.errors];
    if (transition === null && errors.length === 0) errors.push({ code: "E_TRANSITION_MISSING", path: "outcome", message: `no transition for ${command.stage}/${stageResult.outcome}` });
    const valid = errors.length === 0;
    const policySatisfied = valid && validation.policyFailures.length === 0;
    const completionEligible = policySatisfied && transition?.to === "complete";
    const payload = {
      valid,
      policySatisfied,
      completionEligible,
      requiresHumanApproval: transition?.gate?.mode === "human",
      stage: command.stage,
      outcome: stageResult.outcome ?? null,
      transition: transition ? { id: transition.id, to: transition.to, gate: transition.gate.mode } : null,
      policyFailures: validation.policyFailures,
      errors,
      warnings: [...loaded.report.warnings, ...validation.warnings],
    };
    const exitCode = !valid ? 2 : !policySatisfied || command.requireComplete && !completionEligible ? 1 : 0;
    return { exitCode, payload };
  }
  if (command.kind === "check") {
    const state = await loadState(root);
    context.state = state;
    const workflowPath = command.workflow ?? state.active?.workflow.ref ?? DEFAULT_WORKFLOW;
    const loaded = await loadWorkflow(root, workflowPath);
    const errors = [...loaded.report.errors];
    if (state.active && (state.active.workflow.ref !== workflowPath || state.active.workflow.digest !== loaded.digest)) {
      errors.push({ code: "E_WORKFLOW_DRIFT", path: "state.active.workflow", message: "active workflow reference or digest differs" });
    } else if (state.active) errors.push(...validateStateAgainstWorkflow(state, loaded.workflow).errors);
    const payload = { ...publicState(state), valid: errors.length === 0, errors, warnings: loaded.report.warnings, workflow: { id: loaded.workflow.id, version: loaded.workflow.version, digest: loaded.digest } };
    return { exitCode: payload.valid ? 0 : 2, payload };
  }
  if (command.kind === "status") {
    const maintenance = await readCanonicalMaintenance(root);
    if (maintenance) {
      return { exitCode: 0, payload: { revision: null, status: "maintenance", stage: null, pendingGate: null, allowedActions: [], active: null, last: null, transaction: maintenance, nextActions: [formatRecoveryCommand(maintenance, root)] } };
    }
    const state = await loadState(root);
    context.state = state;
    let workflowDrift = false;
    if (state.active) {
      try { await assertCurrentWorkflow(root, state); }
      catch (error) { if (new Set(["E_WORKFLOW_DRIFT", "E_WORKFLOW_INVALID", "E_REFERENCE_INVALID"]).has(error.code)) workflowDrift = true; else throw error; }
    }
    const payload = publicState(state, { workflowDrift });
    if (workflowDrift) {
      payload.allowedActions = ["abort"];
      payload.nextActions = nextActionsFor(payload);
    }
    return { exitCode: 0, payload };
  }
  if (command.kind === "start") {
    const state = await loadState(root);
    context.state = state;
    const result = await mutateState(root, state.revision, async (current) => {
      const loaded = await loadWorkflow(root, command.workflow);
      if (!loaded.report.valid) fail("E_WORKFLOW_INVALID", "workflow is structurally invalid", { facts: loaded.report });
      return applyControl({ state: current, workflow: loaded.workflow, command: { kind: "start", intent: command.intent, workflowRef: command.workflow, workflowDigest: loaded.digest } });
    });
    return { exitCode: 0, payload: publicState(result.state) };
  }
  if (command.kind === "signal") {
    const expectedRevision = command.revision;
    const state = await loadState(root);
    context.state = state;
    if (state.revision !== expectedRevision) return signalRevisionMismatch(state, expectedRevision, await readRepoJson(root, command.file, "stage result"));
    if (!state.active) fail("E_IDLE", "there is no active work item");
    const loaded = await assertCurrentWorkflow(root, state);
    const stageResult = await readRepoJson(root, command.file, "stage result");
    const validation = await validateStageResult(loaded.workflow, state.active.stage, stageResult, { root });
    if (!validation.valid) fail("E_RESULT_INVALID", "stage result is structurally invalid", { facts: validation });
    let result;
    try {
      result = await mutateState(root, expectedRevision, (current) => applyControl({ state: current, workflow: loaded.workflow, command: { kind: "signal", expectedRevision, result: stageResult } }));
    } catch (error) {
      if (error.code !== "E_STALE_REVISION") throw error;
      const latest = await loadState(root);
      context.state = latest;
      return signalRevisionMismatch(latest, expectedRevision, stageResult);
    }
    const payload = signalState(result.state, { decision: result.decision.kind, unmet: result.decision.unmet ?? [], applied: true });
    return { exitCode: new Set(["await-human", "policy-blocked"]).has(result.decision.kind) ? 1 : 0, payload };
  }
  if (command.kind === "decide") {
    const expectedRevision = command.revision;
    const state = await loadState(root);
    context.state = state;
    if (!state.active) fail("E_IDLE", "there is no active work item");
    if (state.revision !== expectedRevision) fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${state.revision}`, { facts: { expectedRevision, currentRevision: state.revision } });
    let workflow = null;
    if (command.action !== "abort") workflow = (await assertCurrentWorkflow(root, state)).workflow;
    const actor = command.actor ?? await readGitActor(root);
    if (!actor) fail("E_USAGE", "--actor is required when git user.name is unavailable");
    const human = { action: command.action, actor, reason: command.reason, target: command.target, acceptRisk: command.acceptRisk ?? [] };
    const result = await mutateState(root, expectedRevision, (current) => applyControl({ state: current, workflow, command: { kind: "decide", expectedRevision, decision: human } }));
    return { exitCode: 0, payload: publicState(result.state, { decision: result.decision.kind }) };
  }
  fail("E_USAGE", `unknown command: ${command.kind}`);
}

export async function runRuntimeCommand({ runtimeRoot, cwd, command }) {
  const context = { state: null };
  try { return await execute({ runtimeRoot, cwd, command, context }); }
  catch (error) {
    const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
    const current = context.state ? publicState(context.state) : {
      revision: normalized.facts?.currentRevision ?? null,
      status: "error",
      stage: null,
      pendingGate: null,
      allowedActions: [],
      nextActions: [],
    };
    return {
      exitCode: normalized.exitCode,
      payload: { ...current, error: { code: normalized.code, message: normalized.message, facts: normalized.facts, repair: normalized.repair } },
    };
  }
}
