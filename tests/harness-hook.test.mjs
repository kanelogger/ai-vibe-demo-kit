// harness-hook.test.mjs — Hook 适配层测试：只做透传，不产生第二套门禁。
// 运行: node --test tests/harness-hook.test.mjs

import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = join(repoRoot, "tests", "fixtures");

for (const [fixture, expected] of [
  ["valid-context", 0],
  ["invalid-context", 1],
  ["broken-json", 2],
]) {
  test(`hook 与直接执行检查器退出码一致（${fixture} -> ${expected}）`, () => {
    const root = join(fixturesRoot, fixture);
    const hook = spawnSync(process.execPath, [join(root, ".agents", "hooks", "check-harness.mjs"), "all"], {
      encoding: "utf8",
    });
    const direct = spawnSync(
      process.execPath,
      [join(root, "scripts", "harness-check.mjs"), "all", "--root", root],
      { encoding: "utf8" },
    );
    assert.equal(hook.status, expected, hook.stdout + hook.stderr);
    assert.equal(hook.status, direct.status);
    assert.equal(hook.stdout, direct.stdout, "Hook 必须完整透传检查器输出");
  });
}
