import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import harnessContextGuard from "../../../.omp/extensions/harness-context-guard.js";
import { extractWriteTargets } from "../adapters/hook-core.mjs";
import { commitAll, makeRepo, readConfig, runCli, writeConfig, writeRepoFile } from "./helpers.mjs";

const PRE_TOOL_USE = fileURLToPath(new URL("../adapters/pre-tool-use.mjs", import.meta.url));

async function managedRepo() {
  const root = await makeRepo();
  const config = await readConfig(root);
  config.contextIndex.codeRoots = ["src"];
  await writeConfig(root, config);
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source", readBeforeWrite: ["../README.md"] }, null, 2)}\n`,
  );
  await commitAll(root, "configure context");
  const aligned = await runCli(root, ["align", "--intent", "Edit source", "--done-when", "Source changes", "--json"]);
  assert.equal(aligned.code, 0, aligned.stderr);
  return root;
}

async function runPreToolUse(payload) {
  const stdout = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [PRE_TOOL_USE], { cwd: payload.cwd, stdio: ["pipe", "pipe", "pipe"] });
    const output = [];
    const errors = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(output).toString("utf8"));
      else rejectPromise(new Error(Buffer.concat(errors).toString("utf8") || `adapter exited ${code}`));
    });
    child.stdin.end(JSON.stringify(payload));
  });
  return stdout.trim() === "" ? null : JSON.parse(stdout);
}

test("Codex apply_patch input is denied once and allowed on the same-session retry", async () => {
  const root = await managedRepo();
  const payload = {
    cwd: root,
    session_id: "codex-session",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: src/value.txt\n*** End Patch" },
  };

  const denied = await runPreToolUse(payload);
  assert.equal(denied.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(denied.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, /Context Guard blocked src\/value\.txt/);
  assert.equal(await runPreToolUse(payload), null);
});

test("a multi-file patch delivers every target before asking for one retry", async () => {
  const root = await managedRepo();
  const payload = {
    cwd: root,
    session_id: "codex-multi-session",
    tool_name: "apply_patch",
    tool_input: {
      command: [
        "*** Begin Patch",
        "*** Update File: src/value.txt",
        "*** Add File: src/second.txt",
        "*** End Patch",
      ].join("\n"),
    },
  };

  const denied = await runPreToolUse(payload);
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, /src\/value\.txt/);
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, /src\/second\.txt/);
  assert.equal(await runPreToolUse(payload), null);
});

test("Claude Write and Edit inputs expose their structured target paths", () => {
  assert.deepEqual(extractWriteTargets({ tool_name: "Write", tool_input: { file_path: "src/a.mjs" } }), ["src/a.mjs"]);
  assert.deepEqual(extractWriteTargets({ tool_name: "Edit", tool_input: { file_path: "src/b.mjs" } }), ["src/b.mjs"]);
  assert.deepEqual(extractWriteTargets({ tool_name: "NotebookEdit", tool_input: { notebook_path: "src/a.ipynb" } }), ["src/a.ipynb"]);
});

test("OMP extension registers one write hook and returns the platform block shape", async () => {
  const root = await managedRepo();
  let handler = null;
  harnessContextGuard({
    on(event, callback) {
      assert.equal(event, "tool_call");
      handler = callback;
    },
  });
  assert.equal(typeof handler, "function");

  const result = await handler(
    { toolName: "write", input: { path: "src/value.txt" } },
    { cwd: root, sessionManager: { getSessionFile: () => "omp-session" } },
  );
  assert.equal(result.block, true);
  assert.match(result.reason, /Context Guard blocked src\/value\.txt/);
});

test("unstructured shell writes stay outside the hard-block contract", () => {
  assert.deepEqual(extractWriteTargets({ tool_name: "Bash", tool_input: { command: "printf x > src/value.txt" } }), []);
});
