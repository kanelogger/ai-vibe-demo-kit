import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const repoRoot = new URL("../../..", import.meta.url).pathname;
const cli = join(repoRoot, "packages/cli/dist/index.js");

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
  });
}

async function tempProject() {
  const root = await mkdtemp(join(tmpdir(), "ai-vibe-demo-kit-"));
  const result = run(["init", "demo-admin"], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  return { root, project: join(root, "demo-admin") };
}

async function write(relRoot, path, content) {
  await mkdir(join(relRoot, path, ".."), { recursive: true });
  await writeFile(join(relRoot, path), content, "utf8");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function setState(project, state) {
  await writeFile(join(project, "workflow-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function buildProjectAt(stage) {
  const { root, project } = await tempProject();
  const state = {
    stage,
    allowedNextStages: {
      initialized: ["requirements-draft"],
      "requirements-draft": ["requirements-confirmed"],
      "requirements-confirmed": ["solution-options"],
      "solution-options": ["solution-selected"],
      "solution-selected": ["implementation-ready"],
      "implementation-ready": [],
    }[stage],
    currentStageDoc: null,
    lastConfirmedDoc: null,
    confirmation: null,
    selection: null,
    history: [],
  };

  if (stage !== "initialized") {
    state.currentStageDoc = {
      "requirements-draft": "workflow/requirements.md",
      "requirements-confirmed": "workflow/requirements.md",
      "solution-options": "workflow/solution-options.md",
      "solution-selected": "workflow/solution-selected.md",
      "implementation-ready": "workflow/implementation-ready.md",
    }[stage];
  }

  if (["requirements-draft", "requirements-confirmed", "solution-options", "solution-selected", "implementation-ready"].includes(stage)) {
    await write(project, "workflow/requirements.md", "---\nstatus: draft\n---\n# Requirements\n");
  }

  if (["requirements-confirmed", "solution-options", "solution-selected", "implementation-ready"].includes(stage)) {
    await write(project, "workflow/requirements.md", "---\nstatus: confirmed\nconfirmedBy: user\nconfirmedAt: 2026-06-28T00:00:00.000Z\nconfirmationQuote: \"确认需求\"\n---\n# Requirements\n");
    await write(project, "tasks/backlog.md", "# Backlog\n");
    state.lastConfirmedDoc = "workflow/requirements.md";
    state.confirmation = {
      confirmedBy: "user",
      confirmedAt: "2026-06-28T00:00:00.000Z",
      confirmationQuote: "确认需求",
    };
  }

  if (["solution-options", "solution-selected", "implementation-ready"].includes(stage)) {
    await write(project, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [minimal-list, table-filtering, audit-ready]\n---\n# Options\n");
  }

  if (["solution-selected", "implementation-ready"].includes(stage)) {
    await write(project, "workflow/solution-selected.md", "---\nstatus: selected\nselectionType: option\nselectedOptionId: table-filtering\nselectedBy: user\nselectedAt: 2026-06-28T00:00:00.000Z\nselectionQuote: \"选择 table-filtering\"\n---\n# Selection\n");
    await write(project, "memory/decisions.md", "# Decisions\n\nselectedOptionId: table-filtering\n");
    state.selection = {
      selectionType: "option",
      selectedOptionId: "table-filtering",
      selectedBy: "user",
      selectedAt: "2026-06-28T00:00:00.000Z",
      selectionQuote: "选择 table-filtering",
    };
  }

  if (stage === "implementation-ready") {
    await write(project, "workflow/implementation-ready.md", "---\nstatus: ready\nconfirmedBy: user\nconfirmedAt: 2026-06-28T00:00:00.000Z\nconfirmationQuote: \"可以进入实现\"\n---\n# Ready\n");
    await write(project, "tasks/sprint-01.md", "# Sprint 01\n");
    state.currentStageDoc = "workflow/implementation-ready.md";
    state.lastConfirmedDoc = "workflow/implementation-ready.md";
    state.confirmation = {
      confirmedBy: "user",
      confirmedAt: "2026-06-28T00:00:00.000Z",
      confirmationQuote: "可以进入实现",
    };
  }

  await setState(project, state);
  return { root, project };
}

test("init creates scaffold and initialized check passes", async () => {
  const { root, project } = await tempProject();
  try {
    for (const path of [
      "frontend",
      "backend",
      "SPECS",
      "workflow",
      "tasks",
      "memory",
      "AGENTS.md",
      "TEMPLATE.md",
      "workflow-state.json",
      ".agents/hooks/README.md",
      ".agents/hooks/route-skill.mjs",
      "workflow/requirements.template.md",
      "workflow/solution-options.template.md",
      "workflow/solution-selected.template.md",
      "workflow/implementation-ready.template.md",
      "tasks/backlog.template.md",
      "tasks/sprint-01.template.md",
      "rules/ai-implementation.md",
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
    ]) {
      assert.equal(existsSync(join(project, path)), true, path);
    }
    assert.equal(existsSync(join(project, ".agents/skills.json")), true);
    assert.equal(existsSync(join(project, ".agents/skills/implement/SKILL.md")), true);
    assert.equal(existsSync(join(project, ".agents/skills/spec-driven-development/SKILL.md")), true);
    assert.equal(existsSync(join(project, ".agents/hooks/route-skill.mjs")), true);
    assert.equal(existsSync(join(project, "scripts/kit-runtime.mjs")), true);
    assert.equal(existsSync(join(project, "workflow/requirements.md")), false);
    assert.equal(existsSync(join(project, "frontend/node_modules")), false);
    assert.equal(existsSync(join(project, "backend/node_modules")), false);
    assert.equal(existsSync(join(project, "frontend/dist")), false);
    assert.equal(existsSync(join(project, "frontend/.env.example")), true);
    assert.equal(existsSync(join(project, "frontend/.env")), true);
    assert.equal(existsSync(join(project, "frontend/.env.development.example")), true);
    assert.equal(existsSync(join(project, "frontend/.env.development")), true);
    assert.equal(existsSync(join(project, "backend/.env.example")), true);
    assert.equal(existsSync(join(project, "backend/.env")), true);
    assert.match(await readFile(join(project, "frontend/SPECS/API.md"), "utf8"), /^Source: \.\.\/\.\.\/SPECS\/API\.md\n?$/);

    const check = run(["check"], { cwd: project });
    assert.equal(check.status, 0, check.stderr);

    const localNext = run(["next"], { cwd: project });
    assert.equal(localNext.status, 0, localNext.stderr);
    assert.match(localNext.stdout, /Stage: initialized/);
    assert.match(localNext.stdout, /workflow\/requirements\.md/);

    const route = spawnSync(process.execPath, [join(project, ".agents/hooks/route-skill.mjs"), "--message", "接口报错，帮我定位"], {
      cwd: project,
      encoding: "utf8",
    });
    assert.equal(route.status, 0, route.stderr);
    const routePayload = JSON.parse(route.stdout);
    assert.equal(routePayload.stage, "initialized");
    assert.deepEqual(routePayload.aliases.slice(0, 3), ["debug-flow", "api-design", "requirement-clarification"]);
    assert.deepEqual(routePayload.skills[0], { alias: "debug-flow", skill: "debugging-and-error-recovery", reason: "message-debug" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage advance rejects skipped stages and missing quote", async () => {
  const { root, project } = await tempProject();
  try {
    await write(project, "workflow/requirements.md", "---\nstatus: draft\n---\n# Requirements\n");

    const skipped = run(["stage", "advance", "requirements-confirmed", "--by", "user", "--quote", "skip"], { cwd: project });
    assert.notEqual(skipped.status, 0);
    assert.match(skipped.stderr, /Repair:/);

    const missingQuote = run(["stage", "advance", "requirements-draft", "--by", "user"], { cwd: project });
    assert.notEqual(missingQuote.status, 0);
    assert.match(missingQuote.stderr, /--quote/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage advance rejects tampered allowedNextStages", async () => {
  const { root, project } = await tempProject();
  try {
    const state = await readJson(join(project, "workflow-state.json"));
    state.allowedNextStages = ["implementation-ready"];
    await setState(project, state);
    await write(project, "workflow/implementation-ready.md", "---\nstatus: ready\n---\n# Ready\n");

    const skipped = run(["stage", "advance", "implementation-ready", "--by", "user", "--quote", "try skip"], { cwd: project });
    assert.notEqual(skipped.status, 0);
    assert.match(skipped.stderr, /allowedNextStages must be \["requirements-draft"\] for stage "initialized"/);
    assert.match(skipped.stderr, /Repair:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage advance validates target artifact frontmatter", async () => {
  const { root, project } = await tempProject();
  try {
    const missing = run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求"], { cwd: project });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing target artifact/);

    await write(project, "workflow/requirements.md", "# Requirements\n");
    const noYaml = run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求"], { cwd: project });
    assert.notEqual(noYaml.status, 0);
    assert.match(noYaml.stderr, /Missing YAML/);

    await write(project, "workflow/requirements.md", "---\nstatus: confirmed\n---\n# Requirements\n");
    const wrongStatus = run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求"], { cwd: project });
    assert.notEqual(wrongStatus.status, 0);
    assert.match(wrongStatus.stderr, /expected "draft"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("valid advance writes full history entry", async () => {
  const { root, project } = await tempProject();
  try {
    await write(project, "workflow/requirements.md", "---\nstatus: draft\n---\n# Requirements\n");
    const advance = run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求草稿"], { cwd: project });
    assert.equal(advance.status, 0, advance.stderr);

    const state = await readJson(join(project, "workflow-state.json"));
    assert.equal(state.stage, "requirements-draft");
    assert.deepEqual(state.allowedNextStages, ["requirements-confirmed"]);
    assert.equal(state.currentStageDoc, "workflow/requirements.md");
    assert.equal(state.history.length, 1);
    assert.deepEqual(Object.keys(state.history[0]).sort(), ["advancedAt", "advancedBy", "doc", "from", "quote", "to"].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same-path requirements status switch fails before advance and passes after", async () => {
  const { root, project } = await tempProject();
  try {
    await write(project, "workflow/requirements.md", "---\nstatus: draft\n---\n# Requirements\n");
    assert.equal(run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求草稿"], { cwd: project }).status, 0);
    assert.equal(run(["check"], { cwd: project }).status, 0);

    await write(project, "workflow/requirements.md", "---\nstatus: confirmed\nconfirmedBy: user\nconfirmedAt: 2026-06-28T00:00:00.000Z\nconfirmationQuote: \"确认\"\n---\n# Requirements\n");
    const intermediate = run(["check"], { cwd: project });
    assert.notEqual(intermediate.status, 0);
    assert.match(intermediate.stderr, /status must be "draft"/);

    assert.equal(run(["stage", "advance", "requirements-confirmed", "--by", "user", "--quote", "确认"], { cwd: project }).status, 0);
    await write(project, "tasks/backlog.md", "# Backlog\n");
    assert.equal(run(["check"], { cwd: project }).status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage fixtures cover valid and invalid gate rules", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "kit-fixtures-"));
  try {
    const { project } = await tempProject();
    await cp(project, join(fixtureRoot, "base"), { recursive: true });

    const base = join(fixtureRoot, "base");
    assert.equal(run(["check"], { cwd: base }).status, 0);

    await write(base, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [a, b, c]\n---\n");
    const earlyFuture = run(["check"], { cwd: base });
    assert.notEqual(earlyFuture.status, 0);
    assert.match(earlyFuture.stderr, /Repair:/);

    await rm(join(base, "workflow/solution-options.md"), { force: true });
    await write(base, "workflow/requirements.md", "---\nstatus: draft\n---\n");
    assert.equal(run(["check"], { cwd: base }).status, 0, "initialized allows immediate requirements target");

    await rm(fixtureRoot, { recursive: true, force: true });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("valid fixtures pass for all six stages", async () => {
  for (const stage of ["initialized", "requirements-draft", "requirements-confirmed", "solution-options", "solution-selected", "implementation-ready"]) {
    const { root, project } = await buildProjectAt(stage);
    try {
      const check = run(["check"], { cwd: project });
      assert.equal(check.status, 0, `${stage}\n${check.stderr}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("invalid fixtures fail with repair actions", async () => {
  const cases = [
    {
      name: "missing history quote",
      stage: "requirements-draft",
      mutate: async (project) => {
        const state = await readJson(join(project, "workflow-state.json"));
        state.history = [{ from: "initialized", to: "requirements-draft", advancedBy: "user", advancedAt: "2026-06-28T00:00:00.000Z", doc: "workflow/requirements.md" }];
        await setState(project, state);
      },
      expected: /history\[0\] is missing "quote"/,
    },
    {
      name: "early future workflow file",
      stage: "initialized",
      mutate: async (project) => write(project, "workflow/solution-selected.md", "---\nstatus: selected\n---\n"),
      expected: /not allowed at stage "initialized"/,
    },
    {
      name: "missing source line",
      stage: "initialized",
      mutate: async (project) => write(project, "frontend/SPECS/API.md", "# duplicate API\n"),
      expected: /Missing exact root API source line/,
    },
    {
      name: "missing template map",
      stage: "initialized",
      mutate: async (project) => rm(join(project, "TEMPLATE.md"), { force: true }),
      expected: /TEMPLATE\.md: Required control file is missing/,
    },
    {
      name: "missing skill index",
      stage: "initialized",
      mutate: async (project) => rm(join(project, ".agents/skills.json"), { force: true }),
      expected: /\.agents\/skills\.json: Required control file is missing/,
    },
    {
      name: "missing route hook",
      stage: "initialized",
      mutate: async (project) => rm(join(project, ".agents/hooks/route-skill.mjs"), { force: true }),
      expected: /\.agents\/hooks\/route-skill\.mjs: Required control file is missing/,
    },
    {
      name: "missing workflow template",
      stage: "initialized",
      mutate: async (project) => rm(join(project, "workflow/requirements.template.md"), { force: true }),
      expected: /workflow\/requirements\.template\.md: Required control file is missing/,
    },
    {
      name: "missing AI implementation rule",
      stage: "initialized",
      mutate: async (project) => rm(join(project, "rules/ai-implementation.md"), { force: true }),
      expected: /rules\/ai-implementation\.md: Required control file is missing/,
    },
    {
      name: "missing referenced skill",
      stage: "initialized",
      mutate: async (project) => write(project, ".agents/skills.json", "{\n  \"version\": 1,\n  \"defaultChain\": [\"ghost\"],\n  \"stageDefaults\": {\n    \"initialized\": [\"ghost\"],\n    \"requirements-draft\": [\"ghost\"],\n    \"requirements-confirmed\": [\"ghost\"],\n    \"solution-options\": [\"ghost\"],\n    \"solution-selected\": [\"ghost\"],\n    \"implementation-ready\": [\"ghost\"]\n  },\n  \"skills\": [{ \"alias\": \"ghost\", \"skill\": \"ghost-skill\" }]\n}\n"),
      expected: /\.agents\/skills\/ghost-skill\/SKILL\.md: Skill "ghost-skill" referenced by alias "ghost" is missing/,
    },
    {
      name: "missing confirmed fields",
      stage: "requirements-confirmed",
      mutate: async (project) => write(project, "workflow/requirements.md", "---\nstatus: confirmed\n---\n# Requirements\n"),
      expected: /Missing frontmatter field "confirmedBy"/,
    },
    {
      name: "wrong option count",
      stage: "solution-options",
      mutate: async (project) => write(project, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [only-one]\n---\n# Options\n"),
      expected: /optionIds must contain exactly 3 ids/,
    },
    {
      name: "missing selected decision",
      stage: "solution-selected",
      mutate: async (project) => write(project, "memory/decisions.md", "# Decisions\n"),
      expected: /Missing selected option id "table-filtering"/,
    },
    {
      name: "early sprint plan",
      stage: "solution-selected",
      mutate: async (project) => write(project, "tasks/sprint-01.md", "# Sprint\n"),
      expected: /Sprint plan is created too early/,
    },
  ];

  for (const fixture of cases) {
    const { root, project } = await buildProjectAt(fixture.stage);
    try {
      await fixture.mutate(project);
      const check = run(["check"], { cwd: project });
      assert.notEqual(check.status, 0, fixture.name);
      assert.match(check.stderr, fixture.expected, fixture.name);
      assert.match(check.stderr, /Repair:/, fixture.name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("immediate target artifacts are allowed but not validated as current state", async () => {
  const { root, project } = await buildProjectAt("requirements-confirmed");
  try {
    await write(project, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [a, b, c]\n---\n# Options\n");
    const check = run(["check"], { cwd: project });
    assert.equal(check.status, 0, check.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skill orchestration commands read skills index and workflow state", async () => {
  const { root, project } = await tempProject();
  try {
    const skills = run(["skills"], { cwd: project });
    assert.equal(skills.status, 0, skills.stderr);
    assert.match(skills.stdout, /Stage: initialized/);
    assert.match(skills.stdout, /\* requirement-clarification -> ce-brainstorm/);
    assert.match(skills.stdout, /inputs: user request, workflow-state\.json, SPECS\/requirements\//);
    assert.match(skills.stdout, /outputs: workflow\/requirements\.md/);

    const skill = run(["skill", "api-design"], { cwd: project });
    assert.equal(skill.status, 0, skill.stderr);
    assert.match(skill.stdout, /Alias: api-design/);
    assert.match(skill.stdout, /Skill: api-and-interface-design/);
    assert.match(skill.stdout, /Inputs: workflow\/solution-selected\.md, SPECS\/API\.md, frontend\/SPECS\/, backend\/SPECS\//);
    assert.match(skill.stdout, /Outputs: updated SPECS\/API\.md, frontend\/backend API boundary notes/);
    assert.match(skill.stdout, /does not execute Agent skills/);

    const next = run(["next"], { cwd: project });
    assert.equal(next.status, 0, next.stderr);
    assert.match(next.stdout, /Next stage: requirements-draft/);
    assert.match(next.stdout, /Recommended skills: requirement-clarification, requirement-grilling/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("propose and options commands create workflow skeletons without advancing state", async () => {
  const { root, project } = await tempProject();
  try {
    const propose = run(["propose", "--title", "User Import"], { cwd: project });
    assert.equal(propose.status, 0, propose.stderr);
    assert.match(await readFile(join(project, "workflow/requirements.md"), "utf8"), /# User Import/);

    const duplicate = run(["propose"], { cwd: project });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already exists/);

    const earlyOptions = run(["options", "--ids", "minimal,balanced,robust"], { cwd: project });
    assert.notEqual(earlyOptions.status, 0);
    assert.match(earlyOptions.stderr, /only allowed after requirements-confirmed/);

    const state = await readJson(join(project, "workflow-state.json"));
    assert.equal(state.stage, "initialized");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("options command creates workflow skeleton after requirements are confirmed", async () => {
  const { root, project } = await buildProjectAt("requirements-confirmed");
  try {
    const options = run(["options", "--ids", "minimal,balanced,robust"], { cwd: project });
    assert.equal(options.status, 0, options.stderr);
    assert.match(await readFile(join(project, "workflow/solution-options.md"), "utf8"), /optionIds: \[minimal, balanced, robust\]/);

    const optionsCheck = run(["options", "--check"], { cwd: project });
    assert.equal(optionsCheck.status, 0, optionsCheck.stderr);
    assert.match(optionsCheck.stdout, /has 3 optionIds/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("options command rejects anything other than three option ids", async () => {
  const { root, project } = await buildProjectAt("requirements-confirmed");
  try {
    const create = run(["options", "--ids", "only-one"], { cwd: project });
    assert.notEqual(create.status, 0);
    assert.match(create.stderr, /exactly 3/);

    await write(project, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [a, b]\n---\n# Options\n");
    const check = run(["options", "--check"], { cwd: project });
    assert.notEqual(check.status, 0);
    assert.match(check.stderr, /exactly 3 optionIds/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sdd command creates feature-specific frontend and backend skeletons", async () => {
  const { root, project } = await buildProjectAt("solution-selected");
  try {
    const sdd = run(["sdd", "user-import"], { cwd: project });
    assert.equal(sdd.status, 0, sdd.stderr);
    assert.equal(existsSync(join(project, "frontend/SPECS/FEATURES/user-import/spec.md")), true);
    assert.equal(existsSync(join(project, "frontend/SPECS/FEATURES/user-import/tasks.md")), true);
    assert.equal(existsSync(join(project, "backend/SPECS/FEATURES/user-import/spec.md")), true);
    assert.equal(existsSync(join(project, "backend/SPECS/FEATURES/user-import/tasks.md")), true);
    assert.match(await readFile(join(project, "backend/SPECS/FEATURES/user-import/spec.md"), "utf8"), /feature: user-import/);
    assert.match(await readFile(join(project, "backend/SPECS/FEATURES/user-import/spec.md"), "utf8"), /\.\.\/\.\.\/\.\.\/\.\.\/SPECS\/API\.md/);
    assert.match(await readFile(join(project, "frontend/SPECS/FEATURES/user-import/spec.md"), "utf8"), /Harness References/);
    assert.match(await readFile(join(project, "backend/SPECS/FEATURES/user-import/tasks.md"), "utf8"), /Implicit behavior review completed/);

    const duplicate = run(["sdd", "user-import"], { cwd: project });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already exists/);

    const check = run(["check"], { cwd: project });
    assert.equal(check.status, 0, check.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sdd command rejects early feature skeleton creation", async () => {
  const { root, project } = await tempProject();
  try {
    const sdd = run(["sdd", "user-import"], { cwd: project });
    assert.notEqual(sdd.status, 0);
    assert.match(sdd.stderr, /only allowed after solution-selected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
