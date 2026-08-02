#!/usr/bin/env node
// harness-stage.mjs — workflow-state.json 的唯一写入入口（状态机运行时门禁）。
// 零第三方依赖。阶段只允许单步推进，每次推进必须携带用户原话证据；
// Agent 不得直接编辑 workflow-state.json。
//
// 用法:
//   node scripts/harness-stage.mjs status [--root <dir>]
//   node scripts/harness-stage.mjs advance --to <stage> [--by user] --quote "<用户原话>" [--root <dir>]
//
// 输出（Agent 可直接读取）:
//   ERROR <check-id> <path>: <problem>
//   REPAIR: <deterministic next action>
//
// 退出码: 0 成功；1 门禁拒绝；2 用法错误、解析失败或检查器不可用。
// advance 先对候选状态运行完整 preflight；只有检查全部通过才原子替换正式状态。

import { spawnSync } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";


const STAGES = [
  "initialized",
  "requirements-draft",
  "requirements-confirmed",
  "design-confirmed",
  "solution-options",
  "solution-selected",
  "implementation-ready",
  "accepted",
];

// requirements-confirmed 的下一步由 .harness/config.json 的 project.hasUserInterface 决定：
// UI 项目必须先经过 design-confirmed，非 UI 项目直接进入 solution-options。
const NEXT_STAGE = {
  initialized: ["requirements-draft"],
  "requirements-draft": ["requirements-confirmed"],
  "design-confirmed": ["solution-options"],
  "solution-options": ["solution-selected"],
  "solution-selected": ["implementation-ready"],
  "implementation-ready": ["accepted"],
  accepted: [],
};

function nextStages(stage, hasUi) {
  if (stage === "requirements-confirmed") return hasUi ? ["design-confirmed"] : ["solution-options"];
  return NEXT_STAGE[stage] ?? [];
}

async function readHasUserInterface(root) {
  try {
    const config = JSON.parse(await readFile(join(root, ".harness", "config.json"), "utf8"));
    return config?.project?.hasUserInterface === true;
  } catch {
    return false;
  }
}

const STAGE_DOC = {
  "requirements-draft": "workflow/requirements.md",
  "requirements-confirmed": "workflow/requirements.md",
  "design-confirmed": "workflow/design.md",
  "solution-options": "workflow/solution-options.md",
  "solution-selected": "workflow/solution-selected.md",
  "implementation-ready": "workflow/implementation-ready.md",
  accepted: "workflow/acceptance.md",
};

// 推进到这些阶段时同步更新确认/选定指针，保持状态机内部一致。
const CONFIRMED_DOC = {
  "requirements-confirmed": "workflow/requirements.md",
  "design-confirmed": "workflow/design.md",
  "implementation-ready": "workflow/implementation-ready.md",
  accepted: "workflow/acceptance.md",
};

function fail(id, path, problem, repair, code = 1) {
  process.stdout.write(`ERROR ${id} ${path}: ${problem}\n`);
  process.stdout.write(`REPAIR: ${repair}\n`);
  process.exit(code);
}

function isPlaceholderQuote(quote) {
  const trimmed = quote.trim();
  if (trimmed === "") return true;
  if (trimmed.includes("{{") || trimmed.includes("}}")) return true;
  if (/^<[^>]*>$/.test(trimmed)) return true;
  // 裸占位词不是证据；真实原话可以包含这些词，但必须说出具体内容。
  if (/^(用户原话|原话|placeholder|todo)$/i.test(trimmed)) return true;
  return false;
}

async function readState(root) {
  const path = join(root, "workflow-state.json");
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    fail("stage.state-missing", "workflow-state.json", "State file is missing.", "Restore workflow-state.json from the overlay copy.", 2);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(
      "stage.state-invalid-json",
      "workflow-state.json",
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      "Fix the JSON syntax; this command refuses to rewrite an unparseable state file.",
      2,
    );
  }
}

async function preflightAndWriteState(root, state) {
  const rel = `.harness/workflow-state.candidate-${process.pid}.json`;
  const candidate = join(root, rel);
  await writeFile(candidate, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const checker = join(root, "scripts", "harness-check.mjs");
  const result = spawnSync(process.execPath, [checker, "preflight", "--root", root, "--state-file", rel], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    await unlink(candidate).catch(() => {});
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 2);
  }
  await rename(candidate, join(root, "workflow-state.json"));
}

function parseArgs(argv) {
  const args = [...argv];
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const rootIndex = args.indexOf("--root");
  if (rootIndex !== -1) {
    const value = args[rootIndex + 1];
    if (!value) {
      process.stderr.write("ERROR stage.usage: --root requires a directory argument.\n");
      process.exit(2);
    }
    root = resolve(value);
    args.splice(rootIndex, 2);
  }
  const command = args.shift();
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!key.startsWith("--") || index + 1 >= args.length) {
      process.stderr.write(`ERROR stage.usage: unexpected argument "${key}".\n`);
      process.exit(2);
    }
    options[key.slice(2)] = args[index + 1];
  }
  return { command, options, root };
}

async function cmdStatus(root) {
  const state = await readState(root);
  if (!STAGES.includes(state.stage)) {
    fail("stage.unknown-stage", "workflow-state.json", `stage must be one of: ${STAGES.join(", ")}.`, "Restore workflow-state.json to a known stage; do not hand-edit the file.", 2);
  }
  process.stdout.write(`stage: ${state.stage}\n`);
  process.stdout.write(`allowedNextStages: ${JSON.stringify(state.allowedNextStages)}\n`);
  const last = Array.isArray(state.history) ? state.history[state.history.length - 1] : null;
  process.stdout.write(`lastAdvance: ${last ? JSON.stringify(last) : "none"}\n`);
  process.exit(0);
}

async function cmdAdvance(root, options) {
  const target = options.to;
  const by = options.by ?? "user";
  const quote = options.quote ?? "";

  if (!target) {
    fail("stage.usage", "workflow-state.json", "Missing --to <stage>.", "Run: node scripts/harness-stage.mjs advance --to <stage> --quote \"<用户原话>\"", 2);
  }
  if (!STAGES.includes(target)) {
    fail("stage.unknown-target", "workflow-state.json", `Unknown target stage "${target}".`, `Use one of: ${STAGES.join(", ")}.`, 2);
  }
  if (isPlaceholderQuote(quote)) {
    fail(
      "stage.missing-quote",
      "workflow-state.json",
      "advance requires the user's original words via --quote.",
      "Ask the user for an explicit release and pass their original words: --quote \"<用户原话>\". Agents must not fabricate quotes.",
    );
  }

  const state = await readState(root);
  if (!STAGES.includes(state.stage)) {
    fail("stage.unknown-stage", "workflow-state.json", `stage must be one of: ${STAGES.join(", ")}.`, "Restore workflow-state.json to a known stage; do not hand-edit the file.", 2);
  }

  // 状态文件被手改过时拒绝推进：转换表以本命令内置状态机为准。
  const hasUi = await readHasUserInterface(root);
  const expected = nextStages(state.stage, hasUi);
  if (!Array.isArray(state.allowedNextStages) || JSON.stringify(state.allowedNextStages) !== JSON.stringify(expected)) {
    fail(
      "stage.state-drifted",
      "workflow-state.json",
      `allowedNextStages drifted from the transition table for stage "${state.stage}".`,
      "Run node scripts/harness-check.mjs gates and restore the state file through harness-stage, never by hand.",
      2,
    );
  }

  if (!expected.includes(target)) {
    fail(
      "stage.not-allowed",
      "workflow-state.json",
      `Cannot advance from "${state.stage}" to "${target}"; allowed: ${JSON.stringify(expected)}.`,
      "Stages advance one step at a time. Complete the intermediate stage docs and release each step with a user quote.",
    );
  }

  // 目标阶段文档必须先存在：门禁以前置产物为条件，不接受先推进后补文档。
  const doc = STAGE_DOC[target] ?? null;
  if (doc) {
    try {
      await readFile(join(root, doc), "utf8");
    } catch {
      fail("stage.doc-missing", doc, `Target stage artifact is missing.`, `Create ${doc} from the matching workflow template before advancing to "${target}".`);
    }
  }

  const advancedAt = new Date().toISOString();
  const entry = { from: state.stage, to: target, advancedBy: by, advancedAt, quote: quote.trim(), doc: doc ?? state.currentStageDoc ?? "" };
  const next = {
    ...state,
    stage: target,
    allowedNextStages: nextStages(target, hasUi),
    currentStageDoc: doc ?? null,
    lastConfirmedDoc: CONFIRMED_DOC[target] ?? state.lastConfirmedDoc ?? null,
    history: [...(Array.isArray(state.history) ? state.history : []), entry],
  };
  if (CONFIRMED_DOC[target]) {
    next.confirmation = { by, at: advancedAt, quote: quote.trim(), doc: CONFIRMED_DOC[target] };
  }
  if (target === "solution-selected") {
    next.selection = { by, at: advancedAt, quote: quote.trim(), doc };
  }

  await preflightAndWriteState(root, next);
  process.stdout.write(`OK advanced ${state.stage} -> ${target}\n`);
  process.stdout.write(`PREFLIGHT: context, gates and evidence passed before state commit.\n`);
  process.exit(0);
}

const { command, options, root } = parseArgs(process.argv.slice(2));

if (command === "status") {
  await cmdStatus(root);
} else if (command === "advance") {
  await cmdAdvance(root, options);
} else {
  process.stdout.write(
    "Usage: node scripts/harness-stage.mjs status|advance [--root <dir>] [--to <stage>] [--by user] [--quote \"<用户原话>\"]\n" +
      "Exit codes: 0 ok, 1 gate refusal, 2 usage error or unparseable state.\n",
  );
  process.exit(command === "help" || command === "--help" || command === "-h" ? 0 : 2);
}
