import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArchitectureMemory, validateArchitectureIndex } from "../../src/runtime/validation/index.mjs";
import { makeGitRepo, runRaw } from "../helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceCli = join(sourceRoot, "src", "runtime", "cli.mjs");

function project(exclude = ["**/generated"]) {
  return `schema_version: 1
architecture_memory:
  filename: "ARCHITECTURE.md"
  code_roots:
    - "src"
  exclude:
${exclude.map((entry) => `    - "${entry}"`).join("\n")}
`;
}

async function architectureRepo() {
  const root = await makeGitRepo();
  await mkdir(join(root, "src", "nested"), { recursive: true });
  await writeFile(join(root, "project.yml"), project());
  await writeFile(join(root, "ARCHITECTURE.md"), "# Root\n\n`src/ARCHITECTURE.md`\n");
  await writeFile(join(root, "src", "ARCHITECTURE.md"), "# Source\n\n`main.mjs`\n\n`nested/`\n");
  await writeFile(join(root, "src", "main.mjs"), "export const value = 1;\n");
  await writeFile(join(root, "src", "nested", "ARCHITECTURE.md"), "# Nested\n\n`worker.mjs`\n");
  await writeFile(join(root, "src", "nested", "worker.mjs"), "export const worker = true;\n");
  return root;
}

test("architecture_memory parser accepts the controlled project.yml subset", () => {
  const report = parseArchitectureMemory(project());
  assert.equal(report.valid, true);
  assert.deepEqual(report.value, { filename: "ARCHITECTURE.md", codeRoots: ["src"], exclude: ["**/generated"] });
});

test("architecture index accepts closed parent, directory and file indexes", async () => {
  const root = await architectureRepo();
  await mkdir(join(root, "src", "generated"));
  await writeFile(join(root, "src", "generated", "ignored.mjs"), "ignored\n");
  const report = await validateArchitectureIndex(root, await readFile(join(root, "project.yml"), "utf8"));
  assert.equal(report.valid, true, JSON.stringify(report.errors));
});

test("architecture index reports missing directory, parent and source-file entries", async () => {
  const root = await architectureRepo();
  await writeFile(join(root, "src", "ARCHITECTURE.md"), "# Incomplete\n");
  const report = await validateArchitectureIndex(root, await readFile(join(root, "project.yml"), "utf8"));
  assert.ok(report.errors.some((entry) => entry.code === "E_ARCH_CHILD_UNINDEXED"));
  assert.ok(report.errors.some((entry) => entry.code === "E_ARCH_FILE_UNINDEXED"));
  await writeFile(join(root, "src", "nested", "ARCHITECTURE.md"), "removed then replaced by directory in next assertion\n");
  await mkdir(join(root, "src", "unindexed"));
  const missing = await validateArchitectureIndex(root, await readFile(join(root, "project.yml"), "utf8"));
  assert.ok(missing.errors.some((entry) => entry.code === "E_ARCH_INDEX_MISSING"));
});

test("architecture index rejects unsafe config and code symlinks", async () => {
  const unsafe = parseArchitectureMemory(project(["../outside"]));
  assert.equal(unsafe.valid, false);
  assert.ok(unsafe.errors.some((entry) => entry.code === "E_ARCH_CONFIG"));

  const root = await architectureRepo();
  await symlink(join(root, "README.md"), join(root, "src", "linked.mjs"));
  const report = await validateArchitectureIndex(root, await readFile(join(root, "project.yml"), "utf8"));
  assert.ok(report.errors.some((entry) => entry.code === "E_ARCH_SYMLINK"));
  assert.equal(report.configurationValid, false);
});

test("check-architecture CLI returns stable JSON and governance exit codes", async () => {
  const root = await architectureRepo();
  let result = await runRaw(process.execPath, [sourceCli, "check-architecture", "--file", "project.yml", "--json"], root);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).valid, true);

  await writeFile(join(root, "src", "ARCHITECTURE.md"), "# Missing source index\n\n`nested/`\n");
  result = await runRaw(process.execPath, [sourceCli, "check-architecture", "--file", "project.yml", "--json"], root);
  assert.equal(result.code, 1);
  assert.ok(JSON.parse(result.stdout).errors.some((entry) => entry.code === "E_ARCH_FILE_UNINDEXED"));
});

test("current repository architecture index is closed", async () => {
  const report = await validateArchitectureIndex(sourceRoot, await readFile(join(sourceRoot, "project.yml"), "utf8"));
  assert.equal(report.valid, true, JSON.stringify(report.errors));
});
