// skills-sync.test.mjs — 外部 Skill 同步契约测试。
// 运行: node --test tests/skills-sync.test.mjs

import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const syncScript = join(repoRoot, "overlay", "scripts", "skills-sync.mjs");

function runSync(root, extraArgs = []) {
  const result = spawnSync(process.execPath, [syncScript, "--root", root, ...extraArgs], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

// 构造一个本地 Git 仓库作为来源；files 是 relpath → content。
async function makeSourceRepo(files) {
  const dir = await mkdtemp(join(tmpdir(), "skills-source-"));
  git(dir, ["init", "-q"]);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-q", "-m", "source"]);
  return { dir, sha: git(dir, ["rev-parse", "HEAD"]) };
}

async function makeProject(sources) {
  const dir = await mkdtemp(join(tmpdir(), "skills-project-"));
  await mkdir(join(dir, ".agents", "skills"), { recursive: true });
  await writeFile(
    join(dir, ".agents", "skills.sources.json"),
    JSON.stringify({ version: 1, skillsRoot: ".agents/skills", sources }, null, 2),
  );
  return dir;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function skillDoc(name) {
  return `---\nname: ${name}\ndescription: test skill ${name}\n---\n\n# ${name}\n`;
}

test("sync: 单技能仓库与技能组仓库同步，exclude 前缀生效，产物齐全", async () => {
  const single = await makeSourceRepo({ "SKILL.md": skillDoc("alpha-skill"), "references/ref.md": "ref" });
  const group = await makeSourceRepo({
    "skills/cat-one/beta/SKILL.md": skillDoc("beta-skill"),
    "skills/cat-two/gamma/SKILL.md": skillDoc("gamma-skill"),
  });
  const project = await makeProject([
    { repo: single.dir, path: ".", ref: single.sha },
    { repo: group.dir, path: "skills", ref: group.sha, exclude: ["cat-two/"] },
  ]);
  try {
    const result = runSync(project);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /^SYNCED alpha-skill @ /m);
    assert.match(result.stdout, /^SYNCED beta-skill @ /m);
    assert.doesNotMatch(result.stdout, /gamma/);

    // 目录内容完整复制（含子目录），被过滤的技能不出现。
    assert.ok(await pathExists(join(project, ".agents/skills/alpha-skill/SKILL.md")));
    assert.ok(await pathExists(join(project, ".agents/skills/alpha-skill/references/ref.md")));
    assert.ok(await pathExists(join(project, ".agents/skills/beta-skill/SKILL.md")));
    assert.ok(!(await pathExists(join(project, ".agents/skills/gamma-skill"))));

    // 锁文件记录解析后的 commit，可按来源身份比对。
    const lock = JSON.parse(await readFile(join(project, ".agents/skills.lock.json"), "utf8"));
    assert.equal(lock.managed.length, 2);
    const alpha = lock.managed.find((entry) => entry.name === "alpha-skill");
    const beta = lock.managed.find((entry) => entry.name === "beta-skill");
    assert.equal(alpha.resolved, single.sha);
    assert.equal(beta.resolved, group.sha);
    assert.deepEqual(beta.exclude, ["cat-two/"]);

    // 受管目录被生成的 .gitignore 排除。
    const gitignore = await readFile(join(project, ".agents/skills/.gitignore"), "utf8");
    assert.ok(gitignore.split(/\r?\n/).includes("/alpha-skill/"));
    assert.ok(gitignore.split(/\r?\n/).includes("/beta-skill/"));

    // 重复执行：全部 KEPT，不重新拉取。
    const rerun = runSync(project);
    assert.equal(rerun.code, 0, rerun.stderr);
    assert.match(rerun.stdout, /^KEPT alpha-skill @ /m);
    assert.match(rerun.stdout, /^KEPT beta-skill @ /m);
    assert.doesNotMatch(rerun.stdout, /^SYNCED /m);
  } finally {
    await rm(single.dir, { recursive: true, force: true });
    await rm(group.dir, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("sync: 拒绝覆盖非本脚本管理的既有 Skill 目录", async () => {
  const single = await makeSourceRepo({ "SKILL.md": skillDoc("alpha-skill") });
  const project = await makeProject([{ repo: single.dir, path: ".", ref: single.sha }]);
  try {
    const handmade = join(project, ".agents/skills/alpha-skill");
    await mkdir(handmade, { recursive: true });
    await writeFile(join(handmade, "SKILL.md"), "hand-installed, must survive");

    const result = runSync(project);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Refusing to overwrite/);
    assert.equal(await readFile(join(handmade, "SKILL.md"), "utf8"), "hand-installed, must survive");
  } finally {
    await rm(single.dir, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("sync: 清空来源后剪枝受管目录并移除锁文件与 gitignore", async () => {
  const single = await makeSourceRepo({ "SKILL.md": skillDoc("alpha-skill") });
  const project = await makeProject([{ repo: single.dir, path: ".", ref: single.sha }]);
  try {
    assert.equal(runSync(project).code, 0);
    await writeFile(
      join(project, ".agents", "skills.sources.json"),
      JSON.stringify({ version: 1, skillsRoot: ".agents/skills", sources: [] }),
    );
    const result = runSync(project);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /^PRUNED alpha-skill$/m);
    assert.ok(!(await pathExists(join(project, ".agents/skills/alpha-skill"))));
    assert.ok(!(await pathExists(join(project, ".agents/skills.lock.json"))));
    assert.ok(!(await pathExists(join(project, ".agents/skills/.gitignore"))));
  } finally {
    await rm(single.dir, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
