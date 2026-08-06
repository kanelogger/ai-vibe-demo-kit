import test from "node:test";
import assert from "node:assert/strict";
import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { commitAll, makeRepo, readConfig, runCli, writeConfig, writeRepoFile } from "./helpers.mjs";
import { controlPath } from "../lib/state.mjs";

async function configureManagedRoot(root, { highRiskPaths = [] } = {}) {
  const config = await readConfig(root);
  config.contextIndex.codeRoots = ["src"];
  config.risk.highRiskPaths = highRiskPaths;
  await writeConfig(root, config);
  await writeRepoFile(root, "SPECS/architecture.md", "# Architecture\n\nStable boundary.\n");
  await writeRepoFile(root, "src/types.mjs", "export const kind = 'v1';\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({
      version: 1,
      summary: "Source module",
      readBeforeWrite: ["../SPECS/architecture.md"],
      files: { "value.txt": { readBeforeWrite: ["./types.mjs"] } },
    }, null, 2)}\n`,
  );
  await commitAll(root, "configure context");
}

async function align(root) {
  const result = await runCli(root, [
    "align", "--intent", "Change source", "--done-when", "Source is updated", "--json",
  ]);
  assert.equal(result.code, 0, result.stderr);
}

test("managed write is blocked once, allowed on retry, and blocked after prerequisite drift", async () => {
  const root = await makeRepo();
  await configureManagedRoot(root);
  await align(root);

  let result = await runCli(root, ["context", "guard", "--file", "src/value.txt", "--session", "session-a", "--json"]);
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.json.decision, "blocked");
  assert.equal(result.json.code, "E_CONTEXT_BLOCKED");
  assert.deepEqual(result.json.dependencies.map((entry) => entry.path), ["SPECS/architecture.md", "src/types.mjs"]);
  assert.match(result.json.receipt.path, /^control\.json#active\.contextReceipts\./);

  const state = JSON.parse(await readFile(await controlPath(root), "utf8"));
  assert.equal(Object.keys(state.active.contextReceipts).length, 1);
  assert.equal(state.active.contextReceipts[Object.keys(state.active.contextReceipts)[0]].workItemId, state.active.id);

  result = await runCli(root, ["context", "guard", "--file", "src/value.txt", "--session", "session-a", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.decision, "allowed");

  await writeRepoFile(root, "src/types.mjs", "export const kind = 'v2';\n");
  result = await runCli(root, ["context", "guard", "--file", "src/value.txt", "--session", "session-a", "--json"]);
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.json.decision, "blocked");
  assert.equal(result.json.dependencies[1].content, "export const kind = 'v2';\n");
});

test("unmanaged files remain writable without an active task", async () => {
  const root = await makeRepo();
  const result = await runCli(root, ["context", "guard", "--file", "README.md", "--session", "session-a", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.decision, "unmanaged");
});

test("nested managed files do not require an index in every subdirectory", async () => {
  const root = await makeRepo();
  await configureManagedRoot(root);
  await writeRepoFile(root, "src/nested/value.txt", "nested\n");
  await commitAll(root, "add nested source");
  await align(root);
  const result = await runCli(root, [
    "context", "guard", "--file", "src/nested/value.txt", "--session", "session-a", "--json",
  ]);
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.json.decision, "blocked");
  assert.deepEqual(result.json.indexes.map((entry) => entry.path), ["src/.harness-index.json"]);
});

test("managed files require an active implementation phase", async () => {
  const root = await makeRepo();
  await configureManagedRoot(root);
  const result = await runCli(root, ["context", "guard", "--file", "src/value.txt", "--session", "session-a", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "E_PHASE");
});

test("a managed high-risk path upgrades the task before context delivery", async () => {
  const root = await makeRepo();
  await configureManagedRoot(root, { highRiskPaths: ["src"] });
  await align(root);
  const result = await runCli(root, ["context", "guard", "--file", "src/value.txt", "--session", "session-a", "--json"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, "E_CONFIRM_REQUIRED");
  const current = await runCli(root, ["status", "--json"]);
  assert.equal(current.json.active.phase, "alignment");
  assert.equal(current.json.active.risk.level, "high");
});

test("symlinked context prerequisites are rejected without disclosure", async () => {
  const root = await makeRepo();
  const config = await readConfig(root);
  config.contextIndex.codeRoots = ["src"];
  await writeConfig(root, config);
  await writeRepoFile(root, "secret.md", "do not disclose\n");
  await symlink("../secret.md", join(root, "src", "secret-link.md"));
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source", readBeforeWrite: ["./secret-link.md"] })}\n`,
  );
  await commitAll(root, "configure invalid context");
  await align(root);
  const result = await runCli(root, ["context", "guard", "--file", "src/value.txt", "--session", "session-a", "--json"]);
  assert.equal(result.code, 2);
  assert.equal(result.json.error.code, "E_USAGE");
  assert.doesNotMatch(result.stdout, /do not disclose/);
});
