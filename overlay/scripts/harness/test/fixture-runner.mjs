// fixture-runner.mjs — 表驱动 fixture 运行器（NFR-10 / ticket 01）。
// 每个声明式用例在独立临时 git 仓库中重放：seed 命令序列 → run 探针 → 断言 → 可选修复。
// 断言维度：退出码、稳定错误码、stdout JSON 子集、stateRef 文件子集、文件缺失。
// 所有断言失败都给出带路径的可读 diff。

import test from "node:test";
import assert from "node:assert/strict";
import { makeRepo, runCli, stateFileJson, sh } from "./helpers.mjs";

/** stateFiles 路径中的 {active} 占位符：优先 registry 的 active id，否则用最近命令返回的 workItemId。 */
async function activeIdOf(root, lastItemId) {
  const registry = await stateFileJson(root, "registry.json");
  return registry.activeWorkItemId ?? lastItemId ?? "";
}

async function resolveStatePath(root, path, lastItemId) {
  if (!path.includes("{active}")) return path;
  return path.replaceAll("{active}", await activeIdOf(root, lastItemId));
}

/**
 * 深子集匹配：expected 的每个键必须存在于 actual 且递归匹配；
 * 数组要求等长且逐元素子集匹配；原始值严格相等。返回不匹配路径列表。
 */
export function subsetDiff(actual, expected, path = "$") {
  const diffs = [];
  if (expected === null || typeof expected !== "object") {
    if (actual !== expected) diffs.push(`${path}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    return diffs;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      diffs.push(`${path}: 期望数组，实际 ${JSON.stringify(actual)}`);
      return diffs;
    }
    if (actual.length !== expected.length) {
      diffs.push(`${path}: 期望长度 ${expected.length}，实际长度 ${actual.length}`);
      return diffs;
    }
    for (let i = 0; i < expected.length; i += 1) diffs.push(...subsetDiff(actual[i], expected[i], `${path}[${i}]`));
    return diffs;
  }
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    diffs.push(`${path}: 期望对象，实际 ${JSON.stringify(actual)}`);
    return diffs;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (!(key in actual)) {
      diffs.push(`${path}.${key}: 缺失，期望 ${JSON.stringify(value)}`);
      continue;
    }
    diffs.push(...subsetDiff(actual[key], value, `${path}.${key}`));
  }
  return diffs;
}

export function assertSubset(actual, expected, label) {
  const diffs = subsetDiff(actual, expected);
  assert.deepEqual(diffs, [], `${label} 不匹配：\n${diffs.join("\n")}`);
}

/** 递归替换字符串中的 {name} 占位符为捕获变量值。 */
export function substituteVars(value, vars) {
  if (typeof value === "string") {
    return value.replaceAll(/\{([A-Za-z]+)\}/g, (match, name) => (name in vars ? vars[name] : match));
  }
  if (Array.isArray(value)) return value.map((entry) => substituteVars(entry, vars));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [substituteVars(key, vars), substituteVars(entry, vars)]),
    );
  }
  return value;
}

async function expectCommand(root, args, expect, label, lastItemId) {
  const r = await runCli(root, args);
  assert.equal(r.code, expect.code, `${label}: 退出码期望 ${expect.code}，实际 ${r.code}\nstderr: ${r.stderr}`);
  if (expect.error) {
    assert.match(r.stderr, new RegExp(expect.error), `${label}: stderr 应含 ${expect.error}\nstderr: ${r.stderr}`);
  }
  if (expect.json) {
    assert.ok(r.json, `${label}: stdout 应为 JSON\nstdout: ${r.stdout}`);
    assertSubset(r.json, expect.json, `${label} json`);
  }
  if (expect.stateFiles) {
    for (const [path, subset] of Object.entries(expect.stateFiles)) {
      const resolved = await resolveStatePath(root, path, lastItemId);
      const actual = await stateFileJson(root, resolved);
      assertSubset(actual, subset, `${label} stateRef:${resolved}`);
    }
  }
  if (expect.noStateFiles) {
    for (const path of expect.noStateFiles) {
      const resolved = await resolveStatePath(root, path, lastItemId);
      const entry = await sh("git", ["ls-tree", "refs/heads/harness/state", "--", resolved], root);
      assert.equal(entry, "", `${label}: stateRef:${resolved} 不应存在于 tree 中`);
    }
  }
  if (expect.stateTreeExactly) {
    const prefix = await resolveStatePath(root, expect.stateTreeExactly.prefix, lastItemId);
    const listing = await sh("git", ["ls-tree", "-r", "--name-only", "refs/heads/harness/state", "--", prefix], root);
    const actual = listing === "" ? [] : listing.split("\n").sort();
    const activeId = await activeIdOf(root, lastItemId);
    const expected = expect.stateTreeExactly.files.map((file) => file.replaceAll("{active}", activeId)).sort();
    assert.deepEqual(actual, expected, `${label}: stateRef ${prefix} 下的文件集不匹配`);
  }
  return r;
}

/**
 * 用例行：{ name, seed?, run, expect, fix?, expectAfterFix? }
 * - seed: CLI 参数数组的数组，逐条重放且必须退出 0；
 * - run/expect: 探针命令与断言（code/error/json/stateFiles/noStateFiles）；
 * - fix/expectAfterFix: “拒绝 → 修复后通过”三段式（NFR-10）。
 */
export function runCases(suiteName, cases) {
  for (const fixtureCase of cases) {
    test(`${suiteName}｜${fixtureCase.name}`, async () => {
      const root = await makeRepo();
      let lastItemId = null;
      const vars = {};
      for (const [index, seedEntry] of (fixtureCase.seed ?? []).entries()) {
        const seedCommand = Array.isArray(seedEntry) ? seedEntry : seedEntry.cmd;
        const seeded = await runCli(root, substituteVars(seedCommand, vars));
        assert.equal(
          seeded.code,
          0,
          `seed[${index}] ${seedCommand.join(" ")} 必须成功\nstderr: ${seeded.stderr}`,
        );
        lastItemId = seeded.json?.workItemId ?? lastItemId;
        if (!Array.isArray(seedEntry) && seedEntry.as) {
          assert.ok(seeded.json?.workItemId, `seed[${index}] 需要捕获 workItemId，但输出不是 JSON`);
          vars[seedEntry.as] = seeded.json.workItemId;
        }
      }
      const probed = await expectCommand(
        root,
        substituteVars(fixtureCase.run, vars),
        substituteVars(fixtureCase.expect, vars),
        fixtureCase.name,
        lastItemId,
      );
      lastItemId = probed.json?.workItemId ?? lastItemId;
      if (fixtureCase.fix) {
        assert.ok(fixtureCase.expectAfterFix, `${fixtureCase.name}: 有 fix 必须有 expectAfterFix`);
        await expectCommand(
          root,
          substituteVars(fixtureCase.fix, vars),
          substituteVars(fixtureCase.expectAfterFix, vars),
          `${fixtureCase.name}（修复后）`,
          lastItemId,
        );
      }
    });
  }
}
