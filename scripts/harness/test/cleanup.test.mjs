import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testRoot = dirname(fileURLToPath(import.meta.url));

test("test processes remove registered temporary directories", async () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", join(testRoot, "fixtures", "temp-directory.test.mjs")], { cwd: testRoot, encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  const match = result.stdout.match(/TEMP_ROOT=([^\s]+)/);
  assert.ok(match, result.stdout);
  await assert.rejects(lstat(match[1]), (error) => error.code === "ENOENT");
});
