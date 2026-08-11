#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HarnessError } from "../src/shared/errors.mjs";
import { exitCodeForStatus, runDistributionCommand } from "../src/distribution/lifecycle.mjs";
import { loadHarnessManifest } from "../src/shared/manifest.mjs";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELP = `Usage:
  ai-vibe-demo-kit init [--target <path>] [--json]
  ai-vibe-demo-kit upgrade [--target <path>] [--apply] [--json]
  ai-vibe-demo-kit sync [--target <path>] [--apply] [--json]
  ai-vibe-demo-kit doctor [--target <path>] [--json]
  ai-vibe-demo-kit uninstall [--target <path>] [--apply] [--json]
  ai-vibe-demo-kit recover [--target <path>] --strategy <resume|rollback> [--apply] [--json]
  ai-vibe-demo-kit version [--json]`;

const COMMANDS = {
  init: new Set(["target", "json"]),
  upgrade: new Set(["target", "apply", "json"]),
  sync: new Set(["target", "apply", "json"]),
  doctor: new Set(["target", "json"]),
  uninstall: new Set(["target", "apply", "json"]),
  recover: new Set(["target", "strategy", "apply", "json"]),
  version: new Set(["json"]),
};
const BOOLEAN = new Set(["apply", "json", "help"]);

function parse(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      options._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (BOOLEAN.has(key)) {
      if (options[key] !== undefined) throw new HarnessError("E_USAGE", `--${key} cannot be repeated`, { repair: HELP });
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new HarnessError("E_USAGE", `--${key} requires a value`, { repair: HELP });
    if (options[key] !== undefined) throw new HarnessError("E_USAGE", `--${key} cannot be repeated`, { repair: HELP });
    options[key] = value;
    index += 1;
  }
  return options;
}

function validate(options) {
  const command = options._[0];
  if (options.help || command === "help" || !command) return null;
  const allowed = COMMANDS[command];
  if (!allowed || options._.length !== 1) throw new HarnessError("E_USAGE", `unknown or malformed command: ${command}`, { repair: HELP });
  for (const key of Object.keys(options)) if (key !== "_" && !allowed.has(key)) throw new HarnessError("E_USAGE", `unknown option for ${command}: --${key}`, { repair: HELP });
  if (command === "recover" && !new Set(["resume", "rollback"]).has(options.strategy)) throw new HarnessError("E_USAGE", "recover requires --strategy resume or rollback", { repair: HELP });
  return command;
}

function fallback(command, error, packageManifest) {
  return {
    schemaVersion: 1,
    command: command ?? "unknown",
    status: "error",
    target: null,
    applied: false,
    package: { name: packageManifest?.name ?? "ai-vibe-demo-kit", version: packageManifest?.version ?? null, installedVersion: null },
    transaction: null,
    changes: [],
    readiness: null,
    warnings: [],
    errors: [{ code: error.code ?? "E_IO", path: null, message: error.message, facts: error.facts ?? null, repair: error.repair ?? null }],
    nextActions: [],
  };
}

function print(options, payload) {
  if (options.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else {
    process.stdout.write(`${payload.command}: ${payload.status}\n`);
    for (const warning of payload.warnings) process.stdout.write(`WARNING ${warning.code}: ${warning.message}\n`);
    for (const error of payload.errors) process.stderr.write(`ERROR ${error.code}: ${error.message}\n`);
    for (const action of payload.nextActions) process.stdout.write(`NEXT ${action}\n`);
  }
}

async function main(argv) {
  let options = { _: [], json: argv.includes("--json") };
  let command = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
  let packageManifest = null;
  try {
    packageManifest = await loadHarnessManifest(SOURCE_ROOT);
    options = parse(argv);
    command = validate(options);
    if (!command) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    const payload = await runDistributionCommand({
      sourceRoot: SOURCE_ROOT,
      command,
      target: options.target ?? process.cwd(),
      apply: options.apply === true,
      strategy: options.strategy ?? null,
    });
    print(options, payload);
    return exitCodeForStatus(payload.status);
  } catch (error) {
    const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
    const payload = fallback(command, normalized, packageManifest);
    print(options, payload);
    return 2;
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
