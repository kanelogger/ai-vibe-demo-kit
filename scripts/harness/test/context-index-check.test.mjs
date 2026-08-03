// context-index-check.test.mjs — static index validation and write-hook adapter behavior.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { validateContextIndexes } from "../lib/context-guard.mjs";
import { makeRepo, sh } from "./helpers.mjs";

const execFileAsync = promisify(execFile);
const CHECKER = fileURLToPath(new URL("../../harness-check.mjs", import.meta.url));
const HOOK = fileURLToPath(new URL("../../../.agents/hooks/guard-write-context.mjs", import.meta.url));

async function writeRepoFile(root, rel, content) {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

async function configureCodeRoots(root, codeRoots) {
  const path = join(root, ".harness", "config.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  config.contextIndex = { codeRoots };
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

async function runHook(root, args) {
  try {
    const result = await execFileAsync(process.execPath, [HOOK, ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, HARNESS_PROJECT_ROOT: root },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr, json: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      json: (() => {
        try {
          return JSON.parse(error.stdout ?? "");
        } catch {
          return null;
        }
      })(),
    };
  }
}

test("static validation covers existing files without creating receipts", async () => {
  const root = await makeRepo();
  const config = await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "contracts/root.md", "root contract\n");
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(root, "src/nested/child.mjs", "export const child = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["../contracts/root.md"] })}\n`,
  );
  await writeRepoFile(
    root,
    "src/nested/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Nested source" })}\n`,
  );

  const result = await validateContextIndexes({ root, config });
  assert.deepEqual(result.codeRoots, ["src"]);
  assert.equal(result.indexCount, 2);
  assert.ok(result.targetCount >= 4);
  const receiptRoot = (await sh("git", ["rev-parse", "--git-path", "harness/context-receipts"], root)).trim();
  await assert.rejects(access(join(root, receiptRoot)), { code: "ENOENT" });
});

test("static validation rejects exact-file entries whose targets do not exist", async () => {
  const root = await makeRepo();
  const config = await configureCodeRoots(root, ["src"]);
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({
      version: 1,
      summary: "Source root",
      files: { "missing.mjs": { readBeforeWrite: [] } },
    })}\n`,
  );
  await assert.rejects(
    validateContextIndexes({ root, config }),
    (error) => error?.code === "E_CONTEXT_INDEX_INVALID" && /missing\.mjs/.test(error.message),
  );
});

test("write Hook Adapter blocks once and allows the same-session retry", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "contract.md", "hook contract\n");
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["../contract.md"] })}\n`,
  );

  const args = ["--file", "src/target.mjs", "--session", "hook-session", "--json"];
  const first = await runHook(root, args);
  assert.equal(first.code, 1, first.stderr);
  assert.equal(first.json.decision, "blocked");
  assert.equal(first.json.dependencies[0].content, "hook contract\n");

  const second = await runHook(root, args);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.json.decision, "allowed");
  assert.equal(second.json.resolutionDigest, first.json.resolutionDigest);
});

test("harness-check context maps index failures to stable checker errors", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["./missing.md"] })}\n`,
  );

  let output = "";
  try {
    await execFileAsync(process.execPath, [CHECKER, "context", "--root", root], { encoding: "utf8" });
    assert.fail("checker must reject the invalid index");
  } catch (error) {
    output = error.stdout ?? "";
  }
  assert.match(output, /ERROR context\.context-reference-invalid src\/missing\.md:/);
  assert.match(output, /E_CONTEXT_REFERENCE_INVALID/);
});
