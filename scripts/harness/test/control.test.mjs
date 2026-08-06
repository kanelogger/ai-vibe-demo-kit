import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAll, makeRepo, runCli, sh, writeConfig, writeRepoFile, readConfig } from "./helpers.mjs";

async function align(root, ...extra) {
  return runCli(root, ["align", "--intent", "Change the fixture", "--done-when", "The fixture is updated", ...extra, "--json"]);
}

test("normal task fast-forwards to implementation and Full closes it", async () => {
  const root = await makeRepo();
  let result = await align(root);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.active.phase, "implementation");
  assert.equal(result.json.active.risk.level, "normal");

  await writeRepoFile(root, "src/value.txt", "v2\n");
  result = await runCli(root, ["check", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.report.passed, true);
  await commitAll(root);

  result = await runCli(root, ["finish", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.completed, true);
  result = await runCli(root, ["status", "--json"]);
  assert.equal(result.json.idle, true);
  assert.equal(result.json.last.outcome, "accepted");
});

test("high-risk task requires digest-bound alignment and acceptance confirmations", async () => {
  const root = await makeRepo();
  let result = await align(root, "--risk", "high", "--risk-reason", "control-plane", "--rollback", "git revert candidate");
  assert.equal(result.code, 1);
  assert.equal(result.json.decision, "confirmation-required");
  const alignmentDigest = result.json.confirmationDigest;

  result = await runCli(root, ["align", "--confirm", alignmentDigest, "--quote", "确认范围和回退方式", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.active.phase, "implementation");
  await writeRepoFile(root, "src/value.txt", "v2\n");
  await commitAll(root);

  result = await runCli(root, ["finish", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.decision, "confirmation-required");
  assert.equal(result.json.active.phase, "acceptance");
  const acceptanceDigest = result.json.confirmationDigest;

  result = await runCli(root, ["finish", "--confirm", acceptanceDigest, "--quote", "验收通过", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.completed, true);
});

test("align refuses a dirty baseline", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "src/value.txt", "dirty\n");
  const result = await align(root);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "E_GIT_DIRTY");
});

test("finish refuses an uncommitted candidate before running Full", async () => {
  const root = await makeRepo();
  await align(root);
  await writeRepoFile(root, "src/value.txt", "dirty candidate\n");
  const result = await runCli(root, ["finish", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "E_GIT_DIRTY");
});

test("status marks Quick stale after the worktree changes", async () => {
  const root = await makeRepo();
  await align(root);
  await writeRepoFile(root, "src/value.txt", "v2\n");
  let result = await runCli(root, ["check", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  await writeRepoFile(root, "src/value.txt", "v3\n");
  result = await runCli(root, ["status", "--json"]);
  assert.equal(result.json.active.quick.current, false);
});

test("failed Full keeps the task in implementation and records evidence", async () => {
  const root = await makeRepo({ full: ["node -e \"process.exit(7)\""] });
  await align(root);
  await writeRepoFile(root, "src/value.txt", "v2\n");
  await commitAll(root);
  const result = await runCli(root, ["finish", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "E_VERIFY_FAILED");
  const status = await runCli(root, ["status", "--json"]);
  assert.equal(status.json.active.phase, "implementation");
  assert.equal(status.json.active.full.passed, false);
});

test("branch drift is rejected after a committed candidate", async () => {
  const root = await makeRepo();
  await align(root);
  await sh("git", ["switch", "-c", "other"], root);
  await writeRepoFile(root, "src/value.txt", "candidate\n");
  await commitAll(root);
  const result = await runCli(root, ["finish", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "E_GIT_DRIFT");
});

test("abort reports the current candidate and never modifies the worktree", async () => {
  const root = await makeRepo();
  await align(root);
  await writeRepoFile(root, "src/value.txt", "unfinished\n");
  const before = await readFile(join(root, "src/value.txt"), "utf8");
  const head = await sh("git", ["rev-parse", "HEAD"], root);
  const result = await runCli(root, ["abort", "--reason", "stop", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.candidate.commit, head);
  assert.equal(await readFile(join(root, "src/value.txt"), "utf8"), before);
  assert.match(await sh("git", ["status", "--porcelain"], root), /src\/value\.txt/);
});

test("abort remains available from detached HEAD", async () => {
  const root = await makeRepo();
  await align(root);
  await sh("git", ["checkout", "--detach"], root);
  const result = await runCli(root, ["abort", "--reason", "recover", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.candidate.branch, null);
  assert.equal(result.json.idle, true);
});

test("Full fails when a verification command changes the candidate HEAD", async () => {
  const root = await makeRepo({
    full: ["git commit --allow-empty -m verification-must-not-commit"],
  });
  await align(root);
  await writeRepoFile(root, "src/value.txt", "v2\n");
  await commitAll(root);
  const result = await runCli(root, ["finish", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "E_VERIFY_FAILED");
  assert.equal(result.json.error.facts.report.passed, false);
});

test("a changed high-risk path promotes a normal task before Full", async () => {
  const root = await makeRepo();
  const config = await readConfig(root);
  config.risk.highRiskPaths = ["src"];
  await writeConfig(root, config);
  await commitAll(root, "configure risk");
  await align(root);
  await writeRepoFile(root, "src/value.txt", "v2\n");
  await commitAll(root);
  const result = await runCli(root, ["finish", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.decision, "confirmation-required");
  assert.equal(result.json.active.phase, "alignment");
  assert.equal(result.json.active.risk.level, "high");
});

test("high-risk acceptance evidence is stale after switching branches", async () => {
  const root = await makeRepo();
  let result = await align(root, "--risk", "high", "--risk-reason", "control-plane", "--rollback", "git revert candidate");
  result = await runCli(root, ["align", "--confirm", result.json.confirmationDigest, "--quote", "确认", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  await writeRepoFile(root, "src/value.txt", "v2\n");
  await commitAll(root);
  result = await runCli(root, ["finish", "--json"]);
  assert.equal(result.code, 1);
  const digest = result.json.confirmationDigest;
  await sh("git", ["switch", "-c", "other"], root);
  result = await runCli(root, ["finish", "--confirm", digest, "--quote", "验收", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "E_VERIFY_STALE");
});
