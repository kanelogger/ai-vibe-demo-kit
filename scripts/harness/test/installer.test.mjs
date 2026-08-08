import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installHarness } from "../lib/installer.mjs";
import { makeGitRepo } from "./helpers.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("installer copies the lightweight runtime and is idempotent", async () => {
  const target = await makeGitRepo();
  let result = await installHarness({ sourceRoot, targetRoot: target });
  assert.ok(result.created.includes("harness"));
  assert.equal((await lstat(join(target, "harness"))).mode & 0o111, 0o111);
  assert.match(await readFile(join(target, "bin", "harness.mjs"), "utf8"), /Harness/);

  result = await installHarness({ sourceRoot, targetRoot: target });
  assert.equal(result.created.length, 0);
  assert.ok(result.unchanged.includes("harness"));
});

test("installer preflight refuses different content without partial writes", async () => {
  const target = await makeGitRepo();
  await installHarness({ sourceRoot, targetRoot: target });
  await writeFile(join(target, "harness"), "different\n");
  await assert.rejects(
    installHarness({ sourceRoot, targetRoot: target }),
    (error) => error.code === "E_INSTALL_CONFLICT",
  );
  assert.equal(await readFile(join(target, "harness"), "utf8"), "different\n");
});

test("installer rejects a symlinked destination directory", async () => {
  const target = await makeGitRepo();
  await mkdir(join(target, "elsewhere"));
  await symlink(join(target, "elsewhere"), join(target, "bin"));
  await assert.rejects(
    installHarness({ sourceRoot, targetRoot: target }),
    (error) => error.code === "E_INSTALL_CONFLICT" && error.facts.conflicts.some((entry) => entry.path === "bin/harness.mjs"),
  );
});

test("installer rejects a symlink passed as the target root", async () => {
  const target = await makeGitRepo();
  const targetLink = `${target}-link`;
  await symlink(target, targetLink, "dir");
  await assert.rejects(
    installHarness({ sourceRoot, targetRoot: targetLink }),
    (error) => error.code === "E_PATH_SYMLINK",
  );
});

test("installer rejects a non-Git target", async () => {
  const target = await mkdtemp(join(tmpdir(), "harness-not-git-"));
  await assert.rejects(
    installHarness({ sourceRoot, targetRoot: target }),
    (error) => error.code === "E_NOT_GIT",
  );
});
