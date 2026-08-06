import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installOverlay, OverlayInstallError } from "./install-overlay-core.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const INSTALL_CLI = fileURLToPath(new URL("./install-overlay.mjs", import.meta.url));

async function write(root, path, content) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function makeTarget({ baseline = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "overlay-target-"));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "overlay-test"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "overlay@test.local"], { cwd: root });
  if (baseline) {
    await write(root, "README.md", "# Legacy app\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: root });
    await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });
  }
  await write(
    root,
    ".harness/config.json",
    `${JSON.stringify({
      version: 2,
      project: { name: "legacy-app", summary: "Friend's maintained application", hasUserInterface: false },
      contextIndex: { codeRoots: [] },
      risk: {
        highRiskPaths: [
          ".harness/config.json",
          ".codex/hooks.json",
          ".claude/settings.json",
          ".omp/extensions",
          "AGENTS.md",
          "CLAUDE.md",
          "HARNESS.md",
          "SPECS/architecture.md",
          "scripts/harness",
        ],
      },
      commands: {
        quick: { static: [], test: ["node -e \"process.exit(0)\""] },
        full: { static: [], test: ["node -e \"process.exit(0)\""] },
        contracts: [],
      },
      criticalUserPaths: [],
      verification: { commandTimeoutMs: 10_000 },
      recovery: { testDataCleanup: [], rollback: ["git revert <candidate-commit>"] },
    }, null, 2)}\n`,
  );
  await write(root, "AGENTS.md", "# Agent instructions\n\nUse `node scripts/harness/cli.mjs status` before work.\n");
  await write(root, "SPECS/architecture.md", "# Architecture\n\nThis documents the legacy application.\n");
  return root;
}

test("installs only the Codex runtime and keeps project facts untouched", async () => {
  const root = await makeTarget();
  const configBefore = await readFile(join(root, ".harness/config.json"), "utf8");
  const architectureBefore = await readFile(join(root, "SPECS/architecture.md"), "utf8");

  const result = await installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" });

  assert.equal(result.platform, "codex");
  assert.ok(result.created.includes("scripts/harness/cli.mjs"));
  assert.ok(result.created.includes("scripts/harness/lib/control.mjs"));
  assert.ok(result.created.includes("scripts/harness/adapters/pre-tool-use.mjs"));
  assert.ok(result.created.includes(".codex/hooks.json"));
  assert.equal(await exists(join(root, ".claude/settings.json")), false);
  assert.equal(await exists(join(root, ".omp/extensions/harness-context-guard.js")), false);
  assert.equal(await exists(join(root, "scripts/harness/test/control.test.mjs")), false);
  assert.equal(await readFile(join(root, ".harness/config.json"), "utf8"), configBefore);
  assert.equal(await readFile(join(root, "SPECS/architecture.md"), "utf8"), architectureBefore);
  assert.equal((await lstat(join(root, "scripts/harness/cli.mjs"))).mode & 0o111, 0o111);
  const { stdout } = await execFileAsync(
    process.execPath,
    [join(root, "scripts/harness/cli.mjs"), "status", "--json"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(JSON.parse(stdout).idle, true);

  const second = await installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" });
  assert.deepEqual(second.created, []);
  assert.ok(second.kept.includes("scripts/harness/cli.mjs"));
  assert.ok(second.kept.includes(".codex/hooks.json"));
});

test("platform selection installs only the requested adapter", async (t) => {
  const cases = [
    {
      platform: "claude",
      present: [".claude/settings.json", "CLAUDE.md", "scripts/harness/adapters/pre-tool-use.mjs"],
      absent: [".codex/hooks.json", ".omp/extensions/harness-context-guard.js"],
    },
    {
      platform: "omp",
      present: [".omp/extensions/harness-context-guard.js", "scripts/harness/adapters/hook-core.mjs"],
      absent: [".codex/hooks.json", ".claude/settings.json", "scripts/harness/adapters/pre-tool-use.mjs"],
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.platform, async () => {
      const root = await makeTarget();
      await installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: fixture.platform });
      for (const path of fixture.present) assert.equal(await exists(join(root, path)), true, path);
      for (const path of fixture.absent) assert.equal(await exists(join(root, path)), false, path);
    });
  }
});

test("a conflict rejects the entire plan before any file is copied", async () => {
  const root = await makeTarget();
  await write(root, ".codex/hooks.json", "{\"ownedBy\":\"target\"}\n");

  await assert.rejects(
    installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" }),
    (error) => error instanceof OverlayInstallError && error.code === "overlay-install.conflict",
  );

  assert.equal(await readFile(join(root, ".codex/hooks.json"), "utf8"), "{\"ownedBy\":\"target\"}\n");
  assert.equal(await exists(join(root, "scripts/harness/cli.mjs")), false);
  assert.equal(await exists(join(root, "HARNESS.md")), false);
});

test("a manually merged platform hook is preserved without blocking runtime installation", async () => {
  const root = await makeTarget();
  const existing = {
    description: "Target-owned hooks",
    hooks: {
      PreToolUse: [
        {
          matcher: "apply_patch|Edit|Write|CustomWrite",
          hooks: [
            {
              type: "command",
              command: "node \"$(git rev-parse --show-toplevel)/scripts/harness/adapters/pre-tool-use.mjs\"",
              timeout: 45,
            },
          ],
        },
      ],
    },
    targetSetting: true,
  };
  await write(root, ".codex/hooks.json", `${JSON.stringify(existing, null, 2)}\n`);

  const result = await installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" });

  assert.deepEqual(result.preserved, [".codex/hooks.json"]);
  assert.deepEqual(JSON.parse(await readFile(join(root, ".codex/hooks.json"), "utf8")), existing);
  assert.equal(await exists(join(root, "scripts/harness/cli.mjs")), true);
});

test("public CLI installs the selected platform and returns stable JSON", async () => {
  const root = await makeTarget();
  const { stdout } = await execFileAsync(
    process.execPath,
    [INSTALL_CLI, "--target", root, "--platform", "omp", "--json"],
    { cwd: SOURCE_ROOT, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  assert.equal(result.platform, "omp");
  assert.equal(result.target, await realpath(root));
  assert.ok(result.created.includes(".omp/extensions/harness-context-guard.js"));
  assert.equal(await exists(join(root, ".codex/hooks.json")), false);
});

test("missing or unsafe project facts fail before installation", async (t) => {
  await t.test("missing baseline commit", async () => {
    const root = await makeTarget({ baseline: false });
    await assert.rejects(
      installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" }),
      (error) => error instanceof OverlayInstallError
        && error.code === "overlay-install.prerequisite"
        && error.message.includes("baseline commit"),
    );
  });

  await t.test("missing architecture", async () => {
    const root = await makeTarget();
    await write(root, "SPECS/architecture.md", "");
    await assert.rejects(
      installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" }),
      (error) => error instanceof OverlayInstallError && error.code === "overlay-install.prerequisite",
    );
    assert.equal(await exists(join(root, "scripts/harness/cli.mjs")), false);
  });

  await t.test("no Full verification command", async () => {
    const root = await makeTarget();
    const config = JSON.parse(await readFile(join(root, ".harness/config.json"), "utf8"));
    config.commands.full.test = [];
    await write(root, ".harness/config.json", `${JSON.stringify(config, null, 2)}\n`);
    await assert.rejects(
      installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" }),
      (error) => error instanceof OverlayInstallError && error.code === "overlay-install.prerequisite",
    );
  });

  await t.test("selected adapter is not high risk", async () => {
    const root = await makeTarget();
    const config = JSON.parse(await readFile(join(root, ".harness/config.json"), "utf8"));
    config.risk.highRiskPaths = config.risk.highRiskPaths.filter((path) => path !== ".codex/hooks.json");
    await write(root, ".harness/config.json", `${JSON.stringify(config, null, 2)}\n`);
    await assert.rejects(
      installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" }),
      (error) => error instanceof OverlayInstallError
        && error.code === "overlay-install.prerequisite"
        && error.facts.missingHighRisk.includes(".codex/hooks.json"),
    );
  });

  await t.test("symlinked destination", async () => {
    const root = await makeTarget();
    const external = await mkdtemp(join(tmpdir(), "overlay-external-"));
    await mkdir(join(root, "scripts"), { recursive: true });
    await symlink(external, join(root, "scripts", "harness"));
    await assert.rejects(
      installOverlay({ sourceRoot: SOURCE_ROOT, targetRoot: root, platform: "codex" }),
      (error) => error instanceof OverlayInstallError && error.code === "overlay-install.conflict",
    );
  });
});
