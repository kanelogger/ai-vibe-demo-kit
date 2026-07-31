// harness-stage.test.mjs — 阶段推进命令契约测试。
// 运行: node --test tests/harness-stage.test.mjs

import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = join(repoRoot, "tests", "fixtures");

function runStage(root, args) {
  const result = spawnSync(process.execPath, [join(root, "scripts", "harness-stage.mjs"), ...args, "--root", root], {
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

async function mutableCopy(fixtureRel) {
  const target = await mkdtemp(join(tmpdir(), "harness-stage-"));
  await cp(join(fixturesRoot, fixtureRel), target, { recursive: true });
  return target;
}

async function readState(root) {
  return JSON.parse(await readFile(join(root, "workflow-state.json"), "utf8"));
}

test("status: 打印当前阶段、允许转换和最近放行", () => {
  const root = join(fixturesRoot, "stages", "requirements-confirmed");
  const result = runStage(root, ["status"]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^stage: requirements-confirmed$/m);
  assert.match(result.stdout, /^allowedNextStages: \["solution-options"\]$/m);
  assert.match(result.stdout, /^lastAdvance: /m);
});

test("advance: 合法单步推进写入完整证据链", async () => {
  const root = await mutableCopy("stages/requirements-draft");
  try {
    const result = runStage(root, ["advance", "--to", "requirements-confirmed", "--by", "user", "--quote", "需求就按这个做"]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^OK advanced requirements-draft -> requirements-confirmed$/m);

    const state = await readState(root);
    assert.equal(state.stage, "requirements-confirmed");
    assert.deepEqual(state.allowedNextStages, ["solution-options"]);
    assert.equal(state.lastConfirmedDoc, "workflow/requirements.md");
    assert.equal(state.confirmation.quote, "需求就按这个做");

    const last = state.history[state.history.length - 1];
    assert.equal(last.from, "requirements-draft");
    assert.equal(last.to, "requirements-confirmed");
    assert.equal(last.advancedBy, "user");
    assert.equal(last.quote, "需求就按这个做");
    assert.equal(last.doc, "workflow/requirements.md");
    assert.ok(!Number.isNaN(Date.parse(last.advancedAt)), "advancedAt 必须是 ISO 时间");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: 跳阶段被拒绝且状态文件不变", async () => {
  const root = await mutableCopy("stages/initialized");
  try {
    const result = runStage(root, ["advance", "--to", "requirements-confirmed", "--quote", "直接确认需求"]);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stdout, /^ERROR stage\.not-allowed /m);
    assert.equal((await readState(root)).stage, "initialized");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: 缺用户原话被拒绝", async () => {
  const root = await mutableCopy("stages/requirements-draft");
  try {
    const result = runStage(root, ["advance", "--to", "requirements-confirmed"]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^ERROR stage\.missing-quote /m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: 占位符式原话被拒绝", async () => {
  const root = await mutableCopy("stages/requirements-draft");
  try {
    for (const quote of ["用户原话", "<用户原话>", "{{quote}}"]) {
      const result = runStage(root, ["advance", "--to", "requirements-confirmed", "--quote", quote]);
      assert.equal(result.code, 1, `quote ${quote} 应被拒绝`);
      assert.match(result.stdout, /^ERROR stage\.missing-quote /m);
    }
    assert.equal((await readState(root)).stage, "requirements-draft");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: 目标阶段文档缺失被拒绝", async () => {
  const root = await mutableCopy("stages/initialized");
  try {
    const result = runStage(root, ["advance", "--to", "requirements-draft", "--quote", "开始做需求"]);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stdout, /^ERROR stage\.doc-missing workflow\/requirements\.md/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: 手改 allowedNextStages 后拒绝推进", async () => {
  const root = await mutableCopy("stages/initialized");
  try {
    const state = await readState(root);
    state.allowedNextStages = ["implementation-ready"];
    await writeFile(join(root, "workflow-state.json"), JSON.stringify(state, null, 2), "utf8");
    const result = runStage(root, ["advance", "--to", "requirements-draft", "--quote", "开始做需求"]);
    assert.equal(result.code, 2);
    assert.match(result.stdout, /^ERROR stage\.state-drifted /m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: solution-selected 推进同步 selection 指针", async () => {
  const root = await mutableCopy("stages/solution-options");
  try {
    // solution-selected 的目标文档需要先行准备（门禁要求文档先于推进存在）。
    await cp(join(fixturesRoot, "stages", "solution-selected", "workflow", "solution-selected.md"), join(root, "workflow", "solution-selected.md"));
    const result = runStage(root, ["advance", "--to", "solution-selected", "--quote", "选 balanced"]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const state = await readState(root);
    assert.equal(state.selection.quote, "选 balanced");
    assert.equal(state.selection.doc, "workflow/solution-selected.md");
    // lastConfirmedDoc 不被方案选定覆盖。
    assert.equal(state.lastConfirmedDoc, "workflow/requirements.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: UI 项目推进 design-confirmed 写入确认证据", async () => {
  const root = await mutableCopy("stages/requirements-confirmed");
  try {
    // 模拟 UI 项目：config 声明 UI，状态文件的允许转换与之一致。
    const configPath = join(root, ".harness", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.project.hasUserInterface = true;
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    const state = await readState(root);
    state.allowedNextStages = ["design-confirmed"];
    await writeFile(join(root, "workflow-state.json"), JSON.stringify(state, null, 2), "utf8");
    await cp(join(fixturesRoot, "stages", "design-confirmed", "workflow", "design.md"), join(root, "workflow", "design.md"));

    const result = runStage(root, ["advance", "--to", "design-confirmed", "--by", "user", "--quote", "设计稿就按这个来"]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const next = await readState(root);
    assert.equal(next.stage, "design-confirmed");
    assert.deepEqual(next.allowedNextStages, ["solution-options"]);
    assert.equal(next.lastConfirmedDoc, "workflow/design.md");
    assert.equal(next.confirmation.quote, "设计稿就按这个来");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: 非 UI 项目不得进入 design-confirmed", async () => {
  const root = await mutableCopy("stages/requirements-confirmed");
  try {
    await cp(join(fixturesRoot, "stages", "design-confirmed", "workflow", "design.md"), join(root, "workflow", "design.md"));
    const result = runStage(root, ["advance", "--to", "design-confirmed", "--quote", "设计稿就按这个来"]);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stdout, /^ERROR stage\.not-allowed /m);
    assert.equal((await readState(root)).stage, "requirements-confirmed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: UI 项目缺设计文档被拒绝", async () => {
  const root = await mutableCopy("stages/requirements-confirmed");
  try {
    const configPath = join(root, ".harness", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.project.hasUserInterface = true;
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    const state = await readState(root);
    state.allowedNextStages = ["design-confirmed"];
    await writeFile(join(root, "workflow-state.json"), JSON.stringify(state, null, 2), "utf8");
    const result = runStage(root, ["advance", "--to", "design-confirmed", "--quote", "设计稿就按这个来"]);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stdout, /^ERROR stage\.doc-missing workflow\/design\.md/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advance: implementation-ready 推进 accepted 写入验收证据", async () => {
  const root = await mutableCopy("stages/implementation-ready");
  try {
    await cp(join(fixturesRoot, "stages", "accepted", "workflow", "acceptance.md"), join(root, "workflow", "acceptance.md"));
    const result = runStage(root, ["advance", "--to", "accepted", "--by", "user", "--quote", "验收通过"]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const state = await readState(root);
    assert.equal(state.stage, "accepted");
    assert.deepEqual(state.allowedNextStages, []);
    assert.equal(state.lastConfirmedDoc, "workflow/acceptance.md");
    assert.equal(state.confirmation.quote, "验收通过");
    const last = state.history[state.history.length - 1];
    assert.equal(last.doc, "workflow/acceptance.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("usage: 未知命令退出码 2", () => {
  const root = join(fixturesRoot, "stages", "initialized");
  const result = runStage(root, ["frobnicate"]);
  assert.equal(result.code, 2);
});
