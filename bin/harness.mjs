#!/usr/bin/env node
import { readFile, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { applyControl, digestValue, inspectState } from "../scripts/harness/lib/kernel.mjs";
import { HarnessError, fail } from "../scripts/harness/lib/errors.mjs";
import { installHarness } from "../scripts/harness/lib/installer.mjs";
import { loadHarnessManifest } from "../scripts/harness/lib/manifest.mjs";
import { loadState, mutateState, readGitActor, statePaths } from "../scripts/harness/lib/store.mjs";
import { validateStageResult, validateStateAgainstWorkflow, validateWorkflow } from "../scripts/harness/lib/validator.mjs";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELP = `Usage:
  harness init --target <git-root> [--json]
  harness version [--json]
  harness check [--workflow <path>] [--json]
  harness start --workflow <path> --intent <text> [--json]
  harness status [--json]
  harness signal --revision <n> --file <stage-result.json> [--json]
  harness decide --revision <n> --action <approve|reject|pause|resume|redirect|override|abort>
      [--actor <name>] --reason <text> [--target <stage>]
      [--accept-risk <condition-id> ...] [--json]

Exit codes: 0 success, 1 gate/policy refusal, 2 usage/structure/state/I/O error.`;

const BOOLEAN = new Set(["json", "help"]);
const REPEATED = new Set(["accept-risk"]);
const COMMAND_OPTIONS = {
  init: new Set(["target", "json"]),
  version: new Set(["json"]),
  check: new Set(["workflow", "json"]),
  start: new Set(["workflow", "intent", "json"]),
  status: new Set(["json"]),
  signal: new Set(["revision", "file", "json"]),
  decide: new Set(["revision", "action", "actor", "reason", "target", "accept-risk", "json"]),
};

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      options._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (BOOLEAN.has(key)) {
      options[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) fail("E_USAGE", `--${key} requires a value`, { repair: HELP });
    if (REPEATED.has(key)) {
      options[key] ??= [];
      options[key].push(next);
    } else if (options[key] !== undefined) fail("E_USAGE", `--${key} cannot be repeated`, { repair: HELP });
    else options[key] = next;
    index += 1;
  }
  return options;
}

function revision(value) {
  if (!/^\d+$/.test(value ?? "")) fail("E_USAGE", "--revision must be a non-negative integer", { repair: HELP });
  return Number(value);
}

function assertCommandOptions(command, options) {
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed) return;
  if (options._.length !== 1) fail("E_USAGE", `${command} accepts no positional arguments`, { repair: HELP });
  for (const key of Object.keys(options)) {
    if (key !== "_" && !allowed.has(key)) fail("E_USAGE", `unknown option for ${command}: --${key}`, { repair: HELP });
  }
}

async function rootFromCwd() {
  return (await statePaths(process.cwd())).root;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function readRepoJson(root, path, label) {
  if (typeof path !== "string" || path.trim() === "" || isAbsolute(path)) fail("E_PATH_OUTSIDE", `${label} path must be repository-relative`);
  const target = resolve(root, path);
  if (!inside(root, target)) fail("E_PATH_OUTSIDE", `${label} path leaves the repository`);
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) fail("E_PATH_SYMLINK", `${label} path must not be a symlink`);
    const actual = await realpath(target);
    if (!inside(root, actual)) fail("E_PATH_OUTSIDE", `${label} resolves outside the repository`);
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    if (error.code === "ENOENT") fail("E_REFERENCE_INVALID", `${label} file does not exist: ${path}`);
    fail("E_REFERENCE_INVALID", `${label} is not valid JSON: ${error.message}`);
  }
}

async function loadWorkflow(root, path) {
  const workflow = await readRepoJson(root, path, "workflow");
  const report = await validateWorkflow(workflow, { root, workflowPath: path });
  return { workflow, report, digest: digestValue(workflow) };
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

function nextActionsFor(value) {
  const revisionArg = `--revision ${value.revision}`;
  return (value.allowedActions ?? []).map((action) => {
    if (action === "start") return './harness start --workflow workflows/workflow-template.json --intent "<intent>"';
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

function handleSignalRevisionMismatch(options, state, expectedRevision, stageResult) {
  const facts = { expectedRevision, currentRevision: state.revision };
  if (state.active?.status === "paused") fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${state.revision}`, { facts });
  const signalDigest = digestValue(stageResult);
  const records = state.active?.results ?? state.last?.results ?? [];
  const prior = records.find((entry) => entry.baseRevision === expectedRevision);
  if (prior?.digest === signalDigest) {
    output(options, signalState(state, { decision: "idempotent", applied: false }));
    return 0;
  }
  if (prior) fail("E_SIGNAL_CONFLICT", "the same revision already accepted different signal content", { facts });
  fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${state.revision}`, { facts });
}

function output(options, value) {
  if (options.json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (value.error) process.stderr.write(`ERROR ${value.error.code}: ${value.error.message}\n`);
  else if (value.valid !== undefined) process.stdout.write(value.valid ? "check: valid\n" : `check: invalid (${value.errors.length} error(s))\n`);
  else {
    process.stdout.write(`${value.status}: revision=${value.revision}${value.stage ? ` stage=${value.stage}` : ""}\n`);
    if (value.nextActions?.length) process.stdout.write(`next actions:\n${value.nextActions.map((entry) => `  ${entry}`).join("\n")}\n`);
  }
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

async function execute(options, context) {
  const command = options._[0];
  if (options.help || command === "help" || !command) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  assertCommandOptions(command, options);
  if (command === "version") {
    const manifest = await loadHarnessManifest(SOURCE_ROOT);
    if (options.json) process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    else process.stdout.write(`${manifest.name} ${manifest.version} (Node.js ${manifest.minimumNodeVersion}+)\n`);
    return 0;
  }
  if (command === "init") {
    if (options._.length !== 1 || !options.target) fail("E_USAGE", "init requires --target", { repair: HELP });
    const installed = await installHarness({ sourceRoot: SOURCE_ROOT, targetRoot: options.target });
    output(options, { ...installed, status: "installed", revision: 0, stage: null, pendingGate: null, allowedActions: ["check", "start"] });
    return 0;
  }

  const root = await rootFromCwd();
  if (command === "check") {
    const state = await loadState(root);
    context.state = state;
    const workflowPath = options.workflow ?? state.active?.workflow.ref ?? "workflows/workflow-template.json";
    const loaded = await loadWorkflow(root, workflowPath);
    const errors = [...loaded.report.errors];
    if (state.active && (state.active.workflow.ref !== workflowPath || state.active.workflow.digest !== loaded.digest)) {
      errors.push({ code: "E_WORKFLOW_DRIFT", path: "state.active.workflow", message: "active workflow reference or digest differs" });
    } else if (state.active) {
      errors.push(...validateStateAgainstWorkflow(state, loaded.workflow).errors);
    }
    const report = { ...publicState(state), valid: errors.length === 0, errors, warnings: loaded.report.warnings, workflow: { id: loaded.workflow.id, version: loaded.workflow.version, digest: loaded.digest } };
    output(options, report);
    return report.valid ? 0 : 2;
  }
  if (command === "status") {
    if (options._.length !== 1) fail("E_USAGE", "status accepts no positional arguments", { repair: HELP });
    const state = await loadState(root);
    context.state = state;
    let workflowDrift = false;
    if (state.active) {
      try { await assertCurrentWorkflow(root, state); }
      catch (error) { if (error.code === "E_WORKFLOW_DRIFT" || error.code === "E_WORKFLOW_INVALID" || error.code === "E_REFERENCE_INVALID") workflowDrift = true; else throw error; }
    }
    const view = publicState(state, { workflowDrift });
    if (workflowDrift) {
      view.allowedActions = ["abort"];
      view.nextActions = nextActionsFor(view);
    }
    output(options, view);
    return 0;
  }
  if (command === "start") {
    if (!options.workflow || !options.intent) fail("E_USAGE", "start requires --workflow and --intent", { repair: HELP });
    const state = await loadState(root);
    context.state = state;
    const loaded = await loadWorkflow(root, options.workflow);
    if (!loaded.report.valid) fail("E_WORKFLOW_INVALID", "workflow is structurally invalid", { facts: loaded.report });
    const result = await mutateState(root, state.revision, (current) => applyControl({
      state: current,
      workflow: loaded.workflow,
      command: { kind: "start", intent: options.intent, workflowRef: options.workflow, workflowDigest: loaded.digest },
    }));
    const view = publicState(result.state);
    output(options, view);
    return 0;
  }
  if (command === "signal") {
    if (!options.file) fail("E_USAGE", "signal requires --file", { repair: HELP });
    const expectedRevision = revision(options.revision);
    const state = await loadState(root);
    context.state = state;
    if (state.revision !== expectedRevision) {
      const repeated = await readRepoJson(root, options.file, "stage result");
      return handleSignalRevisionMismatch(options, state, expectedRevision, repeated);
    }
    if (!state.active) fail("E_IDLE", "there is no active work item");
    const loaded = await assertCurrentWorkflow(root, state);
    const stageResult = await readRepoJson(root, options.file, "stage result");
    const validation = await validateStageResult(loaded.workflow, state.active.stage, stageResult, { root });
    if (!validation.valid) fail("E_RESULT_INVALID", "stage result is structurally invalid", { facts: validation });
    let result;
    try {
      result = await mutateState(root, expectedRevision, (current) => applyControl({ state: current, workflow: loaded.workflow, command: { kind: "signal", expectedRevision, result: stageResult } }));
    } catch (error) {
      if (error.code !== "E_STALE_REVISION") throw error;
      const latest = await loadState(root);
      context.state = latest;
      return handleSignalRevisionMismatch(options, latest, expectedRevision, stageResult);
    }
    const view = signalState(result.state, { decision: result.decision.kind, unmet: result.decision.unmet ?? [], applied: true });
    output(options, view);
    return new Set(["await-human", "policy-blocked"]).has(result.decision.kind) ? 1 : 0;
  }
  if (command === "decide") {
    const expectedRevision = revision(options.revision);
    if (!options.action || !options.reason) fail("E_USAGE", "decide requires --action and --reason", { repair: HELP });
    const state = await loadState(root);
    context.state = state;
    if (!state.active) fail("E_IDLE", "there is no active work item");
    if (state.revision !== expectedRevision) fail("E_STALE_REVISION", `expected revision ${expectedRevision}, current revision is ${state.revision}`, { facts: { expectedRevision, currentRevision: state.revision } });
    let workflow = null;
    if (options.action !== "abort") workflow = (await assertCurrentWorkflow(root, state)).workflow;
    const actor = options.actor ?? await readGitActor(root);
    if (!actor) fail("E_USAGE", "--actor is required when git user.name is unavailable");
    const human = { action: options.action, actor, reason: options.reason, target: options.target, acceptRisk: options["accept-risk"] ?? [] };
    const result = await mutateState(root, expectedRevision, (current) => applyControl({ state: current, workflow, command: { kind: "decide", expectedRevision, decision: human } }));
    const view = publicState(result.state, { decision: result.decision.kind });
    output(options, view);
    return 0;
  }
  fail("E_USAGE", `unknown command: ${command}`, { repair: HELP });
}

async function main(argv) {
  let options = { _: [] };
  const context = { state: null };
  try {
    options = parseArgs(argv);
    return await execute(options, context);
  } catch (error) {
    const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
    const current = context.state ? publicState(context.state) : {
      revision: normalized.facts?.currentRevision ?? null,
      status: "error",
      stage: null,
      pendingGate: null,
      allowedActions: [],
      nextActions: [],
    };
    const payload = {
      ...current,
      error: { code: normalized.code, message: normalized.message, facts: normalized.facts, repair: normalized.repair },
    };
    if (options.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else {
      process.stderr.write(`ERROR ${normalized.code}: ${normalized.message}\n`);
      if (normalized.repair) process.stderr.write(`REPAIR: ${normalized.repair}\n`);
    }
    return normalized.exitCode;
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
