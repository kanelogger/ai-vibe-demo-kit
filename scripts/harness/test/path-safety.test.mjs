import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firstSymlinkInPath, isInside, resolveInside } from "../lib/path-safety.mjs";

test("repository paths stay within their declared root", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-path-safety-"));
  assert.equal(isInside(root, root), true);
  assert.equal(isInside(root, join(root, "work", "result.json")), true);
  assert.equal(isInside(root, `${root}-sibling`), false);
  assert.equal(resolveInside(root, "."), root);
  assert.equal(resolveInside(root, "work/result.json"), join(root, "work", "result.json"));
  assert.equal(resolveInside(root, ""), null);
  assert.equal(resolveInside(root, root), null);
  assert.equal(resolveInside(root, "../outside.json"), null);
});

test("symlink inspection reports leaf and intermediate links", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-path-symlink-"));
  const realDirectory = join(root, "real");
  const realFile = join(realDirectory, "result.json");
  await mkdir(realDirectory);
  await writeFile(realFile, "{}\n");

  const leafLink = join(root, "result-link.json");
  await symlink(realFile, leafLink);
  assert.equal(await firstSymlinkInPath(root, leafLink), leafLink);

  const directoryLink = join(root, "work-link");
  await symlink(realDirectory, directoryLink, "dir");
  assert.equal(await firstSymlinkInPath(root, join(directoryLink, "result.json")), directoryLink);
  assert.equal(await firstSymlinkInPath(root, realFile), null);
  assert.equal(await firstSymlinkInPath(root, join(root, "missing", "result.json")), null);
});
