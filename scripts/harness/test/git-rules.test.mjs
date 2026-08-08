import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGitRepo, run, runRaw } from "./helpers.mjs";
import { validCommitSubject } from "../../check-commit-messages.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const checker = join(sourceRoot, "scripts", "check-commit-messages.mjs");

test("semantic commit subjects accept the documented forms", () => {
  for (const subject of [
    "feat: add version output",
    "fix(store): recover a dead lock",
    "feat(api)!: remove the legacy field",
    "chore(deps/security): update pinned action",
    "revert: restore the prior behavior",
  ]) assert.equal(validCommitSubject(subject), true, subject);
});

test("semantic commit subjects reject vague or malformed forms", () => {
  for (const subject of [
    "update",
    "Fix: uppercase type",
    "fix missing separator",
    "fix(): empty scope",
    "fix: ",
    "fix: trailing space ",
  ]) assert.equal(validCommitSubject(subject), false, subject);
});

test("the checker inspects only the requested range", async () => {
  const root = await makeGitRepo();
  const base = await run("git", ["rev-parse", "HEAD"], root);
  await writeFile(join(root, "valid.txt"), "valid\n");
  await run("git", ["add", "valid.txt"], root);
  await run("git", ["commit", "-qm", "feat: add valid change"], root);
  const validHead = await run("git", ["rev-parse", "HEAD"], root);
  let result = await runRaw(process.execPath, [checker, base, validHead], root);
  assert.equal(result.code, 0, result.stderr);

  await writeFile(join(root, "invalid.txt"), "invalid\n");
  await run("git", ["add", "invalid.txt"], root);
  await run("git", ["commit", "-qm", "update"], root);
  const invalidHead = await run("git", ["rev-parse", "HEAD"], root);
  result = await runRaw(process.execPath, [checker, validHead, invalidHead], root);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /update/);
  assert.doesNotMatch(result.stderr, /initial/);
});

test("merge commit subjects are ignored", async () => {
  const root = await makeGitRepo();
  const mainBranch = await run("git", ["branch", "--show-current"], root);
  const base = await run("git", ["rev-parse", "HEAD"], root);
  await run("git", ["switch", "-c", "topic"], root);
  await writeFile(join(root, "topic.txt"), "topic\n");
  await run("git", ["add", "topic.txt"], root);
  await run("git", ["commit", "-qm", "feat: add topic"], root);
  await run("git", ["switch", mainBranch], root);
  await writeFile(join(root, "main.txt"), "main\n");
  await run("git", ["add", "main.txt"], root);
  await run("git", ["commit", "-qm", "fix: update main"], root);
  await run("git", ["merge", "--no-ff", "topic", "-m", "update"], root);
  const head = await run("git", ["rev-parse", "HEAD"], root);
  const result = await runRaw(process.execPath, [checker, base, head], root);
  assert.equal(result.code, 0, result.stderr);
});
