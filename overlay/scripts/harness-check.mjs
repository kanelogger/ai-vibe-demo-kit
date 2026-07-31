#!/usr/bin/env node
// harness-check.mjs — AI Native Harness Overlay 的项目本地检查器。
// 只读、零第三方依赖。不创建文档、不修改状态、不推进阶段、不判断语义质量。
//
//   node scripts/harness-check.mjs context|gates|evidence|commit|all [--root <dir>]
//   node scripts/harness-check.mjs preflight --state-file <candidate.json> [--root <dir>]
// preflight 由 harness-stage 调用：对候选状态运行 context、gates 和 evidence，不修改正式状态。
//
// 输出（Agent 可直接读取）:
//   ERROR <check-id> <path>: <problem>
//   REPAIR: <deterministic next action>
//
// 退出码: 0 通过；1 存在必须修复的问题；2 配置或状态文件无法解析。
// 注意: 检查通过只代表 Harness 结构和当前阶段证据成立，不代表应用已验收。

import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VERIFICATION_REPORT_VERSION,
  commandPlan,
  createWorkspaceFingerprint,
  isSafeRelativePath,
  sha256,
  verificationSettings,
} from "./harness-runtime.mjs";

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

const HISTORY_FIELDS = ["from", "to", "advancedBy", "advancedAt", "quote", "doc"];

const CONTROL_PATHS = [
  "AGENTS.md",
  "HARNESS.md",
  "workflow-state.json",
  ".harness/config.json",
  ".harness/manifest.json",
  ".agents/skills.json",
  "workflow/README.md",
  "workflow/requirements.template.md",
  "workflow/design.template.md",
  "workflow/solution-options.template.md",
  "workflow/solution-selected.template.md",
  "workflow/implementation-ready.template.md",
  "workflow/acceptance.template.md",
  "SPECS/README.md",
  "SPECS/ARCHITECTURE.md",
  "SPECS/FEATURES",
  "tasks/README.md",
  "tasks/backlog.template.md",
  "tasks/sprint.template.md",
  "memory/decisions.md",
  "memory/adr",
  "rules/core.md",
  "rules/project-structure.md",
  "rules/ai-implementation.md",
  "rules/testing.md",
  "rules/security.md",
  "rules/git.md",
  "scripts/harness-check.mjs",
  "scripts/harness-runtime.mjs",
  "scripts/harness-stage.mjs",
  "scripts/harness-verify.mjs",
];

const PLACEHOLDER_SCAN_FILES = [
  "AGENTS.md",
  "HARNESS.md",
  "SPECS/ARCHITECTURE.md",
  "SPECS/README.md",
  "SPECS/API.md",
  "SPECS/DATABASE.md",
  "memory/decisions.md",
];

// 唯一契约来源：任一存在即要求项目登记机器契约校验。
const CONTRACT_SOURCE_FILES = ["SPECS/API.md", "SPECS/DATABASE.md"];

const ARCHITECTURE_IDENTITY_FIELDS = ["Product / service", "Primary users", "Primary outcome"];

// ---------------------------------------------------------------------------
// 报告器
// ---------------------------------------------------------------------------

function createReporter() {
  const issues = [];
  let parseFailure = false;
  return {
    issues,
    error(id, path, problem, repair) {
      issues.push({ id, path, problem, repair });
    },
    parseError(id, path, problem, repair) {
      parseFailure = true;
      issues.push({ id, path, problem, repair });
    },
    get parseFailure() {
      return parseFailure;
    },
  };
}

function printIssues(issues) {
  for (const item of issues) {
    process.stdout.write(`ERROR ${item.id} ${item.path}: ${item.problem}\n`);
    process.stdout.write(`REPAIR: ${item.repair}\n`);
  }
}

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(root, rel) {
  return readFile(join(root, rel), "utf8");
}

// 返回 { ok, value }；JSON 无法解析时 ok=false（退出码 2 语义）。
async function readJson(root, rel, reporter, checkId) {
  let raw;
  try {
    raw = await readText(root, rel);
  } catch {
    reporter.error(checkId, rel, "Required file is missing.", `Restore ${rel} from the overlay.`);
    return { ok: false, value: null, missing: true };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    reporter.parseError(
      checkId,
      rel,
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      `Fix the JSON syntax in ${rel}; the checker cannot evaluate an unparseable file.`,
    );
    return { ok: false, value: null, missing: false };
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index]);
}

function stageIndex(stage) {
  return STAGES.indexOf(stage);
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, "");
}

function parseSimpleYaml(yaml) {
  const result = {};
  let arrayKey = null;
  for (const rawLine of yaml.split(/\r?\n/)) {
    if (rawLine.trim() === "" || rawLine.trim().startsWith("#")) continue;
    const arrayMatch = rawLine.match(/^\s*-\s*(.+)$/);
    if (arrayMatch && arrayKey) {
      const existing = result[arrayKey];
      if (Array.isArray(existing)) existing.push(stripQuotes(arrayMatch[1].trim()));
      continue;
    }
    const index = rawLine.indexOf(":");
    if (index === -1) continue;
    const key = rawLine.slice(0, index).trim();
    const value = rawLine.slice(index + 1).trim();
    if (!value) {
      result[key] = [];
      arrayKey = key;
      continue;
    }
    arrayKey = null;
    if (value.startsWith("[") && value.endsWith("]")) {
      result[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => stripQuotes(item.trim()))
        .filter(Boolean);
    } else {
      result[key] = stripQuotes(value);
    }
  }
  return result;
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  return parseSimpleYaml(content.slice(4, end));
}

function allowedWorkflowFiles(stage, hasUi) {
  const files = [];
  if (stageIndex(stage) >= stageIndex("requirements-draft")) files.push("workflow/requirements.md");
  if (hasUi && stageIndex(stage) >= stageIndex("design-confirmed")) files.push("workflow/design.md");
  if (stageIndex(stage) >= stageIndex("solution-options")) files.push("workflow/solution-options.md");
  if (stageIndex(stage) >= stageIndex("solution-selected")) files.push("workflow/solution-selected.md");
  if (stageIndex(stage) >= stageIndex("implementation-ready")) files.push("workflow/implementation-ready.md");
  if (stageIndex(stage) >= stageIndex("accepted")) files.push("workflow/acceptance.md");
  for (const target of nextStages(stage, hasUi)) {
    if (target !== "initialized") files.push(STAGE_DOC[target]);
  }
  return new Set(files);
}

// ---------------------------------------------------------------------------
// context：冷启动六问所需入口
// ---------------------------------------------------------------------------

async function checkContext(root, reporter) {
  // 1. 控制面文件齐全（六问的物理入口）。
  for (const rel of CONTROL_PATHS) {
    if (!(await exists(join(root, rel)))) {
      reporter.error(
        "context.missing-path",
        rel,
        "Required harness path is missing.",
        `Restore ${rel} from the overlay copy, or record the gap explicitly in HARNESS.md.`,
      );
    }
  }

  // 2. 项目事实已填写（六问之“项目是什么”）。
  const config = await readJson(root, ".harness/config.json", reporter, "context.config-invalid-json");
  if (config.ok) {
    const value = config.value;
    if (!isRecord(value) || !isRecord(value.project) || !isNonEmptyString(value.project.name) || !isNonEmptyString(value.project.summary)) {
      reporter.error(
        "context.project-identity-missing",
        ".harness/config.json",
        "project.name and project.summary must be non-empty strings.",
        "Fill project.name and project.summary in .harness/config.json with real project facts.",
      );
    }
    // 六问之“如何验证”：机器命令已登记。
    if (isRecord(value)) {
      const commands = isRecord(value.commands) ? value.commands : {};
      const quick = isRecord(commands.quick) ? commands.quick : {};
      const full = isRecord(commands.full) ? commands.full : {};
      const hasStatic = [quick.static, full.static].some((list) => Array.isArray(list) && list.some(isNonEmptyString));
      const hasTest = [quick.test, full.test].some((list) => Array.isArray(list) && list.some(isNonEmptyString));
      if (!hasStatic || !hasTest) {
        reporter.error(
          "context.commands-missing",
          ".harness/config.json",
          "commands must register at least one static-check command and one test command (quick or full group).",
          "Register the project's real static-check and test commands under commands.quick in .harness/config.json.",
        );
      }
    }
  }

  // 3. 当前状态合法（六问之“走到哪一步”）。
  const state = await readJson(root, "workflow-state.json", reporter, "context.state-invalid-json");
  if (state.ok) {
    if (!isRecord(state.value) || !STAGES.includes(state.value.stage)) {
      reporter.error(
        "context.unknown-stage",
        "workflow-state.json",
        `stage must be one of: ${STAGES.join(", ")}.`,
        "Restore workflow-state.json to a known stage; advance only via node scripts/harness-stage.mjs, never by hand-editing.",
      );
    }
  }

  // 4. 关键占位符不得残留（防止“模板事实”被当成项目事实）。
  for (const rel of PLACEHOLDER_SCAN_FILES) {
    if (!(await exists(join(root, rel)))) continue;
    const content = await readText(root, rel);
    if (content.includes("{{") || content.includes("}}")) {
      reporter.error(
        "context.placeholder",
        rel,
        "Template placeholder markers {{ }} are still present.",
        `Replace all {{ ... }} placeholders in ${rel} with real project facts.`,
      );
    }
  }

  // 5. ARCHITECTURE.md 的项目身份与运行时地图必须填写。
  const archPath = "SPECS/ARCHITECTURE.md";
  if (await exists(join(root, archPath))) {
    const content = await readText(root, archPath);
    for (const field of ARCHITECTURE_IDENTITY_FIELDS) {
      const match = content.match(new RegExp(`^- ${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:[ \\t]*(.*)$`, "m"));
      if (match && match[1].trim() === "") {
        reporter.error(
          "context.architecture-unfilled",
          archPath,
          `Project identity field "${field}" is empty.`,
          `Fill "${field}" in SPECS/ARCHITECTURE.md from repository evidence; write 待确认 only with an explicit reason.`,
        );
      }
    }
    const runtimeSection = content.match(/^## Runtime And Tooling\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
    if (runtimeSection) {
      for (const line of runtimeSection[1].split(/\r?\n/)) {
        if (!line.startsWith("|") || line.includes("---") || line.includes("Area")) continue;
        const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
        const [label, ...values] = cells;
        if (label && values.every((value) => value === "")) {
          reporter.error(
            "context.architecture-unfilled",
            archPath,
            `Runtime And Tooling row "${label}" is empty.`,
            `Fill the "${label}" row in SPECS/ARCHITECTURE.md from repository evidence; write 待确认 only with an explicit reason.`,
          );
        }
      }
    }
  }

  // 6. Skill 索引只引用真实存在的目录。
  const skills = await readJson(root, ".agents/skills.json", reporter, "context.skills-invalid-json");
  if (skills.ok && isRecord(skills.value)) {
    const entries = Array.isArray(skills.value.skills) ? skills.value.skills : [];
    const aliases = new Set();
    for (const [index, entry] of entries.entries()) {
      if (!isRecord(entry)) {
        reporter.error("context.skill-entry-invalid", ".agents/skills.json", `skills[${index}] must be an object.`, "Use skill entries with alias and skill fields.");
        continue;
      }
      if (!isNonEmptyString(entry.alias)) {
        reporter.error("context.skill-entry-invalid", ".agents/skills.json", `skills[${index}] is missing alias.`, "Add a stable alias for every skill entry.");
      } else if (aliases.has(entry.alias)) {
        reporter.error("context.skill-entry-invalid", ".agents/skills.json", `Duplicate alias "${entry.alias}".`, "Keep aliases unique in .agents/skills.json.");
      } else {
        aliases.add(entry.alias);
      }
      if (!isNonEmptyString(entry.skill)) {
        reporter.error("context.skill-entry-invalid", ".agents/skills.json", `skills[${index}] is missing skill.`, "Point every alias to a real .agents/skills/<skill>/SKILL.md file.");
        continue;
      }
      const skillDoc = `.agents/skills/${entry.skill}/SKILL.md`;
      if (!(await exists(join(root, skillDoc)))) {
        reporter.error(
          "context.skill-missing",
          skillDoc,
          `Skill "${entry.skill}" referenced by alias "${entry.alias || `<index ${index}>`}" is missing.`,
          "Restore the missing skill directory or remove the entry from .agents/skills.json.",
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gates：阶段状态、文档前置和用户原话证据
// ---------------------------------------------------------------------------

async function checkGates(root, reporter, options = {}) {
  const stateRel = options.stateFile ?? "workflow-state.json";
  const stateResult = await readJson(root, stateRel, reporter, "gates.state-invalid-json");
  if (!stateResult.ok) return;
  const state = stateResult.value;

  if (!isRecord(state) || !STAGES.includes(state.stage)) {
    reporter.error(
      "gates.unknown-stage",
      "workflow-state.json",
      `stage must be one of: ${STAGES.join(", ")}.`,
      "Restore workflow-state.json to a known stage; advance only via node scripts/harness-stage.mjs, never by hand-editing.",
    );
    return;
  }
  const stage = state.stage;
  const hasUi = await readHasUserInterface(root);

  // 状态机一致性：允许转换必须与当前阶段匹配；仅改布尔值无法绕过。
  if (!sameArray(state.allowedNextStages, nextStages(stage, hasUi))) {
    reporter.error(
      "gates.bad-transitions",
      "workflow-state.json",
      `allowedNextStages must be ${JSON.stringify(nextStages(stage, hasUi))} for stage "${stage}".`,
      "Restore allowedNextStages from the transition table; stages advance only via node scripts/harness-stage.mjs advance --quote \"<用户原话>\".",
    );
  }

  // 历史记录必须携带用户放行证据。
  if (!Array.isArray(state.history)) {
    reporter.error("gates.bad-history", "workflow-state.json", "history must be an array.", "Restore history to an array; use [] for a fresh project.");
  } else {
    for (const [index, entry] of state.history.entries()) {
      for (const field of HISTORY_FIELDS) {
        if (!isRecord(entry) || !isNonEmptyString(entry[field])) {
          reporter.error(
            "gates.missing-history-evidence",
            "workflow-state.json",
            `history[${index}] is missing "${field}".`,
            "Re-record the advance via node scripts/harness-stage.mjs advance; every advance must carry from/to/advancedBy/advancedAt/quote/doc with the user's original words.",
          );
        }
      }
    }
  }

  // 当前阶段以后的产物不得提前存在。
  const workflowRoot = join(root, "workflow");
  if (await exists(workflowRoot)) {
    const allowed = allowedWorkflowFiles(stage, hasUi);
    for (const entry of await readdir(workflowRoot)) {
      if (!entry.endsWith(".md") || entry === "README.md" || entry.endsWith(".template.md")) continue;
      const rel = `workflow/${entry}`;
      if (!allowed.has(rel)) {
        reporter.error(
          "gates.premature-artifact",
          rel,
          `Workflow artifact is not allowed at stage "${stage}".`,
          `Remove ${rel} until it is the current stage artifact or the immediate target artifact.`,
        );
      }
    }
  }

  // 任务时机：backlog 从需求确认起必须存在；sprint 只在 implementation-ready 出现。
  const tasksRoot = join(root, "tasks");
  const backlog = "tasks/backlog.md";
  const hasBacklog = await exists(join(root, backlog));
  if (stageIndex(stage) < stageIndex("requirements-confirmed") && hasBacklog) {
    reporter.error("gates.task-timing", backlog, "Backlog is created too early.", "Create tasks/backlog.md only after requirements-confirmed.");
  }
  if (stageIndex(stage) >= stageIndex("requirements-confirmed") && !hasBacklog) {
    reporter.error("gates.task-timing", backlog, "Backlog is required from requirements-confirmed onward.", "Create tasks/backlog.md from the confirmed requirements.");
  }
  let sprintFiles = [];
  if (await exists(tasksRoot)) {
    sprintFiles = (await readdir(tasksRoot)).filter((name) => /^sprint-.*\.md$/.test(name) && !name.endsWith(".template.md"));
  }
  if (stageIndex(stage) < stageIndex("implementation-ready") && sprintFiles.length > 0) {
    reporter.error("gates.task-timing", `tasks/${sprintFiles[0]}`, "Sprint plan is created too early.", "Create sprint plans only at implementation-ready.");
  }
  if (stage === "implementation-ready" || stage === "accepted") {
    if (sprintFiles.length === 0) {
      reporter.error("gates.task-timing", "tasks/sprint-01.md", "A sprint plan is required from implementation-ready onward.", "Create tasks/sprint-01.md from tasks/sprint.template.md using the selected solution.");
    }
  }

  // 当前阶段文档的 frontmatter 证据。
  switch (stage) {
    case "initialized":
      break;
    case "requirements-draft":
      await requireFrontmatter(root, "workflow/requirements.md", { status: "draft" }, reporter);
      break;
    case "requirements-confirmed": {
      const meta = await requireFrontmatter(
        root,
        "workflow/requirements.md",
        { status: "confirmed", fields: ["confirmedBy", "confirmedAt", "confirmationQuote"] },
        reporter,
      );
      requireReleaseMatch(meta, state, "workflow/requirements.md", "confirmation", { by: "confirmedBy", at: "confirmedAt", quote: "confirmationQuote" }, reporter);
      if (state.lastConfirmedDoc !== "workflow/requirements.md") {
        reporter.error(
          "gates.state-doc-mismatch",
          "workflow-state.json",
          "lastConfirmedDoc must point to workflow/requirements.md.",
          "Re-record the requirements confirmation with the user quote, time, and doc reference.",
        );
      }
      break;
    }
    case "design-confirmed": {
      const meta = await requireFrontmatter(
        root,
        "workflow/design.md",
        { status: "confirmed", fields: ["confirmedBy", "confirmedAt", "confirmationQuote", "prototypeCommand", "prototypeEvidence"] },
        reporter,
      );
      requireReleaseMatch(meta, state, "workflow/design.md", "confirmation", { by: "confirmedBy", at: "confirmedAt", quote: "confirmationQuote" }, reporter);
      if (!meta || !Array.isArray(meta.prototypePaths) || meta.prototypePaths.length === 0 || !meta.prototypePaths.every(isSafeRelativePath)) {
        reporter.error("gates.prototype-paths-missing", "workflow/design.md", "prototypePaths must list safe repository-relative runnable prototype files.", "Register the HTML/CSS/component/mock-data artifacts used for design confirmation.");
      } else {
        for (const path of [...meta.prototypePaths, meta.prototypeEvidence]) {
          if (!isSafeRelativePath(path) || !(await exists(join(root, path)))) {
            reporter.error("gates.prototype-evidence-missing", "workflow/design.md", `Executable prototype evidence is missing: ${path}`, "Create the registered prototype artifact or evidence file before design confirmation.");
          }
        }
      }
      if (state.lastConfirmedDoc !== "workflow/design.md") {
        reporter.error(
          "gates.state-doc-mismatch",
          "workflow-state.json",
          "lastConfirmedDoc must point to workflow/design.md.",
          "Re-record the design confirmation with the user quote, time, and doc reference.",
        );
      }
      break;
    }
    case "solution-options": {
      const meta = await requireFrontmatter(root, "workflow/solution-options.md", { status: "proposed" }, reporter);
      if (meta && (!Array.isArray(meta.optionIds) || meta.optionIds.length !== 3)) {
        reporter.error(
          "gates.bad-option-ids",
          "workflow/solution-options.md",
          "optionIds must contain exactly 3 ids.",
          "Set frontmatter `optionIds: [option-a, option-b, option-c]`.",
        );
      }
      break;
    }
    case "solution-selected": {
      const meta = await requireFrontmatter(
        root,
        "workflow/solution-selected.md",
        { status: "selected", fields: ["selectionType", "selectedOptionId", "selectedBy", "selectedAt", "selectionQuote"] },
        reporter,
      );
      requireReleaseMatch(meta, state, "workflow/solution-selected.md", "selection", { by: "selectedBy", at: "selectedAt", quote: "selectionQuote" }, reporter);
      if (meta && meta.selectionType !== "option" && meta.selectionType !== "custom") {
        reporter.error(
          "gates.bad-selection-type",
          "workflow/solution-selected.md",
          "selectionType must be option or custom.",
          "Use `selectionType: option` or `selectionType: custom`.",
        );
      }
      const selectedOptionId = meta && isNonEmptyString(meta.selectedOptionId) ? meta.selectedOptionId : "";
      if (!selectedOptionId) {
        reporter.error(
          "gates.missing-selected-option",
          "workflow/solution-selected.md",
          "selectedOptionId is required.",
          "Record the user-selected option id in frontmatter.",
        );
      } else if (await exists(join(root, "memory/decisions.md"))) {
        const decisions = await readText(root, "memory/decisions.md");
        if (!decisions.includes(selectedOptionId)) {
          reporter.error(
            "gates.decision-not-recorded",
            "memory/decisions.md",
            `Missing selected option id "${selectedOptionId}".`,
            "Record the same selectedOptionId in memory/decisions.md with its source.",
          );
        }
      }
      break;
    }
    case "implementation-ready": {
      const meta = await requireFrontmatter(
        root,
        "workflow/implementation-ready.md",
        { status: "ready", fields: ["confirmedBy", "confirmedAt", "confirmationQuote"] },
        reporter,
      );
      requireReleaseMatch(meta, state, "workflow/implementation-ready.md", "confirmation", { by: "confirmedBy", at: "confirmedAt", quote: "confirmationQuote" }, reporter);
      if (state.lastConfirmedDoc !== "workflow/implementation-ready.md") {
        reporter.error(
          "gates.state-doc-mismatch",
          "workflow-state.json",
          "lastConfirmedDoc must point to workflow/implementation-ready.md.",
          "Re-record the implementation release with the user quote, time, and doc reference.",
        );
      }
      break;
    }
    case "accepted": {
      const meta = await requireFrontmatter(
        root,
        "workflow/acceptance.md",
        { status: "accepted", fields: ["confirmedBy", "confirmedAt", "confirmationQuote"] },
        reporter,
      );
      requireReleaseMatch(meta, state, "workflow/acceptance.md", "confirmation", { by: "confirmedBy", at: "confirmedAt", quote: "confirmationQuote" }, reporter);
      if (state.lastConfirmedDoc !== "workflow/acceptance.md") {
        reporter.error(
          "gates.state-doc-mismatch",
          "workflow-state.json",
          "lastConfirmedDoc must point to workflow/acceptance.md.",
          "Re-record the acceptance with the user quote, time, and doc reference.",
        );
      }
      break;
    }
  }
}

async function requireFrontmatter(root, rel, required, reporter) {
  if (!(await exists(join(root, rel)))) {
    reporter.error("gates.missing-stage-doc", rel, "Required workflow artifact is missing.", `Create ${rel} for the current stage from the matching template.`);
    return null;
  }
  const content = await readText(root, rel);
  const meta = parseFrontmatter(content);
  if (!meta) {
    reporter.error("gates.missing-frontmatter", rel, "Missing YAML frontmatter.", `Add frontmatter with at least \`status: ${required.status}\`.`);
    return null;
  }
  if (meta.status !== required.status) {
    reporter.error("gates.bad-status", rel, `status must be "${required.status}".`, `Set frontmatter \`status: ${required.status}\`; the doc status must match the released stage.`);
  }
  for (const field of required.fields ?? []) {
    if (!isNonEmptyString(meta[field])) {
      reporter.error(
        field.endsWith("Quote") ? "gates.missing-user-quote" : "gates.missing-frontmatter-field",
        rel,
        `Missing frontmatter field "${field}".`,
        field.endsWith("Quote")
          ? `Record the user's original words in \`${field}\`; agents must not fabricate user confirmation.`
          : `Add \`${field}\` to ${rel} frontmatter.`,
      );
    }
  }
  return meta;
}

function requireReleaseMatch(meta, state, rel, recordName, fields, reporter) {
  if (!meta) return;
  const record = state[recordName];
  const latest = Array.isArray(state.history) ? state.history[state.history.length - 1] : null;
  const validTime = !Number.isNaN(Date.parse(meta[fields.at]));
  const matches =
    isRecord(record) &&
    record.doc === rel &&
    record.by === meta[fields.by] &&
    record.quote === meta[fields.quote] &&
    latest?.to === state.stage &&
    latest.doc === rel &&
    latest.advancedBy === record.by &&
    latest.quote === record.quote;
  if (!matches || !validTime) {
    reporter.error(
      "gates.release-evidence-mismatch",
      rel,
      "Frontmatter, state release record and latest history entry must describe the same user release.",
      "Use the same user, original quote and document in frontmatter and harness-stage --by/--quote; confirmed/selected time must be valid.",
    );
  }
}

// ---------------------------------------------------------------------------
// evidence：执行闭环的可审计入口
// ---------------------------------------------------------------------------

function isValidUserPath(entry) {
  if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.description) || !isRecord(entry.verify)) return false;
  if (entry.verify.mode === "command") return isNonEmptyString(entry.verify.command);
  return entry.verify.mode === "manual" && isNonEmptyString(entry.verify.instructions) && isSafeRelativePath(entry.verify.evidence);
}

function isValidCleanup(entry) {
  if (!isRecord(entry)) return false;
  if (entry.mode === "command") return isNonEmptyString(entry.command);
  return entry.mode === "none" && isNonEmptyString(entry.reason);
}

function reportField(content, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.match(new RegExp(`^- ${escaped}:[ \\t]*(.*)$`, "m"));
}

async function validateAcceptedReport(root, reporter, configValue, configRaw, options, contractSources) {
  const settings = verificationSettings(configValue);
  const reportPath = settings.reportPath;
  if (!isSafeRelativePath(reportPath)) return;
  const reportResult = await readJson(root, reportPath, reporter, "evidence.verification-report-invalid");
  if (!reportResult.ok || !isRecord(reportResult.value)) return;
  const report = reportResult.value;
  if (!isNonEmptyString(report.reportId) || report.reportPath !== reportPath || report.project !== configValue.project?.name) {
    reporter.error(
      "evidence.verification-report-identity-invalid",
      reportPath,
      "Verification report id, path and project must match the current project configuration.",
      "Regenerate the report with node scripts/harness-verify.mjs full.",
    );
  }
  if (report.version !== VERIFICATION_REPORT_VERSION || report.status !== "passed" || report.profile !== "full" || report.sourceStage !== "implementation-ready") {
    reporter.error(
      "evidence.verification-report-not-passed",
      reportPath,
      "Accepted requires a version-1, full, passed report produced from implementation-ready.",
      "Run node scripts/harness-verify.mjs full at implementation-ready and resolve every failed check before acceptance.",
    );
  }
  if (report.configSha256 !== sha256(configRaw)) {
    reporter.error(
      "evidence.verification-report-stale-config",
      reportPath,
      "Verification report does not match the current .harness/config.json.",
      "Re-run node scripts/harness-verify.mjs full after the configuration change.",
    );
  }
  const generatedAt = Date.parse(report.generatedAt);
  const ageMs = Date.now() - generatedAt;
  if (!Number.isFinite(generatedAt) || ageMs < -300_000 || ageMs > settings.maxAgeHours * 3_600_000) {
    reporter.error(
      "evidence.verification-report-stale",
      reportPath,
      `Verification report must be current within ${settings.maxAgeHours} hour(s).`,
      "Re-run node scripts/harness-verify.mjs full immediately before acceptance.",
    );
  }

  const expectedChecks = commandPlan(configValue, "full", contractSources.length > 0);
  const checks = Array.isArray(report.checks) ? report.checks : [];
  for (const expected of expectedChecks) {
    if (!checks.some((item) => isRecord(item) && item.kind === expected.kind && item.command === expected.command && item.status === "passed")) {
      reporter.error(
        "evidence.verification-command-not-passed",
        reportPath,
        `No passing result for ${expected.kind} command: ${expected.command}`,
        "Re-run the full verifier with the current command registry and fix the failing command.",
      );
    }
  }
  const pathResults = Array.isArray(report.criticalUserPaths) ? report.criticalUserPaths : [];
  for (const path of configValue.criticalUserPaths ?? []) {
    if (!pathResults.some((item) => isRecord(item) && item.id === path.id && item.status === "passed")) {
      reporter.error(
        "evidence.user-path-not-passed",
        reportPath,
        `Critical user path "${path.id}" has no passing evidence.`,
        "Run the configured command or provide the configured manual evidence artifact, then re-run full verification.",
      );
    }
  }
  const cleanupResults = Array.isArray(report.cleanup) ? report.cleanup : [];
  for (const cleanup of configValue.recovery?.testDataCleanup ?? []) {
    const matched = cleanupResults.some((item) => {
      if (!isRecord(item) || item.mode !== cleanup.mode || item.status !== "passed") return false;
      return cleanup.mode === "none" ? item.reason === cleanup.reason : item.command === cleanup.command;
    });
    if (!matched) {
      reporter.error(
        "evidence.cleanup-not-passed",
        reportPath,
        "Configured test-data cleanup has no passing result.",
        "Fix and re-run the configured cleanup through node scripts/harness-verify.mjs full.",
      );
    }
  }

  if (!isSafeRelativePath(report.sprint) || !(await exists(join(root, report.sprint)))) {
    reporter.error("evidence.report-sprint-missing", reportPath, "Verification report does not reference an existing sprint.", "Set report.sprint to the verified tasks/sprint-*.md document.");
  }
  const acceptancePath = "workflow/acceptance.md";
  if (await exists(join(root, acceptancePath))) {
    const acceptance = await readText(root, acceptancePath);
    if (!acceptance.includes(reportPath) || !acceptance.includes(report.reportId ?? "")) {
      reporter.error(
        "evidence.acceptance-report-mismatch",
        acceptancePath,
        "Acceptance does not reference the current machine report path and report id.",
        `Reference ${reportPath}#${report.reportId} in the acceptance evidence section.`,
      );
    }
  }

  if (settings.workspaceFingerprint === "git") {
    try {
      const exclusions = [reportPath, report.sprint, acceptancePath, "workflow-state.json", options.stateFile].filter(Boolean);
      const current = await createWorkspaceFingerprint(root, exclusions);
      if (!isRecord(report.workspace) || report.workspace.sha256 !== current.sha256 || report.workspace.head !== current.head) {
        reporter.error(
          "evidence.verification-report-stale-workspace",
          reportPath,
          "Project files changed after verification.",
          "Re-run node scripts/harness-verify.mjs full on the current workspace before acceptance.",
        );
      }
    } catch (error) {
      reporter.error(
        "evidence.workspace-fingerprint-failed",
        ".",
        error instanceof Error ? error.message : String(error),
        "Restore Git access and re-run full verification, or configure an explicit equivalent audit mode.",
      );
    }
  }
}

async function checkEvidence(root, reporter, options = {}) {
  const config = await readJson(root, ".harness/config.json", reporter, "evidence.config-invalid-json");
  const configValue = config.ok && isRecord(config.value) ? config.value : null;
  const configRaw = config.ok ? await readText(root, ".harness/config.json") : "";
  const stateRel = options.stateFile ?? "workflow-state.json";
  const stateResult = await readJson(root, stateRel, reporter, "evidence.state-invalid-json");
  const state = stateResult.ok && isRecord(stateResult.value) ? stateResult.value : null;
  const contractSources = [];
  for (const rel of CONTRACT_SOURCE_FILES) {
    if (await exists(join(root, rel))) contractSources.push(rel);
  }

  if (configValue) {
    const commands = isRecord(configValue.commands) ? configValue.commands : {};
    const quick = isRecord(commands.quick) ? commands.quick : {};
    const full = isRecord(commands.full) ? commands.full : {};
    const validCommandList = (list, required) => Array.isArray(list) && (!required || list.length > 0) && list.every(isNonEmptyString);
    if (!validCommandList(quick.static, true) || !validCommandList(quick.test, true) || !validCommandList(full.static, false) || !validCommandList(full.test, false)) {
      reporter.error(
        "evidence.commands-missing",
        ".harness/config.json",
        "commands.quick requires executable static and test commands; full lists must contain only commands.",
        "Register real commands under commands.quick; leave full arrays empty to reuse quick.",
      );
    }
    if (contractSources.length > 0 && (!Array.isArray(commands.contracts) || !commands.contracts.some(isNonEmptyString) || !commands.contracts.every(isNonEmptyString))) {
      reporter.error(
        "evidence.contracts-missing",
        ".harness/config.json",
        `${contractSources.join(" and ")} exists but commands.contracts has no executable contract check.`,
        "Register the project's real contract-check command, or remove unused contract templates.",
      );
    }

    const hasUi = configValue.project && configValue.project.hasUserInterface === true;
    const paths = Array.isArray(configValue.criticalUserPaths) ? configValue.criticalUserPaths : [];
    if (hasUi && paths.length === 0) {
      reporter.error("evidence.user-path-missing", ".harness/config.json", "UI projects require at least one criticalUserPath.", "Register each path with command verification or a repository evidence artifact.");
    }
    const pathIds = paths.filter(isRecord).map((entry) => entry.id).filter(isNonEmptyString);
    if (new Set(pathIds).size !== pathIds.length) {
      reporter.error("evidence.user-path-duplicate", ".harness/config.json", "criticalUserPaths ids must be unique.", "Assign one stable unique id to every critical user path.");
    }
    for (const [index, entry] of paths.entries()) {
      if (!isValidUserPath(entry)) {
        reporter.error(
          "evidence.user-path-incomplete",
          ".harness/config.json",
          `criticalUserPaths[${index}] has an invalid verification contract.`,
          "Use verify { mode: command, command } or { mode: manual, instructions, evidence }.",
        );
      }
    }

    const recovery = isRecord(configValue.recovery) ? configValue.recovery : {};
    if (!Array.isArray(recovery.testDataCleanup) || recovery.testDataCleanup.length === 0 || !recovery.testDataCleanup.every(isValidCleanup)) {
      reporter.error(
        "evidence.cleanup-missing",
        ".harness/config.json",
        "recovery.testDataCleanup requires executable command steps or an explicit none reason.",
        "Use { mode: command, command } or { mode: none, reason }.",
      );
    }
    if (!Array.isArray(recovery.rollback) || !recovery.rollback.some(isNonEmptyString) || !recovery.rollback.every(isNonEmptyString)) {
      reporter.error("evidence.rollback-missing", ".harness/config.json", "recovery.rollback must list concrete rollback steps.", "Register rollback commands or procedures.");
    }

    const rawSettings = isRecord(configValue.verification) ? configValue.verification : {};
    const settings = verificationSettings(configValue);
    if (!isSafeRelativePath(settings.reportPath) || !(settings.maxAgeHours > 0) || !(settings.commandTimeoutMs > 0) || !["git", "none"].includes(rawSettings.workspaceFingerprint)) {
      reporter.error(
        "evidence.verification-config-invalid",
        ".harness/config.json",
        "verification requires a safe reportPath, positive maxAgeHours/commandTimeoutMs, and git|none workspaceFingerprint.",
        "Fill every verification setting; use git unless an equivalent audit mechanism is documented.",
      );
    }
    if (settings.workspaceFingerprint === "none" && !isNonEmptyString(configValue.notes)) {
      reporter.error("evidence.workspace-audit-missing", ".harness/config.json", "workspaceFingerprint none requires an equivalent audit explanation.", "Document the equivalent source-fingerprint mechanism in notes.");
    }
  }

  const sourceRegisterDocs = ["workflow/requirements.md", "workflow/design.md", "workflow/solution-options.md", "workflow/implementation-ready.md"];
  const featuresRoot = join(root, "SPECS", "FEATURES");
  if (await exists(featuresRoot)) {
    for (const entry of await readdir(featuresRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) sourceRegisterDocs.push(`SPECS/FEATURES/${entry.name}/spec.md`);
    }
  }
  for (const rel of sourceRegisterDocs) {
    if (!(await exists(join(root, rel)))) continue;
    const content = await readText(root, rel);
    if (!/^#{1,3}\s+Source Register/m.test(content)) {
      reporter.error("evidence.source-register-missing", rel, "Document has no Source Register section.", `Add a Source Register section to ${rel}; write 无来源 explicitly with a reason when no source exists.`);
    }
  }

  const reqRel = "workflow/requirements.md";
  if (await exists(join(root, reqRel))) {
    const content = await readText(root, reqRel);
    const meta = parseFrontmatter(content);
    if (meta && meta.status === "confirmed" && content.includes("> 用户原话")) {
      reporter.error("evidence.placeholder-quote", reqRel, "Confirmed requirements still contain the user-quote placeholder.", "Replace the placeholder with the user's actual words before confirmation.");
    }
  }

  const sprintFiles = [];
  const tasksRoot = join(root, "tasks");
  if (await exists(tasksRoot)) {
    for (const name of await readdir(tasksRoot)) {
      if (!/^sprint-.*\.md$/.test(name) || name.endsWith(".template.md")) continue;
      const rel = `tasks/${name}`;
      sprintFiles.push(rel);
      const content = await readText(root, rel);
      if (!/^##\s+Verification Report/m.test(content)) {
        reporter.error("evidence.report-missing", rel, "Sprint document has no Verification Report section.", `Add the report structure from tasks/sprint.template.md.`);
        continue;
      }
      for (const label of ["Machine report", "Commands", "Results", "Executed at", "User-path evidence", "Uncovered risks", "Cleanup performed", "Rollback steps", "提交哈希"]) {
        const match = reportField(content, label);
        if (!match || (state?.stage === "accepted" && !isNonEmptyString(match[1]))) {
          reporter.error(
            "evidence.report-incomplete",
            rel,
            `Verification Report is missing${state?.stage === "accepted" ? " a value for" : ""} "${label}".`,
            `Record an explicit ${label} value before acceptance; use none with a reason when appropriate.`,
          );
        }
      }
    }
  }

  if (configValue && state?.stage === "accepted") {
    await validateAcceptedReport(root, reporter, configValue, configRaw, options, contractSources);
  }
}

// ---------------------------------------------------------------------------
// commit：实现任务收尾——工作区不得遗留未提交改动
// ---------------------------------------------------------------------------

const execFileAsync = promisify(execFile);

async function checkCommit(root, reporter) {
  let status;
  try {
    const result = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: root,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    status = result.stdout;
  } catch {
    reporter.error(
      "commit.git-unavailable",
      ".",
      "Cannot run `git status`; every implementation task must end with an auditable Git commit.",
      "Initialize Git (or install it) so the task can end with a reviewable, revertable commit.",
    );
    return;
  }
  const lines = status.split("\n").filter((line) => line.trim() !== "");
  if (lines.length > 0) {
    const preview = lines.slice(0, 10).join("; ");
    reporter.error(
      "commit.uncommitted-changes",
      ".",
      `Working tree has ${lines.length} uncommitted change(s): ${preview}${lines.length > 10 ? "; …" : ""}`,
      "Stage only files or hunks belonging to the current task, commit with a descriptive message, and report the commit hash to the user.",
    );
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

const CHECKS = {
  context: checkContext,
  gates: checkGates,
  evidence: checkEvidence,
  commit: checkCommit,
};

async function main(argv) {
  const args = [...argv];
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const rootIndex = args.indexOf("--root");
  if (rootIndex !== -1) {
    const value = args[rootIndex + 1];
    if (!value) {
      process.stderr.write("ERROR harness.usage: --root requires a directory argument.\n");
      process.exit(2);
    }
    root = resolve(value);
    args.splice(rootIndex, 2);
  }
  let stateFile = null;
  const stateIndex = args.indexOf("--state-file");
  if (stateIndex !== -1) {
    const value = args[stateIndex + 1];
    if (!isSafeRelativePath(value)) {
      process.stderr.write("ERROR harness.usage: --state-file requires a safe project-relative path.\n");
      process.exit(2);
    }
    stateFile = value;
    args.splice(stateIndex, 2);
  }


  const command = args[0];
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(
      "Usage: node scripts/harness-check.mjs context|gates|evidence|commit|all [--root <dir>]\n" +
        "       node scripts/harness-check.mjs preflight --state-file <candidate.json> [--root <dir>]\n" +
        "Exit codes: 0 pass, 1 issues found, 2 unparseable config or state.\n",
    );
    process.exit(command ? 0 : 2);
  }

  if (args.length !== 1 || (command === "preflight" && !stateFile) || (command !== "preflight" && stateFile)) {
    process.stderr.write("ERROR harness.usage: preflight alone requires --state-file; other commands do not accept it.\n");
    process.exit(2);
  }
  const modes = command === "all" || command === "preflight" ? ["context", "gates", "evidence"] : [command];
  for (const mode of modes) {
    if (!CHECKS[mode]) {
      process.stderr.write(`ERROR harness.unknown-command: unknown command "${command}".\nREPAIR: Use context, gates, evidence, commit, all or preflight.\n`);
      process.exit(2);
    }
  }

  const reporter = createReporter();
  const options = { stateFile };
  for (const mode of modes) {
    await CHECKS[mode](root, reporter, options);
  }

  if (reporter.issues.length > 0) {
    printIssues(reporter.issues);
    process.exit(reporter.parseFailure ? 2 : 1);
  }
  process.stdout.write(`OK ${command}\n`);
  process.exit(0);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`ERROR harness.internal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
});
