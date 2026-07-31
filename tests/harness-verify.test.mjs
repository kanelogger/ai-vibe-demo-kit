// harness-verify.test.mjs — 真实验证执行、报告绑定和 accepted 门禁测试。

import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(repoRoot, "tests", "fixtures", "stages", "implementation-ready");

async function projectCopy() {
  const root = await mkdtemp(join(tmpdir(), "harness-verify-"));
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

function run(root, script, args) {
  const result = spawnSync(process.execPath, [join(root, "scripts", script), ...args, "--root", root], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function configureExecutableProject(root, failingTest = false) {
  const scripts = {
    "fixture-static.mjs": "process.stdout.write('static ok\\n');\n",
    "fixture-test.mjs": failingTest
      ? "await import('node:fs/promises').then((fs) => fs.writeFile('.verification-temp', 'data')); process.exit(3);\n"
      : "await import('node:fs/promises').then((fs) => fs.writeFile('.verification-temp', 'data')); process.stdout.write('tests ok\\n');\n",
    "fixture-contract.mjs": "process.stdout.write('contract ok\\n');\n",
    "fixture-path.mjs": "process.stdout.write('user path ok\\n');\n",
    "fixture-cleanup.mjs": "await import('node:fs/promises').then((fs) => fs.rm('.verification-temp', { force: true })); process.stdout.write('cleanup ok\\n');\n",
  };
  for (const [name, source] of Object.entries(scripts)) await writeFile(join(root, "scripts", name), source, "utf8");

  const configPath = join(root, ".harness", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.commands.quick.static = ["node scripts/fixture-static.mjs"];
  config.commands.quick.test = ["node scripts/fixture-test.mjs"];
  config.commands.contracts = ["node scripts/fixture-contract.mjs"];
  config.criticalUserPaths = [
    { id: "main-flow", description: "Fixture critical path", verify: { mode: "command", command: "node scripts/fixture-path.mjs" } },
  ];
  config.recovery.testDataCleanup = [{ mode: "command", command: "node scripts/fixture-cleanup.mjs" }];
  config.verification.workspaceFingerprint = "git";
  config.verification.maxAgeHours = 24;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  git(root, ["init"]);
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "verification fixture"]);
}

async function writeAcceptance(root, report) {
  await writeFile(
    join(root, "workflow", "acceptance.md"),
    `---\nstatus: accepted\nconfirmedBy: user\nconfirmedAt: 2026-08-01T00:00:00Z\nconfirmationQuote: 验收通过\n---\n# Acceptance\n\n## 验证证据\n\n- Machine report：\`${report.reportPath}#${report.reportId}\`\n- Sprint Verification Report：${report.sprint}\n- 提交哈希：${report.workspace.head}\n`,
    "utf8",
  );
  const sprintPath = join(root, report.sprint);
  const sprint = await readFile(sprintPath, "utf8");
  await writeFile(sprintPath, sprint.replace(/^- Uncovered risks:.*$/m, "- Uncovered risks: none").replace(/^- 提交哈希:.*$/m, `- 提交哈希: ${report.workspace.head}`), "utf8");
}

test("full verification: 执行命令、关键路径和清理，生成通过报告并允许 accepted", async () => {
  const root = await projectCopy();
  try {
    await configureExecutableProject(root);
    const verify = run(root, "harness-verify.mjs", ["full", "--sprint", "tasks/sprint-01.md"]);
    assert.equal(verify.code, 0, verify.stdout + verify.stderr);
    assert.match(verify.stdout, /^PASS static /m);
    assert.match(verify.stdout, /^PASS user-path:main-flow /m);
    assert.match(verify.stdout, /^PASS cleanup /m);

    const report = JSON.parse(await readFile(join(root, ".harness", "verification-report.json"), "utf8"));
    assert.equal(report.status, "passed");
    assert.equal(report.profile, "full");
    assert.equal(report.checks.length, 3);
    assert.equal(report.criticalUserPaths[0].status, "passed");
    assert.equal(report.cleanup[0].status, "passed");
    await assert.rejects(readFile(join(root, ".verification-temp")), /ENOENT/);

    await writeAcceptance(root, report);
    const advance = run(root, "harness-stage.mjs", ["advance", "--to", "accepted", "--by", "user", "--quote", "验收通过"]);
    assert.equal(advance.code, 0, advance.stdout + advance.stderr);
    const state = JSON.parse(await readFile(join(root, "workflow-state.json"), "utf8"));
    assert.equal(state.stage, "accepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("full verification: 命令失败仍生成失败报告并执行清理", async () => {
  const root = await projectCopy();
  try {
    await configureExecutableProject(root, true);
    const verify = run(root, "harness-verify.mjs", ["full", "--sprint", "tasks/sprint-01.md"]);
    assert.equal(verify.code, 1, verify.stdout + verify.stderr);
    assert.match(verify.stdout, /^FAIL test /m);
    assert.match(verify.stdout, /^PASS cleanup /m);
    const report = JSON.parse(await readFile(join(root, ".harness", "verification-report.json"), "utf8"));
    assert.equal(report.status, "failed");
    assert.equal(report.checks.find((item) => item.kind === "test").exitCode, 3);
    await assert.rejects(readFile(join(root, ".verification-temp")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepted preflight: 验证后项目文件变化使报告失效且状态不变", async () => {
  const root = await projectCopy();
  try {
    await configureExecutableProject(root);
    const verify = run(root, "harness-verify.mjs", ["full", "--sprint", "tasks/sprint-01.md"]);
    assert.equal(verify.code, 0, verify.stdout + verify.stderr);
    const report = JSON.parse(await readFile(join(root, ".harness", "verification-report.json"), "utf8"));
    await writeAcceptance(root, report);
    await writeFile(join(root, "post-verification-change.js"), "export default true;\n", "utf8");

    const advance = run(root, "harness-stage.mjs", ["advance", "--to", "accepted", "--quote", "验收通过"]);
    assert.equal(advance.code, 1, advance.stdout);
    assert.match(advance.stdout, /^ERROR evidence\.verification-report-stale-workspace /m);
    const state = JSON.parse(await readFile(join(root, "workflow-state.json"), "utf8"));
    assert.equal(state.stage, "implementation-ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("full verification: 人工关键路径证据被读取并绑定哈希", async () => {
  const root = await projectCopy();
  try {
    await configureExecutableProject(root);
    const evidencePath = "manual-path-evidence.txt";
    await writeFile(join(root, evidencePath), "User completed the critical path successfully.\n", "utf8");
    const configPath = join(root, ".harness", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.criticalUserPaths = [
      {
        id: "manual-main-flow",
        description: "Manual fixture path",
        verify: { mode: "manual", instructions: "Run the fixture path", evidence: evidencePath },
      },
    ];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    git(root, ["add", "-A"]);
    git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "manual evidence fixture"]);

    const verify = run(root, "harness-verify.mjs", ["full", "--sprint", "tasks/sprint-01.md"]);
    assert.equal(verify.code, 0, verify.stdout + verify.stderr);
    const report = JSON.parse(await readFile(join(root, ".harness", "verification-report.json"), "utf8"));
    assert.equal(report.criticalUserPaths[0].id, "manual-main-flow");
    assert.equal(report.criticalUserPaths[0].status, "passed");
    assert.match(report.criticalUserPaths[0].evidenceSha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
