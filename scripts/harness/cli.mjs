#!/usr/bin/env node

import { abort, align, check, finish, guardWrite, status } from "./lib/control.mjs";
import { resolveContext } from "./lib/context.mjs";
import { HarnessError } from "./lib/errors.mjs";

const HELP = `Usage:
  harness status [--json] [--root <dir>]
  harness align --intent <text> --done-when <text> [--done-when <text> ...]
      [--constraint <text>] [--source <text>] [--risk normal|high]
      [--risk-reason <text>] [--rollback <text>] [--json]
  harness align --confirm <digest> --quote <text> [--json]
  harness check [--json]
  harness finish [--confirm <digest> --quote <text>] [--json]
  harness abort --reason <text> [--json]
  harness context guard --file <path> --session <id> [--json]

Exit codes: 0 success, 1 gate refusal, 2 usage/state/dependency failure.`;

const BOOLEAN_FLAGS = new Set(["json", "help"]);
const REPEATED_FLAGS = new Set(["done-when", "constraint", "source", "risk-reason"]);

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      options._.push(argument);
      continue;
    }
    const key = argument.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new HarnessError("E_USAGE", `--${key} 缺少值`, { exitCode: 2, repair: HELP });
    if (REPEATED_FLAGS.has(key)) {
      if (!options[key]) options[key] = [];
      options[key].push(value);
    } else if (options[key] !== undefined) {
      throw new HarnessError("E_USAGE", `--${key} 不能重复`, { exitCode: 2, repair: HELP });
    } else options[key] = value;
    index += 1;
  }
  return options;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function human(value) {
  if (value.decision === "blocked") return `${value.target}: blocked（已交付上下文，同 session 重试）`;
  if (value.decision === "allowed" || value.decision === "unmanaged") return `${value.target}: ${value.decision}`;
  if (value.decision === "confirmation-required") return `confirmation required: ${value.confirmationDigest}`;
  if (value.completed) return `completed: ${value.last?.id ?? "task"}`;
  if (value.aborted) return `aborted: baseline ${value.baseline.commit}`;
  if (value.report) return `${value.report.profile}: ${value.report.passed ? "passed" : "failed"}`;
  if (value.idle) return `idle${value.last ? `; last=${value.last.outcome}` : ""}`;
  return `${value.active.id}: ${value.active.phase} (${value.active.risk.level})`;
}

function output(options, value) {
  if (options.json) writeJson(value);
  else process.stdout.write(`${human(value)}\n`);
}

async function execute(options) {
  if (options.help || options._[0] === "help") {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const command = options._[0];
  const ctx = await resolveContext({ root: options.root });
  if (command === "status" && options._.length === 1) {
    output(options, await status(ctx));
    return 0;
  }
  if (command === "align" && options._.length === 1) {
    const result = options.confirm
      ? await align({ ...ctx, confirmation: { digest: options.confirm, quote: options.quote } })
      : await align({
          ...ctx,
          draft: {
            intent: options.intent,
            doneWhen: options["done-when"] ?? [],
            constraints: options.constraint ?? [],
            sources: options.source ?? [],
            risk: options.risk ?? "normal",
            riskReasons: options["risk-reason"] ?? [],
            rollback: options.rollback,
          },
        });
    output(options, result);
    return result.decision === "confirmation-required" ? 1 : 0;
  }
  if (command === "check" && options._.length === 1) {
    output(options, await check(ctx));
    return 0;
  }
  if (command === "finish" && options._.length === 1) {
    const result = await finish({
      ...ctx,
      confirmation: options.confirm ? { digest: options.confirm, quote: options.quote } : null,
    });
    output(options, result);
    return result.decision === "confirmation-required" ? 1 : 0;
  }
  if (command === "abort" && options._.length === 1) {
    output(options, await abort({ ...ctx, reason: options.reason }));
    return 0;
  }
  if (command === "context" && options._[1] === "guard" && options._.length === 2) {
    let delivered = false;
    const result = await guardWrite({
      ...ctx,
      targetPath: options.file,
      sessionId: options.session,
      deliver: async (bundle) => {
        delivered = true;
        output(options, bundle);
      },
    });
    if (!delivered) output(options, result);
    return result.decision === "blocked" ? 1 : 0;
  }
  throw new HarnessError("E_USAGE", `未知命令：${options._.join(" ") || "<empty>"}`, { exitCode: 2, repair: HELP });
}

async function main(argv) {
  let options = { _: [] };
  try {
    options = parseArgs(argv);
    return await execute(options);
  } catch (error) {
    const normalized = error instanceof HarnessError
      ? error
      : new HarnessError("E_STATE", error instanceof Error ? error.message : String(error), { exitCode: 2 });
    const payload = {
      error: {
        code: normalized.code,
        message: normalized.message,
        repair: normalized.repair,
        facts: normalized.facts,
      },
    };
    if (options.json) writeJson(payload);
    process.stderr.write(`ERROR ${normalized.code}: ${normalized.message}\n`);
    if (normalized.repair) process.stderr.write(`REPAIR: ${normalized.repair}\n`);
    return normalized.exitCode;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
