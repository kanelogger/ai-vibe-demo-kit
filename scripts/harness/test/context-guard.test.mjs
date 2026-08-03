// context-guard.test.mjs — Directory Index resolution and Context Guard CLI contract.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { makeRepo, runCli, sh } from "./helpers.mjs";
import { guardWriteContext } from "../lib/context-guard.mjs";

async function writeRepoFile(root, rel, content) {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

async function configureCodeRoots(root, codeRoots) {
  const path = join(root, ".harness", "config.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  config.contextIndex = { codeRoots };
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

test("managed file is blocked with context, then allowed until a prerequisite drifts", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "SPECS/architecture.md", "# Architecture\n\nStable boundary.\n");
  await writeRepoFile(root, "src/types.mjs", "export const kind = 'v1';\n");
  await writeRepoFile(root, "src/handler.mjs", "export const handler = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify(
      {
        version: 1,
        summary: "Source module",
        readBeforeWrite: ["../SPECS/architecture.md"],
        files: {
          "handler.mjs": { readBeforeWrite: ["./types.mjs"] },
        },
      },
      null,
      2,
    )}\n`,
  );

  const statusBefore = await sh("git", ["status", "--porcelain"], root);
  const first = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/handler.mjs",
    "--session",
    "session-a",
    "--json",
  ]);
  assert.equal(first.code, 1, first.stderr);
  assert.equal(first.json.decision, "blocked");
  assert.equal(first.json.target, "src/handler.mjs");
  assert.deepEqual(first.json.indexes.map((entry) => entry.path), ["src/.harness-index.json"]);
  assert.deepEqual(first.json.dependencies.map((entry) => entry.path), [
    "SPECS/architecture.md",
    "src/types.mjs",
  ]);
  assert.deepEqual(first.json.dependencies.map((entry) => entry.content), [
    "# Architecture\n\nStable boundary.\n",
    "export const kind = 'v1';\n",
  ]);
  assert.match(first.json.resolutionDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await sh("git", ["status", "--porcelain"], root), statusBefore, "receipt must stay outside the worktree");

  const second = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/handler.mjs",
    "--session",
    "session-a",
    "--json",
  ]);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.json.decision, "allowed");
  assert.equal(second.json.resolutionDigest, first.json.resolutionDigest);

  await writeRepoFile(root, "src/types.mjs", "export const kind = 'v2';\n");
  const drifted = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/handler.mjs",
    "--session",
    "session-a",
    "--json",
  ]);
  assert.equal(drifted.code, 1, drifted.stderr);
  assert.equal(drifted.json.decision, "blocked");
  assert.notEqual(drifted.json.resolutionDigest, first.json.resolutionDigest);
  assert.equal(drifted.json.dependencies[1].content, "export const kind = 'v2';\n");
});

test("disabled context indexes leave files unmanaged", async () => {
  const root = await makeRepo();
  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "README.md",
    "--session",
    "session-a",
    "--json",
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.json, {
    version: 1,
    decision: "unmanaged",
    target: "README.md",
    indexes: [],
    dependencies: [],
    resolutionDigest: null,
    receipt: null,
  });
});

test("ancestor indexes accumulate exact-file and transitive prerequisites in stable order", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "shared/base.md", "base\n");
  await writeRepoFile(root, "shared/types.md", "types contract\n");
  await writeRepoFile(root, "shared/feature.md", "feature contract\n");
  await writeRepoFile(root, "src/types.mjs", "export const type = true;\n");
  await writeRepoFile(root, "src/adapter.mjs", "export const adapter = true;\n");
  await writeRepoFile(root, "src/feature/handler.mjs", "export const handler = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({
      version: 1,
      summary: "Source root",
      readBeforeWrite: ["../shared/base.md"],
      files: {
        "feature/handler.mjs": { readBeforeWrite: ["./types.mjs"] },
        "types.mjs": { readBeforeWrite: ["../shared/types.md"] },
      },
    })}\n`,
  );
  await writeRepoFile(
    root,
    "src/feature/.harness-index.json",
    `${JSON.stringify({
      version: 1,
      summary: "Feature module",
      readBeforeWrite: ["../../shared/feature.md"],
      files: {
        "handler.mjs": { readBeforeWrite: ["../adapter.mjs"] },
      },
    })}\n`,
  );

  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/feature/handler.mjs",
    "--session",
    "session-a",
    "--json",
  ]);
  assert.equal(result.code, 1, result.stderr);
  assert.deepEqual(result.json.indexes.map((entry) => entry.path), [
    "src/.harness-index.json",
    "src/feature/.harness-index.json",
  ]);
  assert.deepEqual(result.json.dependencies.map((entry) => entry.path), [
    "shared/base.md",
    "src/types.mjs",
    "shared/types.md",
    "shared/feature.md",
    "src/adapter.mjs",
  ]);
  assert.equal(result.json.dependencies.filter((entry) => entry.path === "shared/base.md").length, 1);
});

test("transitive prerequisite cycles are refused with a stable error", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/a.mjs", "export const a = true;\n");
  await writeRepoFile(root, "src/b.mjs", "export const b = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({
      version: 1,
      summary: "Cyclic source",
      files: {
        "a.mjs": { readBeforeWrite: ["./b.mjs"] },
        "b.mjs": { readBeforeWrite: ["./a.mjs"] },
      },
    })}\n`,
  );

  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/a.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /E_CONTEXT_DEPENDENCY_CYCLE/);
  assert.match(result.stderr, /src\/a\.mjs → src\/b\.mjs → src\/a\.mjs/);
});

test("a target whose parent symlink escapes the repository is refused", async () => {
  const root = await makeRepo();
  const outside = await mkdtemp(join(tmpdir(), "harness-context-outside-"));
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root" })}\n`,
  );
  await symlink(outside, join(root, "src", "escape"));

  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/escape/outside.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /E_CONTEXT_TARGET_INVALID/);
});

test("a prerequisite whose parent symlink escapes the repository is never disclosed", async () => {
  const root = await makeRepo();
  const outside = await mkdtemp(join(tmpdir(), "harness-context-secret-"));
  await writeFile(join(outside, "secret.md"), "outside secret\n");
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["./escape/secret.md"] })}\n`,
  );
  await symlink(outside, join(root, "src", "escape"));

  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/target.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /E_CONTEXT_REFERENCE_INVALID/);
  assert.doesNotMatch(result.stdout, /outside secret/);
});

test("receipts are isolated by session and absolute in-repository targets normalize", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root" })}\n`,
  );
  const target = join(root, "src", "target.mjs");

  const first = await runCli(root, ["context", "guard", "--file", target, "--session", "session-a", "--json"]);
  assert.equal(first.code, 1, first.stderr);
  assert.equal(first.json.target, "src/target.mjs");

  const current = await runCli(root, ["context", "guard", "--file", target, "--session", "session-a", "--json"]);
  assert.equal(current.code, 0, current.stderr);
  assert.equal(current.json.decision, "allowed");

  const otherSession = await runCli(root, ["context", "guard", "--file", target, "--session", "session-b", "--json"]);
  assert.equal(otherSession.code, 1, otherSession.stderr);
  assert.equal(otherSession.json.decision, "blocked");
  assert.notEqual(otherSession.json.receipt.path, first.json.receipt.path);
});

const invalidContextCases = [
  {
    name: "missing root index",
    expected: "E_CONTEXT_INDEX_REQUIRED",
    setup: async () => {},
  },
  {
    name: "unknown index field",
    expected: "E_CONTEXT_INDEX_INVALID",
    setup: (root) =>
      writeRepoFile(
        root,
        "src/.harness-index.json",
        `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrtie: [] })}\n`,
      ),
  },
  {
    name: "missing prerequisite",
    expected: "E_CONTEXT_REFERENCE_INVALID",
    setup: (root) =>
      writeRepoFile(
        root,
        "src/.harness-index.json",
        `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["./missing.md"] })}\n`,
      ),
  },
  {
    name: "directory prerequisite",
    expected: "E_CONTEXT_REFERENCE_INVALID",
    setup: async (root) => {
      await mkdir(join(root, "src", "docs"));
      await writeRepoFile(
        root,
        "src/.harness-index.json",
        `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["./docs"] })}\n`,
      );
    },
  },
  {
    name: "symlink prerequisite",
    expected: "E_CONTEXT_REFERENCE_INVALID",
    setup: async (root) => {
      await writeRepoFile(root, "src/contract.md", "contract\n");
      await symlink("contract.md", join(root, "src", "contract-link.md"));
      await writeRepoFile(
        root,
        "src/.harness-index.json",
        `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["./contract-link.md"] })}\n`,
      );
    },
  },
  {
    name: "NUL prerequisite",
    expected: "E_CONTEXT_REFERENCE_NOT_TEXT",
    setup: async (root) => {
      await writeRepoFile(root, "src/binary.dat", Buffer.from([0x61, 0x00, 0x62]));
      await writeRepoFile(
        root,
        "src/.harness-index.json",
        `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["./binary.dat"] })}\n`,
      );
    },
  },
  {
    name: "invalid UTF-8 prerequisite",
    expected: "E_CONTEXT_REFERENCE_NOT_TEXT",
    setup: async (root) => {
      await writeRepoFile(root, "src/invalid.txt", Buffer.from([0xc3, 0x28]));
      await writeRepoFile(
        root,
        "src/.harness-index.json",
        `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["./invalid.txt"] })}\n`,
      );
    },
  },
];

for (const scenario of invalidContextCases) {
  test(`invalid context is refused: ${scenario.name}`, async () => {
    const root = await makeRepo();
    await configureCodeRoots(root, ["src"]);
    await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
    await scenario.setup(root);
    const result = await runCli(root, [
      "context",
      "guard",
      "--file",
      "src/target.mjs",
      "--session",
      "session-a",
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, new RegExp(scenario.expected));
  });
}

test("overlapping Code Roots are refused as ambiguous configuration", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src", "src/nested"]);
  await writeRepoFile(root, "src/nested/target.mjs", "export const target = true;\n");
  await writeRepoFile(root, "src/.harness-index.json", `${JSON.stringify({ version: 1, summary: "Source root" })}\n`);
  await writeRepoFile(root, "src/nested/.harness-index.json", `${JSON.stringify({ version: 1, summary: "Nested root" })}\n`);

  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/nested/target.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /E_CONTEXT_CONFIG_INVALID/);
});

test("receipts use the Git private path in a linked worktree", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(root, "src/.harness-index.json", `${JSON.stringify({ version: 1, summary: "Source root" })}\n`);
  await sh("git", ["add", "-A"], root);
  await sh("git", ["commit", "-m", "context fixture"], root);

  const worktreeParent = await mkdtemp(join(tmpdir(), "harness-context-worktree-"));
  const linked = join(worktreeParent, "linked");
  await sh("git", ["worktree", "add", "-b", "context-linked", linked], root);
  const statusBefore = await sh("git", ["status", "--porcelain"], linked);

  const first = await runCli(linked, [
    "context",
    "guard",
    "--file",
    "src/target.mjs",
    "--session",
    "linked-session",
    "--json",
  ]);
  assert.equal(first.code, 1, first.stderr);
  assert.equal(first.json.decision, "blocked");

  const second = await runCli(linked, [
    "context",
    "guard",
    "--file",
    "src/target.mjs",
    "--session",
    "linked-session",
    "--json",
  ]);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.json.decision, "allowed");
  assert.equal(await sh("git", ["status", "--porcelain"], linked), statusBefore);
  assert.match(await sh("git", ["rev-parse", "--git-path", "harness/context-receipts"], linked), /worktrees/);
});

test("a failed context delivery does not commit a receipt", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(root, "src/.harness-index.json", `${JSON.stringify({ version: 1, summary: "Source root" })}\n`);
  const input = {
    root,
    config: { contextIndex: { codeRoots: ["src"] } },
    targetPath: "src/target.mjs",
    sessionId: "session-a",
  };

  await assert.rejects(
    guardWriteContext({ ...input, deliver: async () => { throw new Error("sink failed"); } }),
    /sink failed/,
  );
  let delivered = null;
  const retry = await guardWriteContext({ ...input, deliver: async (bundle) => { delivered = bundle; } });
  assert.equal(retry.decision, "blocked");
  assert.equal(delivered.decision, "blocked");
});

test("a present malformed harness config fails closed", async () => {
  const root = await makeRepo();
  await writeFile(join(root, ".harness", "config.json"), "{ malformed\n");
  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "README.md",
    "--session",
    "session-a",
  ]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /E_CONTEXT_CONFIG_INVALID/);
});

test("repository-internal symlink aliases are refused before Code Root routing", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(root, "src/.harness-index.json", `${JSON.stringify({ version: 1, summary: "Source root" })}\n`);
  await symlink("src", join(root, "alias"));

  const unmanagedAlias = await runCli(root, [
    "context",
    "guard",
    "--file",
    "alias/target.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(unmanagedAlias.code, 2);
  assert.match(unmanagedAlias.stderr, /E_CONTEXT_TARGET_INVALID/);

  await writeRepoFile(root, "other/target.mjs", "export const other = true;\n");
  await symlink("../other", join(root, "src", "other-alias"));
  const crossRootAlias = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/other-alias/target.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(crossRootAlias.code, 2);
  assert.match(crossRootAlias.stderr, /E_CONTEXT_TARGET_INVALID/);
});

test("Git-private files cannot be disclosed as prerequisites", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["../.git/config"] })}\n`,
  );
  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/target.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /E_CONTEXT_REFERENCE_INVALID/);
  assert.doesNotMatch(result.stdout, /phase-a@test\.local/);
});

test("oversized prerequisites are refused before content output", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  await writeRepoFile(root, "src/large.txt", "x".repeat(512 * 1024 + 1));
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: ["./large.txt"] })}\n`,
  );
  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/target.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /E_CONTEXT_FILE_TOO_LARGE/);
  assert.equal(result.stdout, "");
});

test("missing target and session use distinct Context Guard errors", async () => {
  const root = await makeRepo();
  const missingTarget = await runCli(root, ["context", "guard", "--session", "session-a"]);
  assert.equal(missingTarget.code, 2);
  assert.match(missingTarget.stderr, /E_CONTEXT_TARGET_INVALID/);

  const missingSession = await runCli(root, ["context", "guard", "--file", "README.md"]);
  assert.equal(missingSession.code, 2);
  assert.match(missingSession.stderr, /E_CONTEXT_SESSION_REQUIRED/);
});

test("the total Context Closure has a bounded byte size", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  const refs = [];
  for (let index = 0; index < 5; index += 1) {
    const path = `shared/part-${index}.txt`;
    refs.push(`../${path}`);
    await writeRepoFile(root, path, String(index).repeat(430 * 1024));
  }
  await writeRepoFile(
    root,
    "src/.harness-index.json",
    `${JSON.stringify({ version: 1, summary: "Source root", readBeforeWrite: refs })}\n`,
  );

  const result = await runCli(root, [
    "context",
    "guard",
    "--file",
    "src/target.mjs",
    "--session",
    "session-a",
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /E_CONTEXT_CLOSURE_TOO_LARGE/);
  assert.equal(result.stdout, "");
});

test("index and transitive prerequisite drift independently invalidate receipts", async () => {
  const root = await makeRepo();
  await configureCodeRoots(root, ["src"]);
  await writeRepoFile(root, "shared/transitive.md", "transitive v1\n");
  await writeRepoFile(root, "src/types.mjs", "export const type = true;\n");
  await writeRepoFile(root, "src/target.mjs", "export const target = true;\n");
  const indexValue = (summary) => ({
    version: 1,
    summary,
    files: {
      "target.mjs": { readBeforeWrite: ["./types.mjs"] },
      "types.mjs": { readBeforeWrite: ["../shared/transitive.md"] },
    },
  });
  await writeRepoFile(root, "src/.harness-index.json", `${JSON.stringify(indexValue("Source root"))}\n`);
  const args = ["context", "guard", "--file", "src/target.mjs", "--session", "session-a", "--json"];

  const initial = await runCli(root, args);
  assert.equal(initial.code, 1, initial.stderr);
  assert.equal((await runCli(root, args)).json.decision, "allowed");

  await writeRepoFile(root, "shared/transitive.md", "transitive v2\n");
  const transitiveDrift = await runCli(root, args);
  assert.equal(transitiveDrift.code, 1, transitiveDrift.stderr);
  assert.notEqual(transitiveDrift.json.resolutionDigest, initial.json.resolutionDigest);
  assert.equal(transitiveDrift.json.dependencies[1].content, "transitive v2\n");
  assert.equal((await runCli(root, args)).json.decision, "allowed");

  await writeRepoFile(root, "src/.harness-index.json", `${JSON.stringify(indexValue("Source root revised"))}\n`);
  const indexDrift = await runCli(root, args);
  assert.equal(indexDrift.code, 1, indexDrift.stderr);
  assert.notEqual(indexDrift.json.resolutionDigest, transitiveDrift.json.resolutionDigest);
  assert.equal(indexDrift.json.indexes[0].summary, "Source root revised");
});
