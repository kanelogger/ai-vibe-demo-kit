// skills-sync.test.mjs — 外部 Skill 可追溯同步 v2 契约测试。
// 运行: node --test tests/skills-sync.test.mjs
// 只使用本地临时 Git 仓库，不访问公网（NFR-010）。

import { spawnSync } from "node:child_process";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeFs, runSkillsSync, SyncError } from "../overlay/scripts/skills-sync-core.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const syncScript = join(repoRoot, "overlay", "scripts", "skills-sync.mjs");

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

// 临时目录统一登记，套件结束时清理（testing 规则：不泄漏生成数据）。
const tempRoots = [];
after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});
function trackTemp(dir) {
  tempRoots.push(dir);
  return dir;
}

function runSync(root, extraArgs = []) {
  const result = spawnSync(process.execPath, [syncScript, "--root", root, ...extraArgs], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

// files 是 relpath → 内容字符串，或 { content, exec: true }（提交前 chmod 0o755）。
async function writeFiles(dir, files) {
  for (const [rel, value] of Object.entries(files)) {
    const target = join(dir, rel);
    await mkdir(dirname(target), { recursive: true });
    if (typeof value === "object" && value !== null) {
      await writeFile(target, value.content);
      if (value.exec) await chmod(target, 0o755);
    } else {
      await writeFile(target, value);
    }
  }
}

function commitAll(dir, message) {
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-q", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]);
}

// 构造一个本地 Git 仓库作为来源；允许按 SHA fetch（锁定 sync 修复依赖 pinned SHA）。
async function makeSourceRepo(files) {
  const dir = trackTemp(await mkdtemp(join(tmpdir(), "skills-source-")));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "uploadpack.allowReachableSHA1InWant", "true"]);
  await writeFiles(dir, files);
  return { dir, sha: commitAll(dir, "source") };
}

// 推进来源仓库 main（模拟上游 A→B）。
async function commitMore(repo, files) {
  await writeFiles(repo.dir, files);
  return commitAll(repo.dir, "upstream advance");
}

async function writeManifest(dir, manifest) {
  await mkdir(join(dir, ".agents"), { recursive: true });
  await writeFile(join(dir, ".agents", "skills.sources.json"), JSON.stringify(manifest, null, 2) + "\n");
}

async function makeProject(sources) {
  const dir = trackTemp(await mkdtemp(join(tmpdir(), "skills-project-")));
  await mkdir(join(dir, ".agents", "skills"), { recursive: true });
  await writeManifest(dir, { version: 2, skillsRoot: ".agents/skills", sources });
  return dir;
}

function sourceEntry(repo, over = {}) {
  return { id: "src", repo: repo.dir, path: ".", track: { kind: "branch", value: "main" }, ...over };
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

// 递归快照目录：relpath → { bytes, mtimeMs, mode }；目录不存在时返回空快照。
async function snapshotTree(absDir) {
  const entries = new Map();
  async function walk(dir) {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        const info = await stat(full);
        entries.set(relative(absDir, full), { bytes: await readFile(full), mtimeMs: info.mtimeMs, mode: info.mode & 0o777 });
      }
    }
  }
  await walk(absDir);
  return entries;
}

function assertSameFileSet(before, after, label) {
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `${label}: 文件集合发生变化`);
}

function assertSameBytes(before, after, label) {
  assertSameFileSet(before, after, label);
  for (const [rel, prev] of before) {
    assert.ok(after.get(rel).bytes.equals(prev.bytes), `${label}: ${rel} 字节发生变化`);
  }
}

// 字节 + mtime 全等（幂等/原子性断言：零写入即零 mtime 变化）。
function assertSameBytesAndMtimes(before, after, label) {
  assertSameBytes(before, after, label);
  for (const [rel, prev] of before) {
    assert.equal(after.get(rel).mtimeMs, prev.mtimeMs, `${label}: ${rel} mtime 发生变化`);
  }
}

test("sync: 首次 --update 同步三来源，v2 lock、gitignore、许可证与可执行位齐全", async () => {
  const single = await makeSourceRepo({
    "SKILL.md": skillDoc("web-design"),
    "LICENSE": "MIT license bytes\n",
    "references/ref.md": "ref\n",
    "scripts/run.sh": { content: "#!/bin/sh\necho hi\n", exec: true },
  });
  const nested = await makeSourceRepo({
    "skills/x/SKILL.md": skillDoc("x-skill"),
    "skills/x/extra.txt": "x extra\n",
    "LICENSE": "BSD license bytes\n",
  });
  const group = await makeSourceRepo({
    "skills/a/SKILL.md": skillDoc("a-skill"),
    "skills/b/SKILL.md": skillDoc("b-skill"),
    "skills/deprecated/c/SKILL.md": skillDoc("c-skill"),
    "LICENSE": "Apache license bytes\n",
  });
  const project = await makeProject([
    sourceEntry(single, { id: "web-design" }),
    sourceEntry(nested, { id: "baoyu-design", path: "skills/x" }),
    sourceEntry(group, { id: "mattpocock-skills", path: "skills", exclude: ["deprecated/"] }),
  ]);

  const result = runSync(project, ["--update"]);
  assert.equal(result.code, 0, result.stderr);

  // stdout：每个来源一条 UPDATED，最终 OK + NOTE new-session。
  for (const id of ["web-design", "baoyu-design", "mattpocock-skills"]) {
    assert.match(result.stdout, new RegExp(`^UPDATED ${id} `, "m"), `stdout 缺少 UPDATED ${id}`);
  }
  assert.match(result.stdout, /^OK skills-sync: 4 skills from 3 sources$/m);
  assert.match(result.stdout, /^NOTE new-session: /m);

  // v2 lock 形状。
  const lock = JSON.parse(await readFile(join(project, ".agents", "skills.lock.json"), "utf8"));
  assert.equal(lock.version, 2);
  assert.equal(lock.skillsRoot, ".agents/skills");
  assert.equal(lock.sources.length, 3);
  assert.deepEqual(
    lock.sources.map((source) => source.id),
    ["baoyu-design", "mattpocock-skills", "web-design"],
    "lock sources 应按 id 排序",
  );
  for (const source of lock.sources) {
    assert.match(source.resolved, SHA40, `${source.id}.resolved 必须是 40 位 SHA`);
    for (const skill of source.skills) {
      assert.match(skill.treeDigest, SHA256, `${skill.name}.treeDigest 必须是 SHA-256`);
      assert.equal(typeof skill.sourcePath, "string");
    }
    for (const file of source.licenseFiles) {
      assert.equal(file.path, "LICENSE");
      assert.match(file.sha256, SHA256);
      assert.equal(file.localPath, `.agents/skills/.sources/${source.id}/licenses/LICENSE`);
    }
  }
  const lockedNames = lock.sources.flatMap((source) => source.skills.map((skill) => skill.name)).sort();
  assert.deepEqual(lockedNames, ["a-skill", "b-skill", "web-design", "x-skill"]);

  // deprecated 技能被 exclude 排除：lock 与磁盘均不存在。
  assert.ok(!(await pathExists(join(project, ".agents", "skills", "c-skill"))));

  // 生成的 .gitignore：每个受管技能一条 /<name>/，外加 provenance 与 staging。
  const gitignore = await readFile(join(project, ".agents", "skills", ".gitignore"), "utf8");
  assert.ok(gitignore.startsWith("# Generated by scripts/skills-sync.mjs"), "gitignore 缺少脚本所有权 header");
  for (const name of lockedNames) assert.ok(gitignore.includes(`/${name}/\n`), `gitignore 缺少 /${name}/`);
  assert.ok(gitignore.includes("/.sources/\n"));
  assert.ok(gitignore.includes("/.staging/\n"));

  // 无 .git / staging 残留；许可证字节就位；可执行位保留（AC-013 / MAT-010 / DSC-008）。
  const skillsSnapshot = await snapshotTree(join(project, ".agents", "skills"));
  for (const rel of skillsSnapshot.keys()) {
    assert.ok(!rel.split("/").includes(".git"), `物化内容不得包含 .git: ${rel}`);
    assert.ok(!rel.startsWith(".staging"), `不得残留 staging: ${rel}`);
  }
  const licenseBytes = await readFile(join(project, ".agents", "skills", ".sources", "web-design", "licenses", "LICENSE"), "utf8");
  assert.equal(licenseBytes, "MIT license bytes\n");
  const runSh = await stat(join(project, ".agents", "skills", "web-design", "scripts", "run.sh"));
  assert.notEqual(runSh.mode & 0o111, 0, "可执行位必须保留");
});

test("sync: 锁定 sync 按 lock SHA 精确复现，不受上游 main 前移影响", async () => {
  const repo = await makeSourceRepo({ "SKILL.md": skillDoc("locked-skill"), "notes.md": "v1 notes\n", "LICENSE": "MIT\n" });
  const project = await makeProject([sourceEntry(repo)]);
  assert.equal(runSync(project, ["--update"]).code, 0);

  const skillDir = join(project, ".agents", "skills", "locked-skill");
  const recorded = await snapshotTree(skillDir);
  const lockBefore = await readFile(join(project, ".agents", "skills.lock.json"), "utf8");
  const oldSha = repo.sha;

  // 删除受管目录，并把上游 main 推进到新 commit。
  await rm(skillDir, { recursive: true, force: true });
  const newSha = await commitMore(repo, { "notes.md": "v2 notes\n" });
  assert.notEqual(newSha, oldSha);

  const result = runSync(project);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`^SYNCED locked-skill @ ${oldSha.slice(0, 12)}$`, "m"));
  assertSameBytes(recorded, await snapshotTree(skillDir), "locked sync 恢复内容");
  assert.equal((await readFile(join(skillDir, "notes.md"), "utf8")), "v1 notes\n", "必须恢复 lock 锁定的旧版本");
  assert.equal(await readFile(join(project, ".agents", "skills.lock.json"), "utf8"), lockBefore, "普通 sync 不得改写 lock");
});

test("sync: READY 状态离线幂等，连续两次普通 sync 零写入零 mtime 变化", async () => {
  const repo = await makeSourceRepo({ "SKILL.md": skillDoc("idle-skill"), "LICENSE": "MIT\n" });
  const project = await makeProject([sourceEntry(repo)]);
  assert.equal(runSync(project, ["--update"]).code, 0);

  // 删除来源仓库以证明 READY sync 不访问 Git。
  await rm(repo.dir, { recursive: true, force: true });

  const before = await snapshotTree(join(project, ".agents"));
  for (let round = 1; round <= 2; round += 1) {
    const result = runSync(project);
    assert.equal(result.code, 0, `第 ${round} 次 sync: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n");
    assert.ok(lines.length >= 2, "至少一条 KEPT 与一条 OK");
    for (const line of lines) {
      assert.match(line, /^(KEPT idle-skill @ [0-9a-f]{12}|OK skills-sync: 1 skills from 1 sources)$/, `READY sync 只能输出 KEPT/OK: ${line}`);
    }
  }
  assertSameBytesAndMtimes(before, await snapshotTree(join(project, ".agents")), "READY 幂等");
});

test("update: 上游 A→B 报告旧/新 SHA 与增改，二次 update 为 UNCHANGED 且零写入", async () => {
  const repo = await makeSourceRepo({
    "skills/one/SKILL.md": skillDoc("one"),
    "skills/one/notes.md": "notes v1\n",
    "LICENSE": "MIT\n",
  });
  const project = await makeProject([sourceEntry(repo, { path: "skills" })]);
  assert.equal(runSync(project, ["--update"]).code, 0);
  const oldSha = repo.sha;

  const newSha = await commitMore(repo, {
    "skills/one/notes.md": "notes v2\n",
    "skills/two/SKILL.md": skillDoc("two"),
  });

  const updated = runSync(project, ["--update"]);
  assert.equal(updated.code, 0, updated.stderr);
  const updatedLine = updated.stdout.split("\n").find((line) => line.startsWith("UPDATED src "));
  assert.ok(updatedLine, "stdout 缺少 UPDATED 行");
  assert.ok(updatedLine.includes(oldSha.slice(0, 12)), "UPDATED 必须包含旧 sha12");
  assert.ok(updatedLine.includes(newSha.slice(0, 12)), "UPDATED 必须包含新 sha12");
  assert.ok(updatedLine.includes("added: two"), "UPDATED 必须列出新增技能");
  assert.ok(updatedLine.includes("changed: one"), "UPDATED 必须列出摘要变化的技能");

  const lock = JSON.parse(await readFile(join(project, ".agents", "skills.lock.json"), "utf8"));
  assert.equal(lock.sources[0].resolved, newSha, "lock resolved 必须推进到新 SHA");

  // 二次 update：resolved 未变且本地 READY → UNCHANGED，零写入。
  const before = await snapshotTree(join(project, ".agents"));
  const again = runSync(project, ["--update"]);
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, new RegExp(`^UNCHANGED src @ ${newSha.slice(0, 12)}$`, "m"));
  assertSameBytesAndMtimes(before, await snapshotTree(join(project, ".agents")), "二次 update 幂等");
});

test("update: 跨来源 staging 失败保持原子性，全部目标状态逐字节不变", async () => {
  const repoA = await makeSourceRepo({ "skills/pa/SKILL.md": skillDoc("pa"), "LICENSE": "MIT\n" });
  const repoB = await makeSourceRepo({ "skills/pb/SKILL.md": skillDoc("pb"), "LICENSE": "MIT\n" });
  const project = await makeProject([
    sourceEntry(repoA, { id: "source-a", path: "skills" }),
    sourceEntry(repoB, { id: "source-b", path: "skills" }),
  ]);
  assert.equal(runSync(project, ["--update"]).code, 0);

  const before = await snapshotTree(join(project, ".agents"));

  // 上游 A 正常前移；上游 B 删除唯一 SKILL.md（发现/校验失败）。
  await commitMore(repoA, { "skills/pa/notes.md": "new notes\n" });
  git(repoB.dir, ["rm", "-q", "skills/pb/SKILL.md"]);
  commitAll(repoB.dir, "remove skill doc");

  const result = runSync(project, ["--update"]);
  assert.equal(result.code, 1, `staging 失败必须退出 1: ${result.stdout}`);
  assert.match(result.stderr, /ERROR skills-sync\.[a-z-]+: /);
  assert.ok(result.stderr.includes("source-b"), "错误必须标识失败来源");

  // 来源 A 的受管目录、lock、gitignore 与全部文件字节/mtime 与执行前一致（MAT-005/007）。
  assertSameBytesAndMtimes(before, await snapshotTree(join(project, ".agents")), "staging 失败零修改");
});

test("sync: commit 阶段中断（lock 已替换、物化未完成）由普通 sync 自愈", async () => {
  const repo = await makeSourceRepo({
    "skills/s1/SKILL.md": skillDoc("s1"),
    "skills/s2/SKILL.md": skillDoc("s2"),
    "skills/s2/data.txt": "original data\n",
    "LICENSE": "MIT\n",
  });
  const project = await makeProject([sourceEntry(repo, { path: "skills" })]);

  // 真实故障注入（AC-007）：commit 阶段第一次 rename 物化目录时进程“崩溃”。
  // commit 顺序为 lock 先落盘，因此中断后状态 = 新 lock + 受管目录缺失（drift）。
  const nodeFs = createNodeFs();
  let renames = 0;
  const crashingFs = {
    ...nodeFs,
    rename: async (...args) => {
      renames += 1;
      throw new Error("injected commit crash");
    },
  };
  await assert.rejects(() => runSkillsSync({ root: project, update: true, fs: crashingFs }), /injected commit crash/);
  assert.ok(renames >= 1, "必须确实在 commit 阶段中断");
  const brokenLock = JSON.parse(await readFile(join(project, ".agents", "skills.lock.json"), "utf8"));
  assert.equal(brokenLock.version, 2, "commit 中断前 lock 必须已落盘");
  assert.ok(!(await pathExists(join(project, ".agents", "skills", "s1"))), "中断后受管目录应缺失（drift）");

  // 普通 sync 检测到 drift 并按 lock 的 resolved SHA 自愈，不依赖事务日志或人工干预。
  const healed = runSync(project);
  assert.equal(healed.code, 0, healed.stderr);
  assert.match(healed.stdout, /^SYNCED s1 @ [0-9a-f]{12}$/m);
  assert.match(healed.stdout, /^SYNCED s2 @ [0-9a-f]{12}$/m);
  assert.equal(await readFile(join(project, ".agents", "skills", "s2", "data.txt"), "utf8"), "original data\n");
  assert.ok(!(await pathExists(join(project, ".agents", "skills", ".staging"))), "staging 残留必须被清理");

  // 自愈后进入 READY 幂等路径：再次 sync 全部 KEPT。
  const verify = runSync(project);
  assert.equal(verify.code, 0, verify.stderr);
  assert.doesNotMatch(verify.stdout, /SYNCED/);
  assert.match(verify.stdout, /^KEPT s1 @ /m);
  assert.match(verify.stdout, /^KEPT s2 @ /m);
});

test("sync: commit 中断残留与 drift 由普通 sync 自愈", async () => {
  const repo = await makeSourceRepo({
    "skills/s1/SKILL.md": skillDoc("s1"),
    "skills/s2/SKILL.md": skillDoc("s2"),
    "skills/s2/data.txt": "original data\n",
    "LICENSE": "MIT\n",
  });
  const project = await makeProject([sourceEntry(repo, { path: "skills" })]);
  assert.equal(runSync(project, ["--update"]).code, 0);
  const recorded = await snapshotTree(join(project, ".agents", "skills"));

  // 模拟 commit 中断残留 + 受管目录缺失 + 文件损坏。
  await mkdir(join(project, ".agents", "skills", ".staging", "junk"), { recursive: true });
  await writeFile(join(project, ".agents", "skills", ".staging", "junk", "file"), "residue\n");
  await rm(join(project, ".agents", "skills", "s1"), { recursive: true, force: true });
  await writeFile(join(project, ".agents", "skills", "s2", "data.txt"), "corrupted\n");

  const result = runSync(project);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^SYNCED s1 @ [0-9a-f]{12}$/m, "被删除的技能必须 SYNCED 修复");
  assert.match(result.stdout, /^SYNCED s2 @ [0-9a-f]{12}$/m, "被损坏的技能必须 SYNCED 修复");
  assert.ok(!(await pathExists(join(project, ".agents", "skills", ".staging"))), "staging 残留必须被清理");

  // 修复结果与 lock 一致：字节回到更新时记录的状态，再次 sync 全部 KEPT。
  assertSameBytes(recorded, await snapshotTree(join(project, ".agents", "skills")), "自愈后磁盘状态");
  const verify = runSync(project);
  assert.equal(verify.code, 0, verify.stderr);
  assert.doesNotMatch(verify.stdout, /SYNCED/, "修复后再次 sync 不得再有 SYNCED");
  assert.match(verify.stdout, /^KEPT s1 @ /m);
  assert.match(verify.stdout, /^KEPT s2 @ /m);
});

test("update: 拒绝覆盖非受管同名目录（skill-unmanaged-conflict）", async () => {
  const repo = await makeSourceRepo({ "SKILL.md": skillDoc("clash"), "LICENSE": "MIT\n" });
  const project = await makeProject([sourceEntry(repo)]);

  // 手工创建同名目录，prior lock 并不拥有它。
  const marker = join(project, ".agents", "skills", "clash", "marker.txt");
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, "hands off\n");

  const result = runSync(project, ["--update"]);
  assert.equal(result.code, 1, result.stdout);
  assert.match(result.stderr, /ERROR skills-sync\.skill-unmanaged-conflict: /);
  assert.equal(await readFile(marker, "utf8"), "hands off\n", "手工目录必须逐字节保持");
});

test("update: 跨来源重名技能整次失败并列出两个来源（skill-name-conflict）", async () => {
  const repoA = await makeSourceRepo({ "skills/from-a/SKILL.md": skillDoc("same-name"), "LICENSE": "MIT\n" });
  const repoB = await makeSourceRepo({ "skills/from-b/SKILL.md": skillDoc("same-name"), "LICENSE": "MIT\n" });
  const project = await makeProject([
    sourceEntry(repoA, { id: "alpha", path: "skills" }),
    sourceEntry(repoB, { id: "beta", path: "skills" }),
  ]);

  const result = runSync(project, ["--update"]);
  assert.equal(result.code, 1, result.stdout);
  assert.match(result.stderr, /ERROR skills-sync\.skill-name-conflict: /);
  assert.ok(result.stderr.includes('"alpha"'), "错误必须列出来源 alpha");
  assert.ok(result.stderr.includes('"beta"'), "错误必须列出来源 beta");

  // 零物化：无技能目录、无 lock。
  assert.ok(!(await pathExists(join(project, ".agents", "skills", "same-name"))));
  assert.ok(!(await pathExists(join(project, ".agents", "skills.lock.json"))));
});

test("update: only 先包含、exclude 最终否决；过滤结果为空整次失败", async () => {
  const repo = await makeSourceRepo({
    "skills/a/SKILL.md": skillDoc("a"),
    "skills/b/SKILL.md": skillDoc("b"),
    "LICENSE": "MIT\n",
  });
  const project = await makeProject([sourceEntry(repo, { path: "skills", only: ["a", "b"], exclude: ["b"] })]);

  const result = runSync(project, ["--update"]);
  assert.equal(result.code, 0, result.stderr);
  const lock = JSON.parse(await readFile(join(project, ".agents", "skills.lock.json"), "utf8"));
  assert.deepEqual(lock.sources[0].skills.map((skill) => skill.name), ["a"], "exclude 必须否决 only 命中的 b");
  assert.ok(await pathExists(join(project, ".agents", "skills", "a")));
  assert.ok(!(await pathExists(join(project, ".agents", "skills", "b"))));

  // 过滤后零技能：skill-none-selected。
  const empty = await makeProject([sourceEntry(repo, { path: "skills", only: ["no-such-skill"] })]);
  const failed = runSync(empty, ["--update"]);
  assert.equal(failed.code, 1, failed.stdout);
  assert.match(failed.stderr, /ERROR skills-sync\.skill-none-selected: /);
});

test("update: 选中 tree 含 symlink 或 submodule 一律拒绝（skill-tree-unsafe）", async () => {
  // 仓库 A：技能目录内含 symlink。
  const repoLink = await makeSourceRepo({ "SKILL.md": skillDoc("link-skill"), "LICENSE": "MIT\n" });
  await symlink("SKILL.md", join(repoLink.dir, "link.md"));
  commitAll(repoLink.dir, "add symlink");
  const projectLink = await makeProject([sourceEntry(repoLink)]);
  const resultLink = runSync(projectLink, ["--update"]);
  assert.equal(resultLink.code, 1, resultLink.stdout);
  assert.match(resultLink.stderr, /ERROR skills-sync\.skill-tree-unsafe: /);
  assert.ok(resultLink.stderr.includes("symlink"));
  assert.ok(!(await pathExists(join(projectLink, ".agents", "skills.lock.json"))), "失败后不得生成 lock");
  assert.deepEqual(await readdir(join(projectLink, ".agents", "skills")), [], "目标状态必须保持不变");

  // 仓库 B：技能目录内含 gitlink（submodule 条目）。
  const repoSub = await makeSourceRepo({ "SKILL.md": skillDoc("sub-skill"), "LICENSE": "MIT\n" });
  git(repoSub.dir, ["update-index", "--add", "--cacheinfo", `160000,${repoSub.sha},sub`]);
  git(repoSub.dir, ["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-q", "-m", "add gitlink"]);
  const projectSub = await makeProject([sourceEntry(repoSub)]);
  const resultSub = runSync(projectSub, ["--update"]);
  assert.equal(resultSub.code, 1, resultSub.stdout);
  assert.match(resultSub.stderr, /ERROR skills-sync\.skill-tree-unsafe: /);
  assert.ok(resultSub.stderr.includes("submodule"));
  assert.ok(!(await pathExists(join(projectSub, ".agents", "skills.lock.json"))), "失败后不得生成 lock");
  assert.deepEqual(await readdir(join(projectSub, ".agents", "skills")), [], "目标状态必须保持不变");
});

test("sync: 缺少 lock 时普通 sync 以 lock-missing 拒绝且不访问 Git，--update 才建锁", async () => {
  const repo = await makeSourceRepo({ "SKILL.md": skillDoc("first-skill"), "LICENSE": "MIT\n" });
  const project = await makeProject([sourceEntry(repo)]);

  // 来源仓库暂时移走：lock-missing 必须先于任何 Git 访问失败。
  const hidden = `${repo.dir}.gone`;
  await rename(repo.dir, hidden);
  const missing = runSync(project);
  assert.equal(missing.code, 2, missing.stdout);
  assert.match(missing.stderr, /ERROR skills-sync\.lock-missing: /);
  await rename(hidden, repo.dir);

  const updated = runSync(project, ["--update"]);
  assert.equal(updated.code, 0, updated.stderr);
  assert.ok(await pathExists(join(project, ".agents", "skills.lock.json")), "--update 必须创建首个 lock");
  assert.ok(await pathExists(join(project, ".agents", "skills", "first-skill", "SKILL.md")), "--update 必须物化技能");
});

test("sync: manifest 变更后普通 sync 以 lock-stale 拒绝，--update 重建并剪枝", async () => {
  const repo = await makeSourceRepo({
    "skills/keep/SKILL.md": skillDoc("keep"),
    "skills/drop/SKILL.md": skillDoc("drop"),
    "LICENSE": "MIT\n",
  });
  const project = await makeProject([sourceEntry(repo, { path: "skills" })]);
  assert.equal(runSync(project, ["--update"]).code, 0);
  assert.ok(await pathExists(join(project, ".agents", "skills", "drop")));

  // manifest 增加 exclude（spec 变化），lock 仍是旧值。
  await writeManifest(project, {
    version: 2,
    skillsRoot: ".agents/skills",
    sources: [sourceEntry(repo, { path: "skills", exclude: ["drop"] })],
  });

  const before = await snapshotTree(join(project, ".agents"));
  const stale = runSync(project);
  assert.equal(stale.code, 2, stale.stdout);
  assert.match(stale.stderr, /ERROR skills-sync\.lock-stale: /);
  assertSameBytesAndMtimes(before, await snapshotTree(join(project, ".agents")), "lock-stale 必须零修改");

  const updated = runSync(project, ["--update"]);
  assert.equal(updated.code, 0, updated.stderr);
  assert.match(updated.stdout, /^PRUNED drop$/m, "不再被 lock 引用的技能必须 PRUNED");
  assert.ok(!(await pathExists(join(project, ".agents", "skills", "drop"))), "被剪枝目录必须删除");
  assert.ok(await pathExists(join(project, ".agents", "skills", "keep")), "保留技能不受影响");
  const lock = JSON.parse(await readFile(join(project, ".agents", "skills.lock.json"), "utf8"));
  assert.deepEqual(lock.sources[0].skills.map((skill) => skill.name), ["keep"]);
  assert.deepEqual(lock.sources[0].exclude, ["drop"]);
});

test("sync: v1 manifest 与 v1 lock 均以 manifest-version-unsupported 拒绝", async () => {
  // v1 manifest（ref 字段、version 1）。
  const projectV1 = await mkdtemp(join(tmpdir(), "skills-project-"));
  await writeManifest(projectV1, {
    version: 1,
    skillsRoot: ".agents/skills",
    sources: [{ id: "old", repo: "/nonexistent", path: ".", ref: "main" }],
  });
  const resultV1 = runSync(projectV1, ["--update"]);
  assert.equal(resultV1.code, 2, resultV1.stdout);
  assert.match(resultV1.stderr, /ERROR skills-sync\.manifest-version-unsupported: /);

  // v2 manifest + v1 形状的 lock（扁平 managed 数组）。
  const projectLock = await makeProject([{ id: "src", repo: "/nonexistent", path: ".", track: { kind: "branch", value: "main" } }]);
  await writeFile(
    join(projectLock, ".agents", "skills.lock.json"),
    JSON.stringify({ version: 1, managed: [{ name: "old-skill", ref: "main" }] }, null, 2) + "\n",
  );
  const resultLock = runSync(projectLock);
  assert.equal(resultLock.code, 2, resultLock.stdout);
  assert.match(resultLock.stderr, /ERROR skills-sync\.manifest-version-unsupported: /);
});

test("sync: HTTP(S) URL 内嵌凭据在启动 Git 前拒绝且不回显秘密", async () => {
  const project = await makeProject([
    { id: "leaky", repo: "https://user:secret-token@example.com/x.git", path: ".", track: { kind: "branch", value: "main" } },
  ]);
  const result = runSync(project, ["--update"]);
  assert.equal(result.code, 2, result.stdout);
  assert.match(result.stderr, /ERROR skills-sync\.manifest-invalid: /);
  assert.ok(!result.stderr.includes("secret-token"), "stderr 不得泄露凭据");
  assert.ok(!result.stdout.includes("secret-token"), "stdout 不得泄露凭据");
});

test("update: SKILL.md 缺 frontmatter name 与非法技能名分别以稳定错误失败", async () => {
  const repoNoName = await makeSourceRepo({ "SKILL.md": "# no frontmatter here\n", "LICENSE": "MIT\n" });
  const projectNoName = await makeProject([sourceEntry(repoNoName)]);
  const resultNoName = runSync(projectNoName, ["--update"]);
  assert.equal(resultNoName.code, 1, resultNoName.stdout);
  assert.match(resultNoName.stderr, /ERROR skills-sync\.skill-frontmatter-invalid: /);

  const repoBadName = await makeSourceRepo({ "SKILL.md": skillDoc("bad name!"), "LICENSE": "MIT\n" });
  const projectBadName = await makeProject([sourceEntry(repoBadName)]);
  const resultBadName = runSync(projectBadName, ["--update"]);
  assert.equal(resultBadName.code, 1, resultBadName.stdout);
  assert.match(resultBadName.stderr, /ERROR skills-sync\.skill-name-invalid: /);
});

test("sync: --force 从同一锁定 SHA 重新物化，绝不升级 track", async () => {
  const repo = await makeSourceRepo({ "SKILL.md": skillDoc("force-skill"), "data.txt": "v1 data\n", "LICENSE": "MIT\n" });
  const project = await makeProject([sourceEntry(repo)]);
  assert.equal(runSync(project, ["--update"]).code, 0);
  const oldSha = repo.sha;
  const lockBefore = await readFile(join(project, ".agents", "skills.lock.json"), "utf8");

  // 上游前移；删除受管目录以观察 SYNCED 修复事件。
  const newSha = await commitMore(repo, { "data.txt": "v2 data\n" });
  await rm(join(project, ".agents", "skills", "force-skill"), { recursive: true, force: true });

  const result = runSync(project, ["--force"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`^SYNCED force-skill @ ${oldSha.slice(0, 12)}$`, "m"));
  assert.ok(!result.stdout.includes(newSha.slice(0, 12)), "--force 不得使用上游新 SHA");
  assert.equal(await readFile(join(project, ".agents", "skills", "force-skill", "data.txt"), "utf8"), "v1 data\n");
  assert.equal(await readFile(join(project, ".agents", "skills.lock.json"), "utf8"), lockBefore, "--force 不得改写 lock");
  const lock = JSON.parse(lockBefore);
  assert.equal(lock.sources[0].resolved, oldSha, "resolved 必须保持锁定 SHA");
});

test("core: runSkillsSync 结构化返回、故障注入与零 Git 的 UNCONFIGURED（AC-020）", async () => {
  // (a) 真实本地来源 + 默认 git：结构化结果，且不写终端。
  const repo = await makeSourceRepo({ "SKILL.md": skillDoc("core-skill"), "LICENSE": "MIT\n" });
  const project = await makeProject([sourceEntry(repo)]);
  const writes = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ...rest) => {
    writes.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk, ...rest) => {
    writes.push(String(chunk));
    return true;
  };
  let result;
  try {
    result = await runSkillsSync({ root: project, update: true });
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
  assert.equal(result.status, "UPDATED");
  assert.ok(result.events.some((event) => event.type === "UPDATED" && event.sourceId === "src"), "events 必须包含来源级 UPDATED");
  assert.equal(result.lock.version, 2);
  assert.match(result.lock.sources[0].resolved, SHA40);
  assert.deepEqual(writes, [], "core 不得写 stdout/stderr");
  assert.ok(await pathExists(join(project, ".agents", "skills", "core-skill", "SKILL.md")));

  // (b) 注入失败的 git adapter：SyncError 携带稳定 code 与退出码。
  const projectFail = await makeProject([sourceEntry(repo)]);
  await assert.rejects(
    runSkillsSync({
      root: projectFail,
      update: true,
      git: async () => {
        throw new Error("boom");
      },
    }),
    (error) => {
      assert.ok(error instanceof SyncError, "必须抛出 SyncError");
      assert.equal(error.code, "skills-sync.source-fetch-failed");
      assert.equal(error.exitCode, 1);
      return true;
    },
  );

  // (c) sources 为空的 manifest：UNCONFIGURED，且完全不调用 git adapter。
  const projectEmpty = await makeProject([]);
  let gitCalls = 0;
  const empty = await runSkillsSync({
    root: projectEmpty,
    git: async () => {
      gitCalls += 1;
      return Buffer.alloc(0);
    },
  });
  assert.equal(empty.status, "UNCONFIGURED");
  assert.equal(gitCalls, 0, "UNCONFIGURED 不得触发任何 Git 调用");
});
