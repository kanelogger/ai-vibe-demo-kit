// overlay-copy.test.mjs — Overlay 复制演练：既有项目文件保护、AGENTS 冲突合并、接入后检查通过。
// 运行: node --test tests/overlay-copy.test.mjs

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const overlayRoot = join(repoRoot, "overlay");
const fixtureRoot = join(repoRoot, "tests", "fixtures", "existing-project");

async function treeFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(relative(root, full));
    }
  }
  await walk(root);
  return files.sort();
}

async function hashFiles(root, files) {
  const result = new Map();
  for (const rel of files) {
    result.set(rel, createHash("sha256").update(await readFile(join(root, rel))).digest("hex"));
  }
  return result;
}

const OVERLAY_TOP_LEVELS = [
  "HARNESS.md",
  "workflow-state.json",
  ".harness",
  ".agents",
  "workflow",
  "SPECS",
  "tasks",
  "memory",
  "rules",
  "scripts",
];

test("复制 Overlay 后既有应用文件保持不变，AGENTS 冲突可见", async () => {
  const root = await mkdtemp(join(tmpdir(), "overlay-drill-"));
  try {
    await cp(fixtureRoot, root, { recursive: true });
    const originalFiles = await treeFiles(root);
    const originalHashes = await hashFiles(root, originalFiles);

    // 复制 Overlay（等价于 cp -R overlay/. <project>/）。
    await cp(overlayRoot, root, { recursive: true });

    // 应用源码、包配置、README 未被改写。
    for (const rel of ["package.json", "src/index.js", "src/util.js", "tests/greet.test.js", "README.md"]) {
      const after = createHash("sha256").update(await readFile(join(root, rel))).digest("hex");
      assert.equal(after, originalHashes.get(rel), `${rel} 被 Overlay 复制改写`);
    }

    // 不生成 frontend/backend 等业务目录。
    const topLevels = await readdir(root);
    assert.ok(!topLevels.includes("frontend") && !topLevels.includes("backend"));

    // AGENTS.md 冲突在文件差异中清晰可见（复制会覆盖，需要人工合并）。
    const agentsAfter = await readFile(join(root, "AGENTS.md"), "utf8");
    const agentsChanged = createHash("sha256").update(agentsAfter).digest("hex") !== originalHashes.get("AGENTS.md");
    assert.ok(agentsChanged, "AGENTS.md 冲突必须可见");
    assert.ok(!agentsAfter.includes("禁止引入第三方依赖"), "未合并前项目原有约束被覆盖，必须通过 git diff 人工恢复");

    // 首次适配：人工合并 AGENTS、填写 config 和 ARCHITECTURE。
    const originalAgents = await readFile(join(fixtureRoot, "AGENTS.md"), "utf8");
    await writeFile(join(root, "AGENTS.md"), `${originalAgents}\n---\n\n${agentsAfter}`, "utf8");

    const configPath = join(root, ".harness", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.project.name = "existing-project";
    config.project.summary = "演练用既有项目";
    config.commands.quick.static = ["node --check src/index.js"];
    config.commands.quick.test = ["node --test tests/"];
    config.recovery.testDataCleanup = ["无需清理：测试不产生外部数据"];
    config.recovery.rollback = ["git revert <commit>"];
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    // 演练项目是纯 CLI、无对外契约：删除契约模板并留空 contracts（显式缺口路径）。
    await rm(join(root, "SPECS", "API.md"));
    await rm(join(root, "SPECS", "DATABASE.md"));

    const archPath = join(root, "SPECS", "ARCHITECTURE.md");
    await writeFile(
      archPath,
      (await readFile(archPath, "utf8"))
        .replace("- Product / service:", "- Product / service: Greeting CLI demo")
        .replace("- Primary users:", "- Primary users: Harness maintainers")
        .replace("- Primary outcome:", "- Primary outcome: Overlay copy drill passes")
        .replace("| 运行时 |  |  |", "| 运行时 | Node.js 20+ | package.json |")
        .replace("| 包管理 / 构建工具 |  |  |", "| 包管理 / 构建工具 | npm | package.json |")
        .replace("| 应用框架 |  |  |", "| 应用框架 | 无（纯 Node CLI） | src/index.js |")
        .replace("| 数据 / 外部系统 |  |  |", "| 数据 / 外部系统 | 无 | 无外部依赖 |"),
      "utf8",
    );

    // 适配完成后 harness-check all 通过。
    const check = spawnSync(process.execPath, [join(root, "scripts", "harness-check.mjs"), "all"], { encoding: "utf8" });
    assert.equal(check.status, 0, check.stdout + check.stderr);

    // 删除 Overlay 文件后可恢复到原始 fixture 状态。
    for (const entry of OVERLAY_TOP_LEVELS) {
      await rm(join(root, entry), { recursive: true, force: true });
    }
    await writeFile(join(root, "AGENTS.md"), originalAgents, "utf8");
    const restoredFiles = await treeFiles(root);
    assert.deepEqual(restoredFiles, originalFiles);
    const restoredHashes = await hashFiles(root, restoredFiles);
    for (const rel of originalFiles) {
      assert.equal(restoredHashes.get(rel), originalHashes.get(rel), `${rel} 未恢复`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
