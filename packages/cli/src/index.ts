#!/usr/bin/env node
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STAGES = [
  "initialized",
  "requirements-draft",
  "requirements-confirmed",
  "solution-options",
  "solution-selected",
  "implementation-ready",
] as const;

type Stage = (typeof STAGES)[number];

type WorkflowState = {
  stage: Stage;
  allowedNextStages: Stage[];
  currentStageDoc: string | null;
  lastConfirmedDoc: string | null;
  confirmation: Record<string, string> | null;
  selection: Record<string, string> | null;
  history: Array<Record<string, string>>;
};

type CheckIssue = {
  path: string;
  message: string;
  repair: string;
};

type SkillEntry = {
  alias?: string;
  skill?: string;
  level?: string;
  stage?: string;
  trigger?: string;
  description?: string;
  inputs?: string[];
  outputs?: string[];
};

type SkillsIndex = {
  version?: number;
  stageDefaults?: Record<string, unknown>;
  skills?: unknown;
};

const NEXT_STAGE: Record<Stage, Stage[]> = {
  initialized: ["requirements-draft"],
  "requirements-draft": ["requirements-confirmed"],
  "requirements-confirmed": ["solution-options"],
  "solution-options": ["solution-selected"],
  "solution-selected": ["implementation-ready"],
  "implementation-ready": [],
};

const STAGE_DOC: Record<Exclude<Stage, "initialized">, string> = {
  "requirements-draft": "workflow/requirements.md",
  "requirements-confirmed": "workflow/requirements.md",
  "solution-options": "workflow/solution-options.md",
  "solution-selected": "workflow/solution-selected.md",
  "implementation-ready": "workflow/implementation-ready.md",
};

const REQUIRED_ADVANCE_STATUS: Record<Exclude<Stage, "initialized">, string> = {
  "requirements-draft": "draft",
  "requirements-confirmed": "confirmed",
  "solution-options": "proposed",
  "solution-selected": "selected",
  "implementation-ready": "ready",
};

const INITIAL_STATE: WorkflowState = {
  stage: "initialized",
  allowedNextStages: ["requirements-draft"],
  currentStageDoc: null,
  lastConfirmedDoc: null,
  confirmation: null,
  selection: null,
  history: [],
};

const REQUIRED_SDD_FILES = [
  "frontend/SPECS/PRD.md",
  "frontend/SPECS/ARCHITECTURE.md",
  "frontend/SPECS/FEATURES/.gitkeep",
  "frontend/SPECS/FEATURES/example-feature/spec.md",
  "frontend/SPECS/FEATURES/example-feature/tasks.md",
  "backend/SPECS/PRD.md",
  "backend/SPECS/ARCHITECTURE.md",
  "backend/SPECS/FEATURES/.gitkeep",
  "backend/SPECS/FEATURES/example-feature/spec.md",
  "backend/SPECS/FEATURES/example-feature/tasks.md",
];

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".mjs",
  ".js",
  ".ts",
  ".tsx",
  ".vue",
  ".html",
  ".css",
  ".scss",
  ".yaml",
  ".yml",
  ".txt",
]);

const CLI_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(CLI_PATH), "../../..");
const TEMPLATE_ROOT = join(REPO_ROOT, "templates", "pc-admin");
const KIT_SKILLS_INDEX = join(REPO_ROOT, ".agents", "skills.json");
const KIT_SKILLS_ROOT = join(REPO_ROOT, ".agents", "skills");
const KIT_HOOKS_ROOT = join(REPO_ROOT, ".agents", "hooks");

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    await initCommand(rest);
    return;
  }

  if (command === "check") {
    await checkCommand(rest);
    return;
  }

  if (command === "skills") {
    await skillsCommand(rest);
    return;
  }

  if (command === "skill") {
    await skillCommand(rest);
    return;
  }

  if (command === "next") {
    await nextCommand(rest);
    return;
  }

  if (command === "propose") {
    await proposeCommand(rest);
    return;
  }

  if (command === "options") {
    await optionsCommand(rest);
    return;
  }

  if (command === "sdd") {
    await sddCommand(rest);
    return;
  }

  if (command === "stage" && rest[0] === "advance") {
    await advanceCommand(rest.slice(1));
    return;
  }

  fail(`Unknown command: ${[command, ...rest].join(" ")}`, "Run `kit help` to see supported commands.");
}

async function initCommand(args: string[]): Promise<void> {
  const projectName = args[0];
  if (!projectName) {
    fail("Missing project name.", "Run `kit init <project-name>`.");
  }

  const targetRoot = resolve(process.cwd(), projectName);
  if (await exists(targetRoot)) {
    fail(`Target directory already exists: ${targetRoot}`, "Choose a new project name or remove the existing directory first.");
  }

  await copyTemplate(TEMPLATE_ROOT, targetRoot, {
    projectName: basename(projectName),
    kitCliPath: CLI_PATH,
  });
  await materializeEnvExamples(targetRoot);
  await mkdir(join(targetRoot, ".agents"), { recursive: true });
  await copyFile(KIT_SKILLS_INDEX, join(targetRoot, ".agents", "skills.json"));
  await copyDirectory(KIT_SKILLS_ROOT, join(targetRoot, ".agents", "skills"));
  await copyDirectory(KIT_HOOKS_ROOT, join(targetRoot, ".agents", "hooks"));

  await mkdir(join(targetRoot, "frontend"), { recursive: true });
  await mkdir(join(targetRoot, "backend"), { recursive: true });
  await mkdir(join(targetRoot, "SPECS"), { recursive: true });
  await mkdir(join(targetRoot, "workflow"), { recursive: true });
  await mkdir(join(targetRoot, "tasks"), { recursive: true });
  await mkdir(join(targetRoot, "memory"), { recursive: true });
  await writeJson(join(targetRoot, "workflow-state.json"), INITIAL_STATE);
  await copyFile(CLI_PATH, join(targetRoot, "scripts", "kit-runtime.mjs"));
  await writeFile(join(targetRoot, "scripts", "kit.mjs"), renderKitRunner(), "utf8");

  console.log(`✅ Created ${projectName}`);
  console.log(`Next: cd ${projectName} && node scripts/kit.mjs check`);
}

async function checkCommand(args: string[]): Promise<void> {
  const root = resolve(args[0] ?? process.cwd());
  const issues = await checkProject(root);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`❌ ${issue.path}: ${issue.message}`);
      console.error(`   Repair: ${issue.repair}`);
    }
    process.exit(1);
  }

  const state = await readState(root);
  console.log(`✅ kit check passed: stage "${state.stage}"`);
}

async function skillsCommand(args: string[]): Promise<void> {
  const root = resolve(args[0] ?? process.cwd());
  const state = await readState(root);
  const index = await readSkillsIndex(root);
  const skills = normalizeSkillEntries(index.skills);
  const recommended = new Set(getStageSkillAliases(index, state.stage));

  console.log(`Stage: ${state.stage}`);
  console.log("Skills:");
  for (const skill of skills) {
    const marker = skill.alias && recommended.has(skill.alias) ? "*" : "-";
    const stage = skill.stage ? ` stage=${skill.stage}` : "";
    const level = skill.level ? ` level=${skill.level}` : "";
    const mapsTo = skill.skill ? ` -> ${skill.skill}` : "";
    const description = skill.description ?? skill.trigger ?? "";
    console.log(`${marker} ${skill.alias ?? "<missing-alias>"}${mapsTo}${level}${stage}`);
    if (description) console.log(`  ${description}`);
    console.log(`  inputs: ${(skill.inputs && skill.inputs.length > 0) ? skill.inputs.join(", ") : "(none)"}`);
    console.log(`  outputs: ${(skill.outputs && skill.outputs.length > 0) ? skill.outputs.join(", ") : "(none)"}`);
  }
}

async function skillCommand(args: string[]): Promise<void> {
  const alias = args[0];
  if (!alias) {
    fail("Missing skill alias.", "Run `kit skill <alias>` or `kit skills`.");
  }

  const root = resolve(args[1] ?? process.cwd());
  const index = await readSkillsIndex(root);
  const skill = normalizeSkillEntries(index.skills).find((entry) => entry.alias === alias);
  if (!skill) {
    fail(`Unknown skill alias: ${alias}`, "Run `kit skills` to list available aliases.");
  }

  console.log(`Alias: ${skill.alias}`);
  console.log(`Skill: ${skill.skill ?? ""}`);
  if (skill.level) console.log(`Level: ${skill.level}`);
  if (skill.stage) console.log(`Stage: ${skill.stage}`);
  if (skill.description) console.log(`Description: ${skill.description}`);
  if (skill.trigger) console.log(`Trigger: ${skill.trigger}`);
  console.log(`Inputs: ${(skill.inputs && skill.inputs.length > 0) ? skill.inputs.join(", ") : "(none)"}`);
  console.log(`Outputs: ${(skill.outputs && skill.outputs.length > 0) ? skill.outputs.join(", ") : "(none)"}`);
  console.log("Note: kit reports routing metadata only; it does not execute Agent skills.");
}

async function nextCommand(args: string[]): Promise<void> {
  const root = resolve(args[0] ?? process.cwd());
  const state = await readState(root);
  const index = await readSkillsIndex(root);
  const next = NEXT_STAGE[state.stage][0] ?? null;
  const skills = getStageSkillAliases(index, state.stage);
  const docs = suggestedFilesForStage(state.stage);

  console.log(`Stage: ${state.stage}`);
  console.log(`Next stage: ${next ?? "done"}`);
  console.log(`Recommended skills: ${skills.length > 0 ? skills.join(", ") : "(none)"}`);
  console.log("Suggested files:");
  for (const doc of docs) console.log(`- ${doc}`);

  if (state.stage === "implementation-ready") {
    console.log("SDD command: kit sdd [feature-slug]");
  }
}

async function proposeCommand(args: string[]): Promise<void> {
  const root = process.cwd();
  const options = parseOptions(args);
  const state = await readState(root);
  if (stageIndex(state.stage) > stageIndex("requirements-draft")) {
    fail("`kit propose` is only allowed before requirements are confirmed.", "Use the existing workflow/requirements.md for later stages.");
  }

  const target = join(root, "workflow", "requirements.md");
  const content = renderRequirementsDraft(options.title || "Requirements");
  await writeIfAllowed(target, content, options.force === "true");
  console.log("✅ Created workflow/requirements.md");
  console.log("Next: fill open questions, then advance with `kit stage advance requirements-draft --by user --quote \"...\"`.");
}

async function optionsCommand(args: string[]): Promise<void> {
  const root = process.cwd();
  const options = parseOptions(args);
  const target = join(root, "workflow", "solution-options.md");

  if (options.check === "true") {
    const meta = await readFrontmatterForAdvance(root, "workflow/solution-options.md");
    const optionIds = meta.optionIds;
    if (!Array.isArray(optionIds) || optionIds.length !== 3) {
      fail("workflow/solution-options.md must contain exactly 3 optionIds.", "Set frontmatter `optionIds: [option-a, option-b, option-c]`.");
    }
    console.log(`✅ workflow/solution-options.md has 3 optionIds: ${optionIds.join(", ")}`);
    return;
  }

  const state = await readState(root);
  if (stageIndex(state.stage) < stageIndex("requirements-confirmed")) {
    fail("`kit options` is only allowed after requirements-confirmed.", "Confirm requirements first, then rerun `kit options`.");
  }

  if (stageIndex(state.stage) > stageIndex("solution-options")) {
    fail("`kit options` cannot create a new options artifact after solution-options.", "Use the existing workflow/solution-options.md or inspect the selected solution.");
  }

  const optionIds = parseOptionIds(options.ids);
  const content = renderSolutionOptions(optionIds);
  await writeIfAllowed(target, content, options.force === "true");
  console.log("✅ Created workflow/solution-options.md");
  console.log("Next: fill all three options, then advance with `kit stage advance solution-options --by user --quote \"...\"`.");
}

async function sddCommand(args: string[]): Promise<void> {
  const slug = args.find((arg) => !arg.startsWith("--")) ?? "example-feature";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    fail(`Invalid feature slug: ${slug}`, "Use lowercase letters, numbers, and hyphens, for example `user-import`.");
  }

  const options = parseOptions(args);
  const root = process.cwd();
  const state = await readState(root);
  if (stageIndex(state.stage) < stageIndex("solution-selected")) {
    fail("`kit sdd` is only allowed after solution-selected.", "Record the user's selected solution before creating feature SDD files.");
  }

  const baseFiles: Array<[string, string]> = [
    ["frontend/SPECS/PRD.md", renderSddPrd("frontend")],
    ["frontend/SPECS/ARCHITECTURE.md", renderSddArchitecture("frontend")],
    ["backend/SPECS/PRD.md", renderSddPrd("backend")],
    ["backend/SPECS/ARCHITECTURE.md", renderSddArchitecture("backend")],
  ];
  const featureFiles: Array<[string, string]> = [
    [`frontend/SPECS/FEATURES/${slug}/spec.md`, renderFeatureSpec("frontend", slug)],
    [`frontend/SPECS/FEATURES/${slug}/tasks.md`, renderFeatureTasks("frontend", slug)],
    [`backend/SPECS/FEATURES/${slug}/spec.md`, renderFeatureSpec("backend", slug)],
    [`backend/SPECS/FEATURES/${slug}/tasks.md`, renderFeatureTasks("backend", slug)],
  ];

  for (const [relPath, content] of baseFiles) {
    if (!options.force && (await exists(join(root, relPath)))) continue;
    await writeIfAllowed(join(root, relPath), content, options.force === "true");
  }

  for (const [relPath, content] of featureFiles) {
    await writeIfAllowed(join(root, relPath), content, options.force === "true");
  }

  console.log(`✅ Created SDD skeleton for ${slug}`);
  for (const [relPath] of [...baseFiles, ...featureFiles]) console.log(`- ${relPath}`);
}

async function advanceCommand(args: string[]): Promise<void> {
  const target = args[0] as Stage | undefined;
  const options = parseOptions(args.slice(1));

  if (!target || !isStage(target) || target === "initialized") {
    fail("Invalid target stage.", "Use the only stage listed in workflow-state.json allowedNextStages.");
  }

  if (options.by !== "user") {
    fail("`--by user` is required in v1.", "Rerun with `--by user`; Agent-initiated advances are not supported.");
  }

  if (!options.quote || options.quote.trim() === "") {
    fail("`--quote` is required for every stage advance.", "Rerun with the user's exact quote, for example `--quote \"需求已确认\"`.");
  }

  const root = process.cwd();
  const state = await readState(root);
  if (!isStage(state.stage)) {
    fail(`workflow-state.json has unknown stage "${String(state.stage)}".`, "Repair workflow-state.json from the fixed stage order before advancing.");
  }

  const expectedStages = NEXT_STAGE[state.stage];
  if (!Array.isArray(state.allowedNextStages)) {
    fail("workflow-state.json is corrupt: allowedNextStages must be an array.", "Repair workflow-state.json from the fixed stage order before advancing.");
  }

  if (!sameArray(state.allowedNextStages, expectedStages)) {
    fail(
      `workflow-state.json is corrupt: allowedNextStages must be ${JSON.stringify(expectedStages)} for stage "${state.stage}".`,
      "Repair workflow-state.json from the fixed stage order before advancing; run `kit check` for details.",
    );
  }

  const expected = expectedStages[0];
  if (expected !== target) {
    fail(
      `Cannot advance from "${state.stage}" to "${target}".`,
      expected ? `Run \`kit stage advance ${expected} --by user --quote "..."\`.` : "This project is already at the terminal stage.",
    );
  }

  const doc = STAGE_DOC[target];
  const requiredStatus = REQUIRED_ADVANCE_STATUS[target];
  const frontmatter = await readFrontmatterForAdvance(root, doc);
  if (frontmatter.status !== requiredStatus) {
    fail(
      `${doc} has status "${String(frontmatter.status ?? "")}", expected "${requiredStatus}".`,
      `Update ${doc} frontmatter to \`status: ${requiredStatus}\`, then rerun the advance command.`,
    );
  }

  const now = new Date().toISOString();
  const nextState = updateStateForAdvance(state, target, doc, options.quote, now, frontmatter);
  await writeJson(join(root, "workflow-state.json"), nextState);
  console.log(`✅ Advanced ${state.stage} -> ${target}`);
}

async function checkProject(root: string): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const state = await readStateForCheck(root, issues);
  if (!state) return issues;

  validateStateShape(state, issues);
  if (!isStage(state.stage)) return issues;

  await validateCommonControlFiles(root, issues);
  await validateSkillsIndex(root, issues);
  await validateSourceLine(root, "frontend/SPECS/API.md", issues);
  await validateSourceLine(root, "backend/SPECS/API.md", issues);
  await validateWorkflowFiles(root, state.stage, issues);
  await validateTaskTiming(root, state.stage, issues);
  await validateStageArtifacts(root, state, issues);

  return issues;
}

function validateStateShape(state: WorkflowState, issues: CheckIssue[]): void {
  if (!isStage(state.stage)) {
    issues.push(issue("workflow-state.json", `Unknown stage "${String(state.stage)}".`, "Use one of the stages from plan/00-contract.md."));
    return;
  }

  if (!Array.isArray(state.allowedNextStages)) {
    issues.push(issue("workflow-state.json", "allowedNextStages must be an array.", "Rewrite allowedNextStages from the transition table."));
    return;
  }

  const expected = NEXT_STAGE[state.stage];
  if (!sameArray(state.allowedNextStages, expected)) {
    issues.push(
      issue(
        "workflow-state.json",
        `allowedNextStages must be ${JSON.stringify(expected)} for stage "${state.stage}".`,
        "Run the correct `kit stage advance` command instead of editing workflow-state.json by hand.",
      ),
    );
  }

  if (!Array.isArray(state.history)) {
    issues.push(issue("workflow-state.json", "history must be an array.", "Restore history to an array; use `[]` for a fresh project."));
    return;
  }

  for (const [index, entry] of state.history.entries()) {
    for (const field of ["from", "to", "advancedBy", "advancedAt", "quote", "doc"]) {
      if (!entry[field]) {
        issues.push(
          issue(
            "workflow-state.json",
            `history[${index}] is missing "${field}".`,
            "Restore history from `kit stage advance`; do not hand-edit workflow-state.json.",
          ),
        );
      }
    }
  }
}

async function validateCommonControlFiles(root: string, issues: CheckIssue[]): Promise<void> {
  const files = [
    "AGENTS.md",
    "TEMPLATE.md",
    ".agents/skills.json",
    ".agents/hooks/README.md",
    ".agents/hooks/route-skill.mjs",
    "workflow/README.md",
    "workflow/requirements.template.md",
    "workflow/solution-options.template.md",
    "workflow/solution-selected.template.md",
    "workflow/implementation-ready.template.md",
    "SPECS/API.md",
    "rules/ai-implementation.md",
    "tasks/README.md",
    "tasks/backlog.template.md",
    "tasks/sprint-01.template.md",
    "memory/decisions.md",
    "frontend/AGENTS.md",
    "frontend/SPECS/README.md",
    "frontend/SPECS/API.md",
    "backend/AGENTS.md",
    "backend/SPECS/README.md",
    "backend/SPECS/API.md",
    ...REQUIRED_SDD_FILES,
  ];

  for (const file of files) {
    if (!(await exists(join(root, file)))) {
      issues.push(issue(file, "Required control file is missing.", `Restore ${file} from the kit template.`));
    }
  }
}

async function validateSkillsIndex(root: string, issues: CheckIssue[]): Promise<void> {
  const relPath = ".agents/skills.json";
  const fullPath = join(root, relPath);
  if (!(await exists(fullPath))) return;

  let index: unknown;
  try {
    index = JSON.parse(await readFile(fullPath, "utf8"));
  } catch (error) {
    issues.push(issue(relPath, error instanceof Error ? error.message : "Invalid JSON.", "Restore .agents/skills.json from the kit template."));
    return;
  }

  if (!isRecord(index)) {
    issues.push(issue(relPath, "Skill index must be a JSON object.", "Restore .agents/skills.json from the kit template."));
    return;
  }

  if (index.version !== 1) {
    issues.push(issue(relPath, "version must be 1.", "Set `version` to 1 in .agents/skills.json."));
  }

  const skills = index.skills;
  if (!Array.isArray(skills) || skills.length === 0) {
    issues.push(issue(relPath, "skills must be a non-empty array.", "Add skill entries with alias and skill fields."));
    return;
  }

  const aliases = new Set<string>();
  for (const [entryIndex, entry] of skills.entries()) {
    if (!isRecord(entry)) {
      issues.push(issue(relPath, `skills[${entryIndex}] must be an object.`, "Use skill entries with alias and skill fields."));
      continue;
    }

    const alias = typeof entry.alias === "string" ? entry.alias.trim() : "";
    const skill = typeof entry.skill === "string" ? entry.skill.trim() : "";
    if (!alias) {
      issues.push(issue(relPath, `skills[${entryIndex}] is missing alias.`, "Add a stable alias for every skill entry."));
    } else if (aliases.has(alias)) {
      issues.push(issue(relPath, `Duplicate alias "${alias}".`, "Keep aliases unique in .agents/skills.json."));
    } else {
      aliases.add(alias);
    }

    if (!skill) {
      issues.push(issue(relPath, `skills[${entryIndex}] is missing skill.`, "Point every alias to a real .agents/skills/<skill>/SKILL.md file."));
      continue;
    }

    validateStringArray(entry.inputs, `skills[${entryIndex}].inputs`, relPath, issues);
    validateStringArray(entry.outputs, `skills[${entryIndex}].outputs`, relPath, issues);

    const skillPath = join(root, ".agents", "skills", skill, "SKILL.md");
    if (!(await exists(skillPath))) {
      issues.push(issue(`.agents/skills/${skill}/SKILL.md`, `Skill "${skill}" referenced by alias "${alias || `<index ${entryIndex}>`}" is missing.`, "Restore the missing skill directory or update .agents/skills.json."));
    }
  }

  validateAliasList(index.defaultChain, aliases, "defaultChain", relPath, issues);

  const stageDefaults = index.stageDefaults;
  if (!isRecord(stageDefaults)) {
    issues.push(issue(relPath, "stageDefaults must be an object.", "Map each workflow stage to an array of skill aliases."));
    return;
  }

  for (const stage of STAGES) {
    validateAliasList(stageDefaults[stage], aliases, `stageDefaults.${stage}`, relPath, issues);
  }
}

async function validateSourceLine(root: string, file: string, issues: CheckIssue[]): Promise<void> {
  const fullPath = join(root, file);
  if (!(await exists(fullPath))) return;

  const content = await readFile(fullPath, "utf8");
  const hasSourceLine = content.split(/\r?\n/).includes("Source: ../../SPECS/API.md");
  if (!hasSourceLine) {
    issues.push(issue(file, "Missing exact root API source line.", "Replace the file body with `Source: ../../SPECS/API.md`."));
  }
}

async function validateWorkflowFiles(root: string, stage: Stage, issues: CheckIssue[]): Promise<void> {
  const workflowRoot = join(root, "workflow");
  if (!(await exists(workflowRoot))) return;

  const allowed = allowedWorkflowFiles(stage);
  for (const entry of await readdir(workflowRoot)) {
    if (!entry.endsWith(".md") || entry === "README.md" || entry.endsWith(".template.md")) continue;
    const rel = `workflow/${entry}`;
    if (!allowed.has(rel)) {
      issues.push(
        issue(
          rel,
          `Workflow artifact is not allowed at stage "${stage}".`,
          `Remove ${rel} until it is the current stage artifact or the immediate target artifact.`,
        ),
      );
    }
  }
}

async function validateTaskTiming(root: string, stage: Stage, issues: CheckIssue[]): Promise<void> {
  const backlog = "tasks/backlog.md";
  const sprint = "tasks/sprint-01.md";
  if (stageIndex(stage) < stageIndex("requirements-confirmed") && (await exists(join(root, backlog)))) {
    issues.push(issue(backlog, "Backlog is created too early.", "Create tasks/backlog.md only after requirements-confirmed."));
  }

  if (stageIndex(stage) >= stageIndex("requirements-confirmed") && !(await exists(join(root, backlog)))) {
    issues.push(issue(backlog, "Backlog is required from requirements-confirmed onward.", "Create tasks/backlog.md from the confirmed requirements."));
  }

  if (stageIndex(stage) < stageIndex("implementation-ready") && (await exists(join(root, sprint)))) {
    issues.push(issue(sprint, "Sprint plan is created too early.", "Create tasks/sprint-01.md only at implementation-ready."));
  }
}

async function validateStageArtifacts(root: string, state: WorkflowState, issues: CheckIssue[]): Promise<void> {
  switch (state.stage) {
    case "initialized":
      return;
    case "requirements-draft":
      await requireFrontmatter(root, "workflow/requirements.md", { status: "draft" }, issues);
      return;
    case "requirements-confirmed":
      await requireFrontmatter(
        root,
        "workflow/requirements.md",
        { status: "confirmed", fields: ["confirmedBy", "confirmedAt", "confirmationQuote"] },
        issues,
      );
      if (state.lastConfirmedDoc !== "workflow/requirements.md") {
        issues.push(issue("workflow-state.json", "lastConfirmedDoc must point to workflow/requirements.md.", "Advance with `kit stage advance requirements-confirmed ...`."));
      }
      return;
    case "solution-options": {
      const meta = await requireFrontmatter(root, "workflow/solution-options.md", { status: "proposed" }, issues);
      const optionIds = meta?.optionIds;
      if (!Array.isArray(optionIds) || optionIds.length !== 3) {
        issues.push(issue("workflow/solution-options.md", "optionIds must contain exactly 3 ids.", "Set frontmatter `optionIds: [option-a, option-b, option-c]`."));
      }
      return;
    }
    case "solution-selected": {
      const meta = await requireFrontmatter(
        root,
        "workflow/solution-selected.md",
        { status: "selected", fields: ["selectionType", "selectedOptionId", "selectedBy", "selectedAt", "selectionQuote"] },
        issues,
      );
      const selectionType = meta?.selectionType;
      if (selectionType !== "option" && selectionType !== "custom") {
        issues.push(issue("workflow/solution-selected.md", "selectionType must be option or custom.", "Use `selectionType: option` or `selectionType: custom`."));
      }
      const selectedOptionId = typeof meta?.selectedOptionId === "string" ? meta.selectedOptionId : "";
      await validateDecision(root, selectedOptionId, issues);
      return;
    }
    case "implementation-ready":
      await requireFrontmatter(
        root,
        "workflow/implementation-ready.md",
        { status: "ready", fields: ["confirmedBy", "confirmedAt", "confirmationQuote"] },
        issues,
      );
      if (!(await exists(join(root, "tasks/sprint-01.md")))) {
        issues.push(issue("tasks/sprint-01.md", "Sprint plan is required at implementation-ready.", "Create tasks/sprint-01.md from the selected solution."));
      }
      if (state.lastConfirmedDoc !== "workflow/implementation-ready.md") {
        issues.push(issue("workflow-state.json", "lastConfirmedDoc must point to workflow/implementation-ready.md.", "Advance with `kit stage advance implementation-ready ...`."));
      }
      return;
  }
}

async function validateDecision(root: string, selectedOptionId: string, issues: CheckIssue[]): Promise<void> {
  if (!selectedOptionId) {
    issues.push(issue("workflow/solution-selected.md", "selectedOptionId is required.", "Record the user-selected option id in frontmatter."));
    return;
  }

  const decisionsPath = join(root, "memory/decisions.md");
  if (!(await exists(decisionsPath))) return;
  const decisions = await readFile(decisionsPath, "utf8");
  if (!decisions.includes(selectedOptionId)) {
    issues.push(issue("memory/decisions.md", `Missing selected option id "${selectedOptionId}".`, "Record the same selectedOptionId in memory/decisions.md."));
  }
}

async function requireFrontmatter(
  root: string,
  relPath: string,
  required: { status: string; fields?: string[] },
  issues: CheckIssue[],
): Promise<Record<string, unknown> | null> {
  const fullPath = join(root, relPath);
  if (!(await exists(fullPath))) {
    issues.push(issue(relPath, "Required workflow artifact is missing.", `Create ${relPath} for the current stage.`));
    return null;
  }

  const content = await readFile(fullPath, "utf8");
  const meta = parseFrontmatter(content);
  if (!meta) {
    issues.push(issue(relPath, "Missing YAML frontmatter.", `Add frontmatter with at least \`status: ${required.status}\`.`));
    return null;
  }

  if (meta.status !== required.status) {
    issues.push(issue(relPath, `status must be "${required.status}".`, `Set frontmatter \`status: ${required.status}\`.`));
  }

  for (const field of required.fields ?? []) {
    if (!meta[field]) {
      issues.push(issue(relPath, `Missing frontmatter field "${field}".`, `Add \`${field}\` to ${relPath} frontmatter.`));
    }
  }

  return meta;
}

async function readFrontmatterForAdvance(root: string, relPath: string): Promise<Record<string, unknown>> {
  const fullPath = join(root, relPath);
  if (!(await exists(fullPath))) {
    fail(`Missing target artifact: ${relPath}`, `Create ${relPath} before running kit stage advance.`);
  }

  const content = await readFile(fullPath, "utf8");
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    fail(`Missing YAML frontmatter in ${relPath}.`, "Add YAML frontmatter with the required status field.");
  }

  return frontmatter;
}

function updateStateForAdvance(
  state: WorkflowState,
  target: Stage,
  doc: string,
  quote: string,
  now: string,
  frontmatter: Record<string, unknown>,
): WorkflowState {
  const historyEntry = {
    from: state.stage,
    to: target,
    advancedBy: "user",
    advancedAt: now,
    quote,
    doc,
  };

  const nextState: WorkflowState = {
    ...state,
    stage: target,
    allowedNextStages: NEXT_STAGE[target],
    currentStageDoc: doc,
    history: [...state.history, historyEntry],
  };

  if (target === "requirements-confirmed" || target === "implementation-ready") {
    nextState.lastConfirmedDoc = doc;
    nextState.confirmation = {
      confirmedBy: "user",
      confirmedAt: now,
      confirmationQuote: quote,
    };
  }

  if (target === "solution-selected") {
    nextState.selection = {
      selectionType: String(frontmatter.selectionType ?? ""),
      selectedOptionId: String(frontmatter.selectedOptionId ?? ""),
      selectedBy: "user",
      selectedAt: now,
      selectionQuote: quote,
    };
  }

  return nextState;
}

async function readStateForCheck(root: string, issues: CheckIssue[]): Promise<WorkflowState | null> {
  try {
    return await readState(root);
  } catch (error) {
    issues.push(issue("workflow-state.json", error instanceof Error ? error.message : "Unable to read workflow state.", "Restore a valid workflow-state.json from the kit template."));
    return null;
  }
}

async function readState(root: string): Promise<WorkflowState> {
  const fullPath = join(root, "workflow-state.json");
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw) as WorkflowState;
}

async function readSkillsIndex(root: string): Promise<SkillsIndex> {
  const fullPath = join(root, ".agents", "skills.json");
  const raw = await readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    fail(".agents/skills.json must be a JSON object.", "Restore .agents/skills.json from the kit template.");
  }
  return parsed as SkillsIndex;
}

function normalizeSkillEntries(value: unknown): SkillEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry) => ({
    alias: typeof entry.alias === "string" ? entry.alias : undefined,
    skill: typeof entry.skill === "string" ? entry.skill : undefined,
    level: typeof entry.level === "string" ? entry.level : undefined,
    stage: typeof entry.stage === "string" ? entry.stage : undefined,
    trigger: typeof entry.trigger === "string" ? entry.trigger : undefined,
    description: typeof entry.description === "string" ? entry.description : undefined,
    inputs: Array.isArray(entry.inputs) ? entry.inputs.filter((item): item is string => typeof item === "string") : undefined,
    outputs: Array.isArray(entry.outputs) ? entry.outputs.filter((item): item is string => typeof item === "string") : undefined,
  }));
}

function getStageSkillAliases(index: SkillsIndex, stage: Stage): string[] {
  const stageDefaults = isRecord(index.stageDefaults) ? index.stageDefaults : {};
  const aliases = stageDefaults[stage];
  return Array.isArray(aliases) ? aliases.filter((alias): alias is string => typeof alias === "string") : [];
}

function suggestedFilesForStage(stage: Stage): string[] {
  switch (stage) {
    case "initialized":
      return ["workflow/requirements.md"];
    case "requirements-draft":
      return ["workflow/requirements.md"];
    case "requirements-confirmed":
      return ["tasks/backlog.md", "workflow/solution-options.md"];
    case "solution-options":
      return ["workflow/solution-selected.md", "memory/decisions.md"];
    case "solution-selected":
      return ["workflow/implementation-ready.md", "frontend/SPECS/PRD.md", "backend/SPECS/PRD.md"];
    case "implementation-ready":
      return [
        "tasks/sprint-01.md",
        "frontend/SPECS/ARCHITECTURE.md",
        "backend/SPECS/ARCHITECTURE.md",
        "frontend/SPECS/FEATURES/<feature-slug>/spec.md",
        "frontend/SPECS/FEATURES/<feature-slug>/tasks.md",
        "backend/SPECS/FEATURES/<feature-slug>/spec.md",
        "backend/SPECS/FEATURES/<feature-slug>/tasks.md",
      ];
  }
}

async function writeIfAllowed(path: string, content: string, force: boolean): Promise<void> {
  if (!force && (await exists(path))) {
    fail(`${path} already exists.`, "Rerun with `--force true` if you intentionally want to overwrite it.");
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function parseOptionIds(value: string | undefined): string[] {
  if (!value) return ["minimal", "balanced", "robust"];
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (ids.length !== 3) {
    fail("`--ids` must contain exactly 3 comma-separated ids.", "Example: `kit options --ids minimal,balanced,robust`.");
  }
  return ids;
}

function renderRequirementsDraft(title: string): string {
  return `---
status: draft
---
# ${title}

## User Request

> Paste the user's exact request here.

## Background

- Current workflow stage:
- Relevant existing modules:
- Constraints already confirmed:

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| User request |  | Problem boundary | required |
| PRD / issue / ticket |  | Requirements detail | optional |
| API documentation | \`SPECS/API.md\` | Endpoint and field facts | required when API changes |
| Design / prototype / screenshot |  | UI behavior and layout | required when UI changes |
| Test / log / incident |  | Reproduction or acceptance evidence | optional |
| Existing module reference |  | Harness candidate | required when similar module exists |

## Goals

- Goal 1:
- Goal 2:

## Non-Goals

- Out of scope:

## Open Questions

- [ ] Question:

## Requirements

| ID | Requirement | Evidence / Source |
| --- | --- | --- |
| REQ-001 |  |  |

## Acceptance Criteria

- [ ] Criterion:
`;
}

function renderSolutionOptions(optionIds: string[]): string {
  const sections = optionIds.map((id) => `## Option: ${id}

### Summary

### Files / Modules

### Tradeoffs

### Verification
`).join("\n");

  return `---
status: proposed
optionIds: [${optionIds.join(", ")}]
---
# Solution Options

Provide exactly three options. Keep \`optionIds\` in frontmatter synchronized with the section IDs below.

## Information Sources Used

- Requirements: \`workflow/requirements.md\`
- API contract: \`SPECS/API.md\`
- Database contract: \`SPECS/DATABASE.md\`
- Design source:
- Existing module references:
- Missing sources / risks:

${sections}
## Recommendation

- Recommended option:
- Reason:
- Risks:
`;
}

function renderSddPrd(scope: "frontend" | "backend"): string {
  const title = scope === "frontend" ? "Frontend PRD" : "Backend PRD";
  const extraSource = scope === "backend" ? "- Database contract: `../../SPECS/DATABASE.md`\n" : "";
  return `---
scope: ${scope}
status: draft
---
# ${title}

## Source

- Workflow requirements: \`../../workflow/requirements.md\`
- Selected solution: \`../../workflow/solution-selected.md\`
- Shared API contract: \`../../SPECS/API.md\`
${extraSource}
## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| User request | \`../../workflow/requirements.md\` | Problem boundary | required |
| ${scope === "frontend" ? "Design / prototype / screenshot" : "API documentation"} | ${scope === "frontend" ? "" : "`../../SPECS/API.md`"} | ${scope === "frontend" ? "UI behavior and layout" : "Endpoint and field facts"} | required when ${scope === "frontend" ? "UI" : "API"} changes |
| Existing ${scope} module |  | Harness candidate | required when similar module exists |
| Test / log / incident |  | Acceptance evidence | optional |

## Goals

- Goal 1:
- Goal 2:

## Non-Goals

- Out of scope:

## Acceptance Criteria

- [ ] Criteria:
`;
}

function renderSddArchitecture(scope: "frontend" | "backend"): string {
  if (scope === "frontend") {
    return `---
scope: frontend
status: draft
---
# Frontend Architecture

## Source

- Frontend PRD: \`PRD.md\`
- Shared API contract: \`../../SPECS/API.md\`
- Feature specs: \`FEATURES/<feature-slug>/spec.md\`

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| Frontend PRD | \`PRD.md\` | User flow and acceptance | required |
| Shared API contract | \`../../SPECS/API.md\` | Field alignment | required when API changes |
| Existing frontend module |  | Component, state, and routing shape | required when similar module exists |
| Design / prototype / screenshot |  | Layout and interaction | required when UI changes |

## Runtime Shape

- Framework: Vue 3 + Vite
- UI: Element Plus
- State: Pinia
- Routing: Vue Router with backend-driven async routes

## Module Boundaries

| Area | Location | Notes |
| --- | --- | --- |
| Pages | \`src/views/\` |  |
| API clients | \`src/api/\` |  |
| Store | \`src/store/\` |  |

## Verification

- [ ] \`pnpm typecheck\`
- [ ] \`pnpm build\`
`;
  }

  return `---
scope: backend
status: draft
---
# Backend Architecture

## Source

- Backend PRD: \`PRD.md\`
- Shared API contract: \`../../SPECS/API.md\`
- Database contract: \`../../SPECS/DATABASE.md\`
- Feature specs: \`FEATURES/<feature-slug>/spec.md\`

## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| Backend PRD | \`PRD.md\` | Capability boundary | required |
| Shared API contract | \`../../SPECS/API.md\` | Endpoint and field alignment | required when API changes |
| Database contract | \`../../SPECS/DATABASE.md\` | Schema and seed alignment | required when schema changes |
| Existing backend module |  | Route, service, response, and SQL shape | required when similar module exists |

## Runtime Shape

- Runtime: Node.js + TypeScript
- HTTP framework: Fastify
- Database: MySQL via \`mysql2/promise\`
- Response style: \`{ success, data }\`

## Module Boundaries

| Area | Location | Notes |
| --- | --- | --- |
| Routes | \`src/routes/\` |  |
| Services | \`src/services/\` |  |
| DB | \`src/db/\` |  |

## Verification

- [ ] \`pnpm typecheck\`
- [ ] \`pnpm build\`
`;
}

function renderFeatureSpec(scope: "frontend" | "backend", slug: string): string {
  const title = scope === "frontend" ? "Frontend Feature Spec" : "Backend Feature Spec";
  const extraSource = scope === "backend" ? "- Database contract: `../../../../SPECS/DATABASE.md`\n" : "";
  return `---
scope: ${scope}
feature: ${slug}
status: draft
---
# ${title}: ${slug}

## Source

- Workflow requirements: \`../../../../workflow/requirements.md\`
- Selected solution: \`../../../../workflow/solution-selected.md\`
- ${scope === "frontend" ? "Frontend" : "Backend"} PRD: \`../../PRD.md\`
- Shared API contract: \`../../../../SPECS/API.md\`
${extraSource}
## Source Register

| Source Type | Location / Quote | Used For | Status |
| --- | --- | --- | --- |
| User request | \`../../../../workflow/requirements.md\` | Problem boundary | required |
| Selected solution | \`../../../../workflow/solution-selected.md\` | Scope and tradeoff | required |
| Shared API contract | \`../../../../SPECS/API.md\` | ${scope === "frontend" ? "Field alignment" : "Endpoint and field alignment"} | required when API changes |
${scope === "backend" ? "| Database contract | `../../../../SPECS/DATABASE.md` | Schema and seed alignment | required when schema changes |\n" : "| Design / prototype / screenshot |  | Layout and interaction | required when UI changes |\n"}| Existing ${scope} module |  | Harness candidate | required when similar module exists |

## Harness References

| Reference | Location | Reused Pattern | Deliberate Differences |
| --- | --- | --- | --- |
| Closest ${scope === "frontend" ? "frontend view" : "backend route"} |  |  |  |
| Closest ${scope === "frontend" ? "API client" : "service"} |  |  |  |
| Closest ${scope === "frontend" ? "UI state or component" : "database table or seed"} |  |  |  |

## Contract

| Item | Location | Notes |
| --- | --- | --- |
|  |  |  |

## Field Alignment

| Endpoint | Request Fields | Backend JSON Fields | Frontend VO Fields | Mapping Notes |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Implicit Behaviors To Review

- Defaults:
- Soft delete / status transitions:
- Sorting / pagination:
- Permissions:
- Date and null handling:

## Acceptance Criteria

- [ ] Criteria:
`;
}

function renderFeatureTasks(scope: "frontend" | "backend", slug: string): string {
  const title = scope === "frontend" ? "Frontend Feature Tasks" : "Backend Feature Tasks";
  const implementation =
    scope === "frontend"
      ? "- [ ] Confirm feature spec `Source Register` records user request, API contract, design source, and frontend reference status.\n- [ ] Record closest frontend references in the feature spec `Harness References`.\n- [ ] Confirm root `SPECS/API.md` contains every consumed field and mapping.\n- [ ] Derive Mock data from root `SPECS/API.md` and a similar real/template response.\n- [ ] Add or update API client functions under `src/api/`.\n- [ ] Add or update view components under `src/views/`.\n- [ ] Document UI behaviors inherited from references, including reset, loading, empty, error, permissions, and sorting.\n"
      : "- [ ] Confirm feature spec `Source Register` records user request, API contract, database contract, and backend reference status.\n- [ ] Record closest backend references in the feature spec `Harness References`.\n- [ ] Confirm root `SPECS/API.md` contains request and response fields.\n- [ ] Confirm root `SPECS/DATABASE.md` contains required table changes.\n- [ ] Add or update route handlers under `src/routes/`.\n- [ ] Add or update services under `src/services/`.\n- [ ] Document backend behaviors inherited from references, including defaults, soft delete, sorting, audit fields, date transforms, and null handling.\n";
  return `---
scope: ${scope}
feature: ${slug}
status: draft
---
# ${title}: ${slug}

## Implementation

${implementation}
## Verification

- [ ] \`pnpm typecheck\`
- [ ] \`pnpm build\`
- [ ] Implicit behavior review completed
- [ ] Rule or check candidate recorded when a reusable pitfall is found
`;
}

async function copyTemplate(sourceRoot: string, targetRoot: string, replacements: Record<string, string>): Promise<void> {
  await mkdir(targetRoot, { recursive: true });
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (shouldSkipTemplateEntry(entry.name)) continue;

    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, targetPath, replacements);
      continue;
    }

    if (entry.isFile()) {
      await copyTemplateFile(sourcePath, targetPath, replacements);
    }
  }
}

async function copyDirectory(sourceRoot: string, targetRoot: string): Promise<void> {
  await mkdir(targetRoot, { recursive: true });
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (shouldSkipTemplateEntry(entry.name)) continue;

    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function copyTemplateFile(sourcePath: string, targetPath: string, replacements: Record<string, string>): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const ext = sourcePath.includes(".") ? sourcePath.slice(sourcePath.lastIndexOf(".")) : "";
  if (!TEXT_EXTENSIONS.has(ext)) {
    await copyFile(sourcePath, targetPath);
    return;
  }

  let content = await readFile(sourcePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  await writeFile(targetPath, content, "utf8");
}

async function materializeEnvExamples(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (shouldSkipTemplateEntry(entry.name)) continue;

    const sourcePath = join(root, entry.name);
    if (entry.isDirectory()) {
      await materializeEnvExamples(sourcePath);
      continue;
    }

    if (entry.isFile() && isEnvExample(entry.name)) {
      await copyFile(sourcePath, sourcePath.slice(0, -".example".length));
    }
  }
}

function renderKitRunner(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cliPath = process.env.KIT_TEST_CLI || fileURLToPath(new URL("./kit-runtime.mjs", import.meta.url));
const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit",
});

process.exit(result.status ?? 1);
`;
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const yaml = content.slice(4, end);
  return parseSimpleYaml(yaml);
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let arrayKey: string | null = null;

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

function parseOptions(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;

    const eq = arg.indexOf("=");
    if (eq !== -1) {
      result[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }

    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      result[arg.slice(2)] = "true";
    } else {
      result[arg.slice(2)] = next;
      index += 1;
    }
  }
  return result;
}

function validateAliasList(value: unknown, aliases: Set<string>, fieldPath: string, relPath: string, issues: CheckIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(issue(relPath, `${fieldPath} must be an array.`, `Set ${fieldPath} to an array of skill aliases.`));
    return;
  }

  for (const alias of value) {
    if (typeof alias !== "string" || !aliases.has(alias)) {
      issues.push(issue(relPath, `${fieldPath} references unknown alias "${String(alias)}".`, "Use aliases declared in the skills array."));
    }
  }
}

function validateStringArray(value: unknown, fieldPath: string, relPath: string, issues: CheckIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(issue(relPath, `${fieldPath} must be an array.`, `Set ${fieldPath} to an array of strings.`));
    return;
  }

  if (value.some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push(issue(relPath, `${fieldPath} must contain only non-empty strings.`, `Repair ${fieldPath} in .agents/skills.json.`));
  }
}

function allowedWorkflowFiles(stage: Stage): Set<string> {
  const files: string[] = [];
  if (stageIndex(stage) >= stageIndex("requirements-draft")) files.push("workflow/requirements.md");
  if (stageIndex(stage) >= stageIndex("solution-options")) files.push("workflow/solution-options.md");
  if (stageIndex(stage) >= stageIndex("solution-selected")) files.push("workflow/solution-selected.md");
  if (stageIndex(stage) >= stageIndex("implementation-ready")) files.push("workflow/implementation-ready.md");

  for (const target of NEXT_STAGE[stage]) {
    if (target !== "initialized") files.push(STAGE_DOC[target]);
  }

  return new Set(files);
}

function shouldSkipTemplateEntry(name: string): boolean {
  return name === "node_modules" || name === "dist" || name === ".DS_Store" || name === ".git" || name === ".cache" || (name.startsWith(".env") && !isEnvExample(name));
}

function isEnvExample(name: string): boolean {
  return name.startsWith(".env") && name.endsWith(".example");
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function sameArray(left: unknown[], right: unknown[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function isStage(value: string): value is Stage {
  return STAGES.includes(value as Stage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function issue(path: string, message: string, repair: string): CheckIssue {
  return { path, message, repair };
}

function fail(message: string, repair: string): never {
  console.error(`❌ ${message}`);
  console.error(`Repair: ${repair}`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`ai-vibe-demo-kit CLI

Commands:
  kit init <project-name>
  kit check [project-root]
  kit skills [project-root]
  kit skill <alias> [project-root]
  kit next [project-root]
  kit propose [--title "..."] [--force]
  kit options [--ids a,b,c] [--check] [--force]
  kit sdd [feature-slug] [--force]
  kit stage advance <stage> --by user --quote "<user exact quote>"
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ ${message}`);
  console.error("Repair: Re-run the command after fixing the reported file or argument.");
  process.exit(1);
});
