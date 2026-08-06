#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installOverlay, OverlayInstallError } from "./install-overlay-core.mjs";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELP = `Usage:
  node scripts/install-overlay.mjs --target <git-repo> --platform <codex|claude|omp> [--json]

The target must already contain real .harness/config.json, AGENTS.md and
SPECS/architecture.md project facts. Existing files are never overwritten.

Exit codes: 0 installed or already current, 1 prerequisite/conflict/write refusal, 2 usage/source/target error.`;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument !== "--target" && argument !== "--platform") {
      throw new OverlayInstallError("overlay-install.usage", `未知参数：${argument}`, { exitCode: 2, repair: HELP });
    }
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new OverlayInstallError("overlay-install.usage", `${argument} 缺少值`, { exitCode: 2, repair: HELP });
    }
    if (options[key] !== undefined) {
      throw new OverlayInstallError("overlay-install.usage", `${argument} 不能重复`, { exitCode: 2, repair: HELP });
    }
    options[key] = value;
    index += 1;
  }
  if (!options.target || !options.platform) {
    throw new OverlayInstallError("overlay-install.usage", "--target 和 --platform 都是必填项", { exitCode: 2, repair: HELP });
  }
  return options;
}

function textOutput(result) {
  for (const path of result.created) process.stdout.write(`CREATED ${path}\n`);
  for (const path of result.kept) process.stdout.write(`KEPT ${path}\n`);
  for (const path of result.preserved) process.stdout.write(`PRESERVED ${path}\n`);
  process.stdout.write(`OK overlay-install: ${result.platform} -> ${result.target}\n`);
  for (const next of result.next) process.stdout.write(`NEXT ${next}\n`);
}

async function main(argv) {
  let options = {};
  try {
    options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    const result = await installOverlay({
      sourceRoot: SOURCE_ROOT,
      targetRoot: options.target,
      platform: options.platform,
    });
    if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else textOutput(result);
    return 0;
  } catch (error) {
    const normalized = error instanceof OverlayInstallError
      ? error
      : new OverlayInstallError("overlay-install.internal", error instanceof Error ? error.message : String(error), { exitCode: 2 });
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ error: {
        code: normalized.code,
        message: normalized.message,
        repair: normalized.repair,
        facts: normalized.facts,
      } }, null, 2)}\n`);
    }
    process.stderr.write(`ERROR ${normalized.code}: ${normalized.message}\n`);
    if (normalized.repair) process.stderr.write(`REPAIR: ${normalized.repair}\n`);
    return normalized.exitCode;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
