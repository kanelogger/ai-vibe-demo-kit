import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkChangeTests } from "../../source/tools/check-change-tests.mjs";
import { makeGitRepo, run } from "../helpers.mjs";

const options = { behaviorPaths: ["src"], testRoots: ["test"] };

async function commitAll(root, subject) {
  await run("git", ["add", "."], root);
  await run("git", ["commit", "-qm", subject], root);
  return run("git", ["rev-parse", "HEAD"], root);
}

test("feat and fix behavior commits require a test change in the same commit", async () => {
  const root = await makeGitRepo();
  const base = await run("git", ["rev-parse", "HEAD"], root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "feature.mjs"), "export const feature = true;\n");
  const head = await commitAll(root, "feat: add feature");
  const report = checkChangeTests(base, head, { ...options, cwd: root });
  assert.equal(report.code, 1);
  assert.match(report.stderr, /src\/feature\.mjs/);
});

test("feat and fix behavior commits pass when tests change together", async () => {
  const root = await makeGitRepo();
  const base = await run("git", ["rev-parse", "HEAD"], root);
  await mkdir(join(root, "src"));
  await mkdir(join(root, "test"));
  await writeFile(join(root, "src", "feature.mjs"), "export const feature = true;\n");
  await writeFile(join(root, "test", "feature.test.mjs"), "// feature coverage\n");
  const head = await commitAll(root, "fix(feature): correct feature");
  const report = checkChangeTests(base, head, { ...options, cwd: root });
  assert.deepEqual(report, { code: 0, stdout: "change tests: valid (1 commit(s))\n" });
});

test("non-feature commits and architecture-only feature commits do not require test edits", async () => {
  const root = await makeGitRepo();
  const base = await run("git", ["rev-parse", "HEAD"], root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "feature.mjs"), "export const feature = true;\n");
  await commitAll(root, "refactor: move internals");
  await writeFile(join(root, "src", "ARCHITECTURE.md"), "# Source\n");
  const head = await commitAll(root, "feat: document module index");
  const report = checkChangeTests(base, head, { ...options, cwd: root });
  assert.equal(report.code, 0, report.stderr);
});

test("change-test checker rejects unsafe refs and path configuration", async () => {
  const root = await makeGitRepo();
  const head = await run("git", ["rev-parse", "HEAD"], root);
  assert.equal(checkChangeTests("../base", head, { ...options, cwd: root }).code, 2);
  assert.equal(checkChangeTests(head, head, { behaviorPaths: ["../src"], testRoots: ["test"], cwd: root }).code, 2);
});
