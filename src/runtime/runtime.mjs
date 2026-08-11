import { realpath } from "node:fs/promises";
import { applyControl, digestValue, inspectState } from "./kernel.mjs";
import { computeBinding, inspectActiveBinding, loadProfiles, resolveWorkflowSelection } from "./selection.mjs";
import { HarnessError, fail } from "../shared/errors.mjs";
import { loadHarnessManifest } from "../shared/manifest.mjs";
import { readRepoJson, readRepoText } from "../shared/repo-io.mjs";
import { formatRecoveryCommand, readCanonicalMaintenance, repositoryPaths } from "../shared/repository-guard.mjs";
import { inspectSkillsReadiness } from "../shared/skills.mjs";
import { loadState, mutateState, readGitActor } from "./store.mjs";
import { validateEnvironmentManifest, validateStageResult, validateStateAgainstWorkflow, validateWorkflow } from "./validation/index.mjs";

const DEFAULT_START_PROFILE = "core";

async function loadWorkflow(root, path) {
  const workflow = await readRepoJson(root, path, "workflow");
  const report = await validateWorkflow(workflow, { root, workflowPath: path });
  return { workflow, report, catalog: report.catalog ?? null, digest: digestValue(workflow) };
}

function nextActionsFor(value) {
  const revisionArg = `--revision ${value.revision}`;
  return (value.allowedActions ?? []).map((action) => {
    if (action === "start") return value.startAction ?? `./harness start --profile ${DEFAULT_START_PROFILE} --intent "<intent>"`;
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

async function assertActiveBinding(root, state) {
  if (!state.active) fail("E_IDLE", "there is no active work item");
  const inspection = await inspectActiveBinding({ root, active: state.active, loadWorkflowFor: (ref) => loadWorkflow(root, ref) });
  if (inspection.drift) {
    const first = inspection.issues[0];
    fail(first.code, first.message, { facts: { issues: inspection.issues } });
  }
  const stateReport = validateStateAgainstWorkflow(state, inspection.loaded.workflow);
  if (!stateReport.valid) fail("E_STATE_INVALID", "active state does not match its workflow", { facts: stateReport });
  return inspection.loaded;
}

// Resolves the effective selection for state commands. An explicit selector
// must match the Active binding exactly; a Workflow ref cannot impersonate a
// Profile-bound Work Item.
async function selectionForCommand(root, state, command) {
  const active = state.active;
  if (!active) return resolveWorkflowSelection({ root, profileId: command.profile ?? null, workflowRef: command.workflow ?? null });
  const boundProfile = active.profileId ?? null;
  const boundRef = active.workflowRef ?? active.workflow.ref;
  if (command.profile) {
    if (boundProfile !== command.profile) fail("E_BINDING_MISMATCH", `active work item is bound to profile "${boundProfile ?? "none"}", not "${command.profile}"`, { facts: { boundProfile, boundRef } });
    return resolveWorkflowSelection({ root, profileId: command.profile });
  }
  if (command.workflow) {
    if (boundProfile !== null) fail("E_BINDING_MISMATCH", `active work item is bound to profile "${boundProfile}"; an explicit --workflow cannot impersonate the binding`, { facts: { boundProfile, boundRef } });
    if (boundRef !== command.workflow) fail("E_BINDING_MISMATCH", "explicit workflow differs from the active binding", { facts: { boundProfile, boundRef } });
    return resolveWorkflowSelection({ root, workflowRef: command.workflow });
  }
  return resolveWorkflowSelection({ root, profileId: boundProfile, workflowRef: boundProfile ? null : boundRef });
}

async function execute({ runtimeRoot, cwd, command, context }) {
  if (command.kind === "version") {
    const manifest = await loadHarnessManifest(runtimeRoot);
    return { exitCode: 0, payload: { schemaVersion: 1, name: manifest.name, version: manifest.version, minimumNodeVersion: manifest.minimumNodeVersion } };
  }
  const root = (await repositoryPaths(await realpath(cwd))).root;
  if (command.kind === "profiles") {
    const registry = await loadProfiles(root);
    return {
      exitCode: 0,
      payload: {
        defaultProfile: registry.defaultProfile,
        profiles: registry.profiles.map((entry) => ({ ...entry, default: entry.id === registry.defaultProfile })),
      },
    };
  }
  if (command.kind === "check-environment") {
    const payload = validateEnvironmentManifest(await readRepoText(root, command.file, "AI environment manifest"));
    return { exitCode: payload.valid ? 0 : 1, payload };
  }
  if (command.kind === "check-result") {
    const selection = await resolveWorkflowSelection({ root, profileId: command.profile ?? null, workflowRef: command.workflow ?? null });
    const loaded = await loadWorkflow(root, selection.workflowRef);
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
    const selection = await selectionForCommand(root, state, command);
    const loaded = await loadWorkflow(root, selection.workflowRef);
    const errors = [...loaded.report.errors];
    if (state.active) {
      const boundRef = state.active.workflowRef ?? state.active.workflow.ref;
      if (boundRef !== selection.workflowRef || state.active.workflow.digest !== loaded.digest) {
        errors.push({ code: "E_WORKFLOW_DRIFT", path: "state.active.workflow", message: "active workflow reference or digest differs" });
      } else if (state.active.bindingDigest === undefined || state.active.bindingDigest === null) {
        errors.push({ code: "E_BINDING_LEGACY", path: "state.active.binding", message: "active binding predates Profile binding; abort and restart the Work Item" });
      } else {
        const binding = await computeBinding({ root, selection, workflow: loaded.workflow, catalog: loaded.catalog });
        for (const entry of binding.issues) errors.push({ code: entry.code, path: "state.active.binding", message: entry.message });
        if (binding.issues.length === 0 && binding.bindingDigest !== state.active.bindingDigest) {
          errors.push({ code: "E_BINDING_DRIFT", path: "state.active.binding", message: "active binding inputs changed after work started" });
        }
        if (errors.length === 0) errors.push(...validateStateAgainstWorkflow(state, loaded.workflow).errors);
      }
    }
    const readiness = await inspectSkillsReadiness({ root, workflow: loaded.workflow, catalog: loaded.catalog });
    const valid = errors.length === 0 && readiness.valid;
    const payload = {
      ...publicState(state),
      valid,
      errors,
      warnings: [...loaded.report.warnings, ...readiness.warnings],
      workflow: { id: loaded.workflow.id, version: loaded.workflow.version, digest: loaded.digest },
      selection: { profileId: selection.profileId, workflowRef: selection.workflowRef },
      skillsReadiness: { valid: readiness.valid, ready: readiness.ready, issues: readiness.issues },
    };
    return { exitCode: !valid ? 2 : !readiness.ready ? 1 : 0, payload };
  }
  if (command.kind === "status") {
    const maintenance = await readCanonicalMaintenance(root);
    if (maintenance) {
      return { exitCode: 0, payload: { revision: null, status: "maintenance", stage: null, pendingGate: null, allowedActions: [], active: null, last: null, transaction: maintenance, nextActions: [formatRecoveryCommand(maintenance, root)] } };
    }
    const state = await loadState(root);
    context.state = state;
    let workflowDrift = false;
    let bindingDrift = false;
    let bindingIssues = [];
    if (state.active) {
      const inspection = await inspectActiveBinding({ root, active: state.active, loadWorkflowFor: (ref) => loadWorkflow(root, ref) });
      workflowDrift = inspection.workflowDrift;
      bindingDrift = inspection.drift;
      bindingIssues = inspection.issues;
      if (!inspection.drift && inspection.loaded) {
        const stateReport = validateStateAgainstWorkflow(state, inspection.loaded.workflow);
        if (!stateReport.valid) fail("E_STATE_INVALID", "active state does not match its workflow", { facts: stateReport });
      }
    }
    const payload = publicState(state, {
      workflowDrift,
      profileId: state.active?.profileId ?? null,
      workflowRef: state.active ? state.active.workflowRef ?? state.active.workflow.ref : null,
      bindingDrift,
      bindingIssues,
    });
    if (bindingDrift) {
      payload.allowedActions = ["abort"];
      payload.nextActions = nextActionsFor(payload);
    }
    return { exitCode: 0, payload };
  }
  if (command.kind === "start") {
    const state = await loadState(root);
    context.state = state;
    const selection = await resolveWorkflowSelection({ root, profileId: command.profile ?? null, workflowRef: command.workflow ?? null });
    const loaded = await loadWorkflow(root, selection.workflowRef);
    if (!loaded.report.valid) fail("E_WORKFLOW_INVALID", "workflow is structurally invalid", { facts: loaded.report });
    const readiness = await inspectSkillsReadiness({ root, workflow: loaded.workflow, catalog: loaded.catalog });
    if (!readiness.valid) {
      const first = readiness.issues[0];
      fail(first.code, first.message, { facts: { issues: readiness.issues } });
    }
    if (!readiness.ready) {
      fail("E_SKILLS_NOT_READY", "required skills are not ready", { exitCode: 1, facts: { issues: readiness.issues }, repair: readiness.issues[0]?.repair ?? null });
    }
    const binding = await computeBinding({ root, selection, workflow: loaded.workflow, catalog: loaded.catalog });
    if (binding.issues.length > 0) {
      const first = binding.issues[0];
      fail(first.code, first.message, { facts: { issues: binding.issues } });
    }
    const result = await mutateState(root, state.revision, async (current) => applyControl({
      state: current,
      workflow: loaded.workflow,
      command: {
        kind: "start",
        intent: command.intent,
        workflowRef: selection.workflowRef,
        workflowDigest: loaded.digest,
        profileId: selection.profileId,
        bindingDigest: binding.bindingDigest,
        bindingLockDigest: binding.lockDigest,
      },
    }));
    return { exitCode: 0, payload: { ...publicState(result.state), selection: { profileId: selection.profileId, workflowRef: selection.workflowRef }, warnings: readiness.warnings } };
  }
  if (command.kind === "signal") {
    const expectedRevision = command.revision;
    const state = await loadState(root);
    context.state = state;
    if (state.revision !== expectedRevision) return signalRevisionMismatch(state, expectedRevision, await readRepoJson(root, command.file, "stage result"));
    if (!state.active) fail("E_IDLE", "there is no active work item");
    const loaded = await assertActiveBinding(root, state);
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
    if (command.action !== "abort") workflow = (await assertActiveBinding(root, state)).workflow;
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
