#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HarnessError, fail } from "../shared/errors.mjs";
import { runRuntimeCommand } from "./runtime.mjs";

const RUNTIME_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HELP = `Usage:
  harness version [--json]
  harness check [--workflow <path>] [--json]
  harness check-architecture --file <project.yml> [--json]
  harness check-environment --file <AI_ENVIRONMENT.md> [--json]
  harness check-result --workflow <path> --stage <stage> --file <stage-result.json>
      [--require-complete] [--json]
  harness start --workflow <path> --intent <text> [--json]
  harness status [--json]
  harness signal --revision <n> --file <stage-result.json> [--json]
  harness decide --revision <n> --action <approve|reject|pause|resume|redirect|override|abort>
      [--actor <name>] --reason <text> [--target <stage>]
      [--accept-risk <condition-id> ...] [--json]

Exit codes: 0 success, 1 environment/gate/policy refusal, 2 usage/structure/state/I/O error.`;

const BOOLEAN = new Set(["json", "help", "require-complete"]);
const REPEATED = new Set(["accept-risk"]);
const COMMAND_OPTIONS = {
  version: new Set(["json"]),
  check: new Set(["workflow", "json"]),
  "check-architecture": new Set(["file", "json"]),
  "check-environment": new Set(["file", "json"]),
  "check-result": new Set(["workflow", "stage", "file", "require-complete", "json"]),
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

function normalize(options) {
  const kind = options._[0];
  const allowed = COMMAND_OPTIONS[kind];
  if (!allowed || options._.length !== 1) fail("E_USAGE", `unknown or malformed command: ${kind ?? ""}`.trim(), { repair: HELP });
  for (const key of Object.keys(options)) if (key !== "_" && !allowed.has(key)) fail("E_USAGE", `unknown option for ${kind}: --${key}`, { repair: HELP });
  if (new Set(["check-architecture", "check-environment"]).has(kind) && !options.file) fail("E_USAGE", `${kind} requires --file`, { repair: HELP });
  if (kind === "check-result" && (!options.workflow || !options.stage || !options.file)) fail("E_USAGE", "check-result requires --workflow, --stage and --file", { repair: HELP });
  if (kind === "start" && (!options.workflow || !options.intent)) fail("E_USAGE", "start requires --workflow and --intent", { repair: HELP });
  if (kind === "signal" && !options.file) fail("E_USAGE", "signal requires --file", { repair: HELP });
  if (kind === "decide" && (!options.action || !options.reason)) fail("E_USAGE", "decide requires --action and --reason", { repair: HELP });
  return {
    kind,
    workflow: options.workflow,
    stage: options.stage,
    file: options.file,
    requireComplete: options["require-complete"] === true,
    intent: options.intent,
    revision: new Set(["signal", "decide"]).has(kind) ? revision(options.revision) : undefined,
    action: options.action,
    actor: options.actor,
    reason: options.reason,
    target: options.target,
    acceptRisk: options["accept-risk"] ?? [],
  };
}

function print(options, command, result) {
  const { payload } = result;
  if (options.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else if (payload.error) {
    process.stderr.write(`ERROR ${payload.error.code}: ${payload.error.message}\n`);
    if (payload.error.repair) process.stderr.write(`REPAIR: ${payload.error.repair}\n`);
  } else if (command.kind === "version") process.stdout.write(`${payload.name} ${payload.version} (Node.js ${payload.minimumNodeVersion}+)\n`);
  else if (payload.valid !== undefined) process.stdout.write(payload.valid ? "check: valid\n" : `check: invalid (${payload.errors.length} error(s))\n`);
  else {
    process.stdout.write(`${payload.status}: revision=${payload.revision}${payload.stage ? ` stage=${payload.stage}` : ""}\n`);
    if (payload.nextActions?.length) process.stdout.write(`next actions:\n${payload.nextActions.map((entry) => `  ${entry}`).join("\n")}\n`);
  }
}

function usageFailure(options, error) {
  const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
  return {
    exitCode: normalized.exitCode,
    payload: {
      revision: normalized.facts?.currentRevision ?? null,
      status: "error",
      stage: null,
      pendingGate: null,
      allowedActions: [],
      nextActions: [],
      error: { code: normalized.code, message: normalized.message, facts: normalized.facts, repair: normalized.repair },
    },
  };
}

async function main(argv) {
  let options = { _: [], json: argv.includes("--json") };
  try {
    options = parseArgs(argv);
    const kind = options._[0];
    if (options.help || kind === "help" || !kind) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    const command = normalize(options);
    const result = await runRuntimeCommand({ runtimeRoot: RUNTIME_ROOT, cwd: process.cwd(), command });
    print(options, command, result);
    return result.exitCode;
  } catch (error) {
    const result = usageFailure(options, error);
    print(options, { kind: options._[0] ?? "unknown" }, result);
    return result.exitCode;
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
