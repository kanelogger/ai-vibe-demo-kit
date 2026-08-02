// quick.test.mjs — Quick 绑定命令式 fixtures 与纯函数单测（PRD 9.5/16.4、FR-S02、NFR-12、场景 10）。
// 覆盖声明式 runner 到不了的层：文件 mutation 驱动的 stale 矩阵、digest 对实际内容反查、
// environment-sensitive TTL 只重跑过期项的关系断言、reuse 的时间无关性。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { makeRepo, runCli, sh, stateFileJson } from "./helpers.mjs";
import { normalizeQuickEntry, quickCurrency } from "../lib/quick.mjs";

const sha256 = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

const PASS = 'node -e "process.exit(0)"';

const BASE_SPEC = {
  sliceId: "s1",
  primaryUncertainty: "Quick 是否足以背书 runnable",
  nonGoals: ["不实现 Human Review 门禁"],
  acceptanceCriteria: ["verify quick 实际执行声明命令并落报告"],
  writeScope: { exact: ["src/a.js"], subtrees: [], renames: [] },
  contractRefs: [],
  dependencyDigests: [],
  reviewPath: "src/a.js",
  verification: { quick: [PASS] },
};

/** 临时仓库：migrate + start + create slice + advance implementing。 */
async function setupImplementing(root, over = {}) {
  await runCli(root, ["migrate-state"]);
  await runCli(root, ["start", "--type", "feature", "--quote", "实现 Quick 绑定", "--json"]);
  const spec = { ...BASE_SPEC, ...over };
  const created = await runCli(root, ["slice", "create", "--spec", JSON.stringify(spec), "--json"]);
  assert.equal(created.code, 0, created.stderr);
  const advanced = await runCli(root, ["slice", "advance", "--slice", "s1", "--to", "implementing"]);
  assert.equal(advanced.code, 0, advanced.stderr);
}

async function writeRepoFile(root, rel, content) {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

const quick = (root) => runCli(root, ["verify", "quick", "--slice", "s1", "--json"]);
const advance = (root, to) => runCli(root, ["slice", "advance", "--slice", "s1", "--to", to]);

async function quickReport(root) {
  const registry = await stateFileJson(root, "registry.json");
  const slice = await stateFileJson(root, `work-items/${registry.activeWorkItemId}/slices/s1.json`);
  return slice.quickReport;
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

// ---- NFR-12 / §9.5：绑定字段齐全且 digest 可对实际内容反查 ----

test("Quick 报告绑定 §9.5 全部字段；content/config/contract digest 可对实际内容反查（NFR-12）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "src/a.js", "export const a = 1;\n");
  await writeRepoFile(root, "SPECS/api.md", "# contract v1\n");
  const contractDigest = sha256("# contract v1\n");
  await setupImplementing(root, { contractRefs: [{ ref: "SPECS/api.md", digest: contractDigest }] });

  const r = await quick(root);
  assert.equal(r.code, 0, r.stderr);
  const report = await quickReport(root);

  // 身份绑定：workItem/slice/revision + base integration commit（targetRef tip）。
  const registry = await stateFileJson(root, "registry.json");
  assert.equal(report.workItemId, registry.activeWorkItemId);
  assert.equal(report.sliceId, "s1");
  assert.equal(report.revision, 1);
  assert.equal(report.baseIntegrationCommit, await sh("git", ["rev-parse", "refs/heads/main"], root));

  // content digest 反查：manifest 逐项等于实际文件内容的独立 SHA-256（原始字节 + Git 模式）。
  assert.deepEqual(report.content.files, [
    { path: "src/a.js", mode: "100644", sha256: sha256("export const a = 1;\n") },
  ]);
  const rebuilt = `sha256:${createHash("sha256")
    .update(
      report.content.files.map((file) => `${file.mode ?? "ABSENT"} ${file.sha256 ?? "-"}  ${file.path}\n`).join(""),
    )
    .digest("hex")}`;
  assert.equal(report.content.digest, rebuilt, "content digest 可由 manifest 重算");

  // config digest 反查：等于 .harness/config.json 实际内容的 SHA-256。
  const configText = await sh("git", ["show", "refs/heads/main:.harness/config.json"], root);
  assert.equal(report.config.digest, sha256(`${configText}\n`));

  // contract/dependency digests：声明 pin 与实际内容同时记录。
  assert.deepEqual(report.contractRefs, [{ ref: "SPECS/api.md", pinned: contractDigest, actual: contractDigest }]);
  assert.deepEqual(report.dependencyDigests, []);

  // 命令、结果与时间。
  assert.equal(report.checks.length, 1);
  assert.equal(report.checks[0].command, PASS);
  assert.equal(report.checks[0].exitCode, 0);
  assert.equal(report.checks[0].passed, true);
  assert.ok(Number.isFinite(Date.parse(report.executedAt)), "executedAt 是 ISO 时间");
});

// ---- 场景 10：Quick 后内容/config/contract/dependency 变化分别使 Quick stale ----

test("Quick 通过后内容变化：runnable 不可保持，重跑 Quick 后恢复（场景 10、FR-S02）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "src/a.js", "v1\n");
  await setupImplementing(root);
  assert.equal((await quick(root)).code, 0);
  assert.equal((await advance(root, "runnable")).code, 0);

  await writeRepoFile(root, "src/a.js", "v2\n");
  const blocked = await advance(root, "human-reviewed");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /E_QUICK_STALE/);
  assert.match(blocked.stderr, /内容已变化/);

  const rerun = await quick(root);
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.deepEqual(rerun.json.ran, [PASS], "drift 后全部重跑");
  assert.equal((await advance(root, "human-reviewed")).code, 0);
});

test("Quick 通过后 config 变化：Quick stale，推进被拒绝（场景 10）", async () => {
  const root = await makeRepo();
  await setupImplementing(root);
  assert.equal((await quick(root)).code, 0);

  await writeRepoFile(
    root,
    ".harness/config.json",
    `${JSON.stringify({ version: 1, git: { targetRef: "refs/heads/main", stateRef: "refs/heads/harness/state" }, extra: true }, null, 2)}\n`,
  );
  const blocked = await advance(root, "runnable");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /E_QUICK_STALE/);
  assert.match(blocked.stderr, /config 已变化/);
});

test("Quick 通过后 contract digest 变化：Quick stale；漂移契约 Quick 拒绝背书（场景 10、PRD 9.3）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "SPECS/api.md", "# contract v1\n");
  await setupImplementing(root, { contractRefs: [{ ref: "SPECS/api.md", digest: sha256("# contract v1\n") }] });
  assert.equal((await quick(root)).code, 0);

  await writeRepoFile(root, "SPECS/api.md", "# contract v2\n");
  const blocked = await advance(root, "runnable");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /E_QUICK_STALE/);
  assert.match(blocked.stderr, /contract digest 已变化/);

  const refused = await quick(root);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /E_CONTRACT_DRIFT/);
});

test("Quick 通过后 dependency digest 变化：Quick stale（场景 10）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "vendor/dep.txt", "dep v1\n");
  await setupImplementing(root, { dependencyDigests: [{ ref: "vendor/dep.txt", digest: sha256("dep v1\n") }] });
  assert.equal((await quick(root)).code, 0);

  await writeRepoFile(root, "vendor/dep.txt", "dep v2\n");
  const blocked = await advance(root, "runnable");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /E_QUICK_STALE/);
  assert.match(blocked.stderr, /dependency digest 已变化/);
});

test("Quick 通过后 base integration commit 前移：Quick stale（§9.5 base 绑定）", async () => {
  const root = await makeRepo();
  await setupImplementing(root);
  assert.equal((await quick(root)).code, 0);

  await writeRepoFile(root, "OTHER.md", "unrelated\n");
  await sh("git", ["add", "-A"], root);
  await sh("git", ["commit", "-m", "advance base"], root);
  const blocked = await advance(root, "runnable");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /E_QUICK_STALE/);
  assert.match(blocked.stderr, /base integration commit 已漂移/);
});

// ---- §16.4：内容驱动失效，非 TTL ----

test("内容未变化时重复 verify quick 原样复用：executedAt 不变，不因时间失效（§16.4）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "src/a.js", "v1\n");
  await setupImplementing(root);
  assert.equal((await quick(root)).code, 0);
  const first = await quickReport(root);

  await sleep(1100); // 本地确定性 check 无 TTL：时间经过不构成失效理由
  const rerun = await quick(root);
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.deepEqual(rerun.json.ran, []);
  assert.deepEqual(rerun.json.reused, [PASS]);

  const second = await quickReport(root);
  assert.equal(second.executedAt, first.executedAt, "复用报告：时间戳不变");
  assert.equal(second.checks[0].executedAt, first.checks[0].executedAt, "确定性 check 结果保留");
  assert.equal((await advance(root, "runnable")).code, 0);
});

test("environment-sensitive TTL 过期只重跑该 check，其余结果保留（§16.4）", async () => {
  const root = await makeRepo();
  const DET = "true";
  const ENV = "true # env-sensitive";
  await setupImplementing(root, {
    verification: { quick: [DET, { command: ENV, environmentSensitiveTtlSeconds: 1 }] },
  });
  assert.equal((await quick(root)).code, 0);
  assert.equal((await advance(root, "runnable")).code, 0, "TTL 未过期时可推进");
  const first = await quickReport(root);

  await sleep(1200);
  const blocked = await advance(root, "human-reviewed");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /E_QUICK_STALE/);
  assert.match(blocked.stderr, /TTL 过期/);

  const rerun = await quick(root);
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.deepEqual(rerun.json.ran, [ENV], "只重跑过期的 environment-sensitive check");
  assert.deepEqual(rerun.json.reused, [DET], "确定性 check 结果保留");

  const second = await quickReport(root);
  assert.equal(second.checks[0].executedAt, first.checks[0].executedAt, "确定性 check 未重跑");
  assert.notEqual(second.checks[1].executedAt, first.checks[1].executedAt, "过期 check 已重跑");
  assert.equal((await advance(root, "human-reviewed")).code, 0);
});

// ---- 下游状态：纯 TTL 刷新（§16.4）与 runnable 宣称（FR-S02）----

test("human-reviewed 状态 TTL 过期：允许纯 TTL 刷新，内容漂移仍拒绝（§16.4、PRD 9.6）", async () => {
  const root = await makeRepo();
  const ENV = "true # env-sensitive";
  await setupImplementing(root, {
    verification: { quick: ["true", { command: ENV, environmentSensitiveTtlSeconds: 1 }] },
  });
  assert.equal((await quick(root)).code, 0);
  assert.equal((await advance(root, "runnable")).code, 0);
  assert.equal((await advance(root, "human-reviewed")).code, 0);

  await sleep(1200);
  const blocked = await advance(root, "verified");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /TTL 过期/);

  // 下游状态允许 verify quick 的唯一情形：报告通过、digest 未漂移 → 只重跑过期 check。
  const refresh = await quick(root);
  assert.equal(refresh.code, 0, refresh.stderr);
  assert.deepEqual(refresh.json.ran, [ENV]);
  assert.equal((await advance(root, "verified")).code, 0);
});

test("human-reviewed 状态内容漂移：verify quick 拒绝，必须回 implementing（PRD 9.6）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "src/a.js", "v1\n");
  await setupImplementing(root);
  assert.equal((await quick(root)).code, 0);
  assert.equal((await advance(root, "runnable")).code, 0);
  assert.equal((await advance(root, "human-reviewed")).code, 0);

  await writeRepoFile(root, "src/a.js", "v2\n");
  const refused = await quick(root);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /E_QUICK_NOT_ALLOWED/);
});

test("runnable 不可保持：内容漂移后 slice list 派生 Quick stale，不再宣称 runnable（FR-S02）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "src/a.js", "v1\n");
  await setupImplementing(root);
  assert.equal((await quick(root)).code, 0);
  assert.equal((await advance(root, "runnable")).code, 0);

  await writeRepoFile(root, "src/a.js", "v2\n");
  const list = await runCli(root, ["slice", "list", "--json"]);
  assert.equal(list.code, 0, list.stderr);
  const entry = list.json.slices.find((slice) => slice.sliceId === "s1");
  assert.equal(entry.status, "runnable", "status 是持久化事实");
  assert.equal(entry.quick.state, "stale", "派生时效必须表明 stale");
  assert.ok(entry.quick.reasons.some((reason) => reason.includes("内容已变化")));
});

// ---- 报告绑定精确性（§9.5、NFR-12）----

test("验证命令修改 scope 内容：报告拒绝落账，重跑绑定稳定内容（§9.5 精确绑定）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "src/a.js", "v1\n");
  // 仅首次执行时修改 scope 内容（marker 在 scope 外）：第一次报告绑定不到最终内容，
  // 第二次命令无副作用，digest 稳定。
  const MUTATE =
    'node -e "const fs=require(\'fs\');if(!fs.existsSync(\'.mut-ran\')){fs.writeFileSync(\'.mut-ran\',\'1\');fs.appendFileSync(\'src/a.js\',\'x\')}"';
  await setupImplementing(root, { verification: { quick: [MUTATE] } });

  const refused = await quick(root);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /E_QUICK_STALE/);
  assert.match(refused.stderr, /验证命令修改了 scope 内容/);
  assert.equal(await quickReport(root), null, "drift 的报告不落账");

  const rerun = await quick(root);
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.equal((await advance(root, "runnable")).code, 0);
});

test("非法 UTF-8 字节变化：内容 digest 区分原始字节，不发生解码折叠（NFR-12）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "src/a.js", Buffer.from([0xff, 0xfe]));
  await setupImplementing(root);
  assert.equal((await quick(root)).code, 0);

  await writeRepoFile(root, "src/a.js", Buffer.from([0xfe, 0xff]));
  const blocked = await advance(root, "runnable");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /E_QUICK_STALE/);
});

test("曾解析为本地文件的契约被删除：视为漂移，拒绝重新背书（PRD 9.3 固定语义）", async () => {
  const root = await makeRepo();
  await writeRepoFile(root, "SPECS/api.md", "# contract v1\n");
  await setupImplementing(root, { contractRefs: [{ ref: "SPECS/api.md", digest: sha256("# contract v1\n") }] });
  assert.equal((await quick(root)).code, 0);

  await rm(join(root, "SPECS/api.md"));
  const refused = await quick(root);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /E_CONTRACT_DRIFT/);
  assert.match(refused.stderr, /已删除/);
});

test("config 落在 overlay 回退路径：摘要实际生效的配置文件（context 候选约定）", async () => {
  const root = await makeRepo();
  const config = await readFile(join(root, ".harness/config.json"), "utf8");
  await rm(join(root, ".harness/config.json"));
  await writeRepoFile(root, "overlay/.harness/config.json", config);
  await setupImplementing(root);

  const r = await quick(root);
  assert.equal(r.code, 0, r.stderr);
  const report = await quickReport(root);
  assert.equal(report.config.path, "overlay/.harness/config.json");
  assert.equal(report.config.digest, sha256(config));
});

test("失败的 Quick 之后 advance runnable 被拒绝并指向重跑（FR-S01/S02）", async () => {
  const root = await makeRepo();
  await setupImplementing(root, { verification: { quick: ['node -e "process.exit(7)"'] } });
  const failed = await quick(root);
  assert.equal(failed.code, 1);
  const blocked = await advance(root, "runnable");
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /E_QUICK_FAILED/);
});

// ---- 纯函数单测 ----

test("normalizeQuickEntry：字符串为确定性 check；对象声明 environment-sensitive TTL", () => {
  assert.deepEqual(normalizeQuickEntry("make test"), { command: "make test", environmentSensitiveTtlSeconds: null });
  assert.deepEqual(normalizeQuickEntry({ command: "curl health", environmentSensitiveTtlSeconds: 30 }), {
    command: "curl health",
    environmentSensitiveTtlSeconds: 30,
  });
  for (const bad of ["", 42, null, [], { environmentSensitiveTtlSeconds: 1 }, { command: "x", environmentSensitiveTtlSeconds: -1 }]) {
    assert.throws(() => normalizeQuickEntry(bad), (error) => error.code === "E_INVALID_QUICK_CHECK");
  }
});

test("quickCurrency：none/failed/stale/current 四态判定", () => {
  const at = "2026-08-02T00:00:00.000Z";
  const inputs = {
    baseIntegrationCommit: "c1",
    content: { digest: "sha256:d", files: [] },
    config: { path: ".harness/config.json", digest: "sha256:cfg" },
    contractRefs: [],
    dependencyDigests: [],
  };
  const sliceOf = (quickReport) => ({ sliceId: "s1", revision: 1, quickReport });
  const reportOf = (over = {}) => ({
    revision: 1,
    baseIntegrationCommit: "c1",
    content: { digest: "sha256:d", files: [] },
    config: { path: ".harness/config.json", digest: "sha256:cfg" },
    contractRefs: [],
    dependencyDigests: [],
    checks: [{ command: "true", expiresAt: null, passed: true }],
    passed: true,
    ...over,
  });

  assert.equal(quickCurrency(sliceOf(null), inputs, at).state, "none");
  assert.equal(quickCurrency(sliceOf(reportOf({ revision: 2 })), inputs, at).state, "none", "旧 revision 报告视同无");
  assert.equal(quickCurrency(sliceOf(reportOf({ passed: false })), inputs, at).state, "failed");
  assert.equal(quickCurrency(sliceOf(reportOf()), inputs, at).state, "current");
  assert.equal(
    quickCurrency(sliceOf(reportOf({ content: { digest: "sha256:other", files: [] } })), inputs, at).state,
    "stale",
  );
  assert.equal(
    quickCurrency(
      sliceOf(reportOf({ checks: [{ command: "env", expiresAt: "2026-08-01T23:59:59.000Z", passed: true }] })),
      inputs,
      at,
    ).state,
    "stale",
    "environment-sensitive check TTL 过期即 stale",
  );
});
