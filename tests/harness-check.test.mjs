// harness-check.test.mjs — Harness 检查器契约测试。
// 运行: node --test tests/harness-check.test.mjs

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = join(repoRoot, "tests", "fixtures");

function checkerPath(root) {
  return join(root, "scripts", "harness-check.mjs");
}

function runCheck(root, mode = "all") {
  const result = spawnSync(process.execPath, [checkerPath(root), mode, "--root", root], {
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function errorIds(output) {
  return [...output.matchAll(/^ERROR (\S+) /gm)].map((match) => match[1]);
}

async function hashTree(root) {
  const hash = createHash("sha256");
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        hash.update(full.slice(root.length));
        hash.update(await readFile(full));
      }
    }
  }
  await walk(root);
  return hash.digest("hex");
}

async function mutableCopy(fixtureRel) {
  const source = join(fixturesRoot, fixtureRel);
  const target = await mkdtemp(join(tmpdir(), "harness-fixture-"));
  await cp(source, target, { recursive: true });
  return target;
}

// ---------------------------------------------------------------------------
// context
// ---------------------------------------------------------------------------

test("context: 有效夹具退出码 0", () => {
  const root = join(fixturesRoot, "valid-context");
  const result = runCheck(root, "context");
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^OK context$/m);
});

test("context: 缺失 AGENTS、ARCHITECTURE、config 退出码 1 且带稳定检查 ID 与 REPAIR", () => {
  const root = join(fixturesRoot, "invalid-context");
  const result = runCheck(root, "context");
  assert.equal(result.code, 1);
  const ids = errorIds(result.stdout);
  assert.ok(ids.includes("context.missing-path"), ids.join(","));
  assert.ok(ids.includes("context.config-invalid-json") || result.stdout.includes(".harness/config.json"), ids.join(","));
  const errorCount = (result.stdout.match(/^ERROR /gm) ?? []).length;
  const repairCount = (result.stdout.match(/^REPAIR: /gm) ?? []).length;
  assert.equal(errorCount, repairCount, "每个 ERROR 必须跟一条 REPAIR");
});

test("context: 损坏 JSON 退出码 2", () => {
  const root = join(fixturesRoot, "broken-json");
  const result = runCheck(root, "all");
  assert.equal(result.code, 2, result.stdout);
  const ids = errorIds(result.stdout);
  assert.ok(ids.includes("context.config-invalid-json"));
  assert.ok(ids.includes("context.state-invalid-json"));
});

test("context: 关键占位符被检出", async () => {
  const root = await mutableCopy("valid-context");
  try {
    const agents = join(root, "AGENTS.md");
    await writeFile(agents, `${await readFile(agents, "utf8")}\n项目名：{{projectName}}\n`, "utf8");
    const result = runCheck(root, "context");
    assert.equal(result.code, 1);
    assert.ok(errorIds(result.stdout).includes("context.placeholder"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context: 未填写的项目身份与命令分别报错", async () => {
  const root = await mutableCopy("valid-context");
  try {
    const configPath = join(root, ".harness", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.project.name = "";
    config.commands = { quick: { static: [], test: [] }, full: { static: [], test: [] } };
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    const result = runCheck(root, "context");
    assert.equal(result.code, 1);
    const ids = errorIds(result.stdout);
    assert.ok(ids.includes("context.project-identity-missing"));
    assert.ok(ids.includes("context.commands-missing"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

const STAGES = [
  "initialized",
  "requirements-draft",
  "requirements-confirmed",
  "solution-options",
  "solution-selected",
  "implementation-ready",
];

for (const stage of STAGES) {
  test(`gates: 合法阶段夹具 ${stage} 通过`, () => {
    const root = join(fixturesRoot, "stages", stage);
    const result = runCheck(root, "gates");
    assert.equal(result.code, 0, result.stdout + result.stderr);
  });
}

test("gates: 手改 allowedNextStages 跳阶段被发现", async () => {
  const root = await mutableCopy("stages/requirements-draft");
  try {
    const statePath = join(root, "workflow-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.allowedNextStages = ["implementation-ready"];
    await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
    const result = runCheck(root, "gates");
    assert.equal(result.code, 1);
    assert.ok(errorIds(result.stdout).includes("gates.bad-transitions"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gates: 状态与文档不一致被发现（lastConfirmedDoc 指针）", async () => {
  const root = await mutableCopy("stages/requirements-confirmed");
  try {
    const statePath = join(root, "workflow-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.lastConfirmedDoc = "workflow/solution-selected.md";
    await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
    const result = runCheck(root, "gates");
    assert.equal(result.code, 1);
    assert.ok(errorIds(result.stdout).includes("gates.state-doc-mismatch"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gates: 缺少用户原话被发现", async () => {
  const root = await mutableCopy("stages/requirements-confirmed");
  try {
    const reqPath = join(root, "workflow", "requirements.md");
    await writeFile(reqPath, (await readFile(reqPath, "utf8")).replace(/^confirmationQuote:.*$/m, "confirmationQuote:"), "utf8");
    const result = runCheck(root, "gates");
    assert.equal(result.code, 1);
    assert.ok(errorIds(result.stdout).includes("gates.missing-user-quote"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gates: 未来阶段产物提前存在被发现", async () => {
  const root = await mutableCopy("stages/requirements-draft");
  try {
    await writeFile(join(root, "workflow", "solution-selected.md"), "---\nstatus: selected\n---\n# 提前产物\n", "utf8");
    const result = runCheck(root, "gates");
    assert.equal(result.code, 1);
    assert.ok(errorIds(result.stdout).includes("gates.premature-artifact"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gates: 仅改状态布尔/阶段字段无法绕过文档证据", async () => {
  const root = await mutableCopy("stages/initialized");
  try {
    const statePath = join(root, "workflow-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.stage = "requirements-confirmed";
    state.allowedNextStages = ["solution-options"];
    await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
    const result = runCheck(root, "gates");
    assert.equal(result.code, 1);
    const ids = errorIds(result.stdout);
    assert.ok(ids.includes("gates.missing-stage-doc"), ids.join(","));
    assert.ok(ids.includes("gates.task-timing"), ids.join(","));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gates: 检查器只读——夹具哈希在运行前后一致", async () => {
  for (const stage of STAGES) {
    const root = join(fixturesRoot, "stages", stage);
    const before = await hashTree(root);
    runCheck(root, "all");
    const after = await hashTree(root);
    assert.equal(after, before, `检查器修改了 ${stage} 夹具`);
  }
});

// ---------------------------------------------------------------------------
// evidence
// ---------------------------------------------------------------------------

test("evidence: 合法夹具通过", () => {
  const root = join(fixturesRoot, "valid-context");
  const result = runCheck(root, "evidence");
  assert.equal(result.code, 0, result.stdout + result.stderr);
});

test("evidence: 缺 Source Register 失败", () => {
  const root = join(fixturesRoot, "evidence", "no-source-register");
  const result = runCheck(root, "evidence");
  assert.equal(result.code, 1);
  assert.ok(errorIds(result.stdout).includes("evidence.source-register-missing"));
});

test("evidence: 声明 UI 但未登记关键用户路径失败；非 UI 项目不强制浏览器 E2E", () => {
  const ui = runCheck(join(fixturesRoot, "evidence", "ui-no-user-paths"), "evidence");
  assert.equal(ui.code, 1);
  assert.ok(errorIds(ui.stdout).includes("evidence.user-path-missing"));

  const nonUi = runCheck(join(fixturesRoot, "valid-context"), "evidence");
  assert.equal(nonUi.code, 0, "非 UI 项目不得被强制要求用户路径或浏览器 E2E");
});

test("evidence: 缺清理和回退登记失败", () => {
  const result = runCheck(join(fixturesRoot, "evidence", "no-recovery"), "evidence");
  assert.equal(result.code, 1);
  const ids = errorIds(result.stdout);
  assert.ok(ids.includes("evidence.cleanup-missing"));
  assert.ok(ids.includes("evidence.rollback-missing"));
});

test("evidence: 存在唯一契约来源但未登记契约校验失败", () => {
  const result = runCheck(join(fixturesRoot, "evidence", "no-contracts-check"), "evidence");
  assert.equal(result.code, 1);
  assert.ok(errorIds(result.stdout).includes("evidence.contracts-missing"));
});

test("evidence: 无契约项目删除契约文件后不强制 contracts 命令", async () => {
  const root = await mutableCopy("valid-context");
  try {
    await rm(join(root, "SPECS", "API.md"));
    await rm(join(root, "SPECS", "DATABASE.md"));
    const configPath = join(root, ".harness", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.commands.contracts = ["无对外契约：纯 CLI 项目"];
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    const result = runCheck(root, "evidence");
    assert.equal(result.code, 0, result.stdout + result.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("evidence: sprint 缺验证报告失败", () => {
  const result = runCheck(join(fixturesRoot, "evidence", "sprint-no-report"), "evidence");
  assert.equal(result.code, 1);
  assert.ok(errorIds(result.stdout).includes("evidence.report-missing"));
});

test("evidence: 已确认需求残留用户原话占位符失败", () => {
  const result = runCheck(join(fixturesRoot, "evidence", "confirmed-placeholder-quote"), "evidence");
  assert.equal(result.code, 1);
  assert.ok(errorIds(result.stdout).includes("evidence.placeholder-quote"));
});

test("evidence: 登记关键用户路径但条目不完整失败", async () => {
  const root = await mutableCopy("valid-context");
  try {
    const configPath = join(root, ".harness", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.criticalUserPaths = [{ id: "checkout" }];
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    const result = runCheck(root, "evidence");
    assert.equal(result.code, 1);
    assert.ok(errorIds(result.stdout).includes("evidence.user-path-incomplete"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("all: 依次执行三类检查并聚合退出码", () => {
  const ok = runCheck(join(fixturesRoot, "valid-context"), "all");
  assert.equal(ok.code, 0);
  assert.match(ok.stdout, /^OK all$/m);

  const bad = runCheck(join(fixturesRoot, "broken-json"), "all");
  assert.equal(bad.code, 2);
});

// ---------------------------------------------------------------------------
// commit
// ---------------------------------------------------------------------------

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

async function committedCopy(fixtureRel) {
  const root = await mutableCopy(fixtureRel);
  git(root, ["init"]);
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "fixture baseline"]);
  return root;
}

test("commit: 干净工作区通过", async () => {
  const root = await committedCopy("valid-context");
  try {
    const result = runCheck(root, "commit");
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^OK commit$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit: 未提交改动被发现", async () => {
  const root = await committedCopy("valid-context");
  try {
    await writeFile(join(root, "leftover.js"), "// uncommitted\n", "utf8");
    const result = runCheck(root, "commit");
    assert.equal(result.code, 1);
    assert.ok(errorIds(result.stdout).includes("commit.uncommitted-changes"), result.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit: 非 Git 仓库失败", async () => {
  const root = await mutableCopy("valid-context");
  try {
    const result = runCheck(root, "commit");
    assert.equal(result.code, 1);
    assert.ok(errorIds(result.stdout).includes("commit.git-unavailable"), result.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
