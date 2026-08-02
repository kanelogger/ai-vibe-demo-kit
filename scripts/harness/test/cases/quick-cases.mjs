// quick-cases.mjs — Quick 绑定与 runnable 声明式 fixtures（PRD 9.5/16.1、FR-S01/S02、FR-E01）。
// digest 反查、stale 矩阵与 TTL 语义需要文件 mutation / 关系断言，见 quick.test.mjs 命令式 fixtures。

/** 最小合法 spec；quick 命令为确定性瞬时命令，fixtures 不依赖外部工具链。 */
const BASE_SPEC = {
  sliceId: "s1",
  primaryUncertainty: "Quick 是否足以背书 runnable",
  nonGoals: ["不实现 Human Review 门禁"],
  acceptanceCriteria: ["verify quick 实际执行声明命令并落报告"],
  writeScope: { exact: ["src/a.js"], subtrees: [], renames: [] },
  contractRefs: [],
  dependencyDigests: [],
  reviewPath: "src/a.js",
  verification: { quick: ['node -e "process.exit(0)"'] },
};

const PASS = 'node -e "process.exit(0)"';
// 首次失败、重跑通过的命令：marker 落在 writeScope 之外，不影响内容 digest。
const FLIP = 'node -e "const fs=require(\'fs\');const ok=fs.existsSync(\'.quick-ran\');fs.writeFileSync(\'.quick-ran\',\'1\');process.exit(ok?0:7)"';

const spec = (over = {}) => JSON.stringify({ ...BASE_SPEC, ...over });

const create = (over = {}) => ["slice", "create", "--spec", spec(over), "--json"];

const START = [
  ["migrate-state"],
  ["start", "--type", "feature", "--quote", "实现 Quick 绑定", "--json"],
];

const START_CAPTURED = [
  ["migrate-state"],
  { cmd: ["start", "--type", "feature", "--quote", "实现 Quick 绑定", "--json"], as: "W" },
];

const advance = (to) => ["slice", "advance", "--slice", "s1", "--to", to];

const verifyQuick = ["verify", "quick", "--slice", "s1"];

export const quickCases = [
  // ---- FR-S01/S02：无 Quick 或 Quick 失败被拒绝 ----
  {
    name: "无 Quick 报告：implementing → runnable 被拒绝并给出修复命令（FR-S01/S02）",
    seed: [...START, create(), advance("implementing")],
    run: advance("runnable"),
    expect: { code: 1, error: "E_QUICK_REQUIRED" },
  },
  {
    name: "Quick 未通过：以门禁拒绝退出、失败报告落 stateRef 可审计；重跑修复后通过（FR-S02、§9.5）",
    seed: [...START, create({ verification: { quick: [FLIP] } }), advance("implementing")],
    run: verifyQuick.concat(["--json"]),
    expect: {
      code: 1,
      error: "E_QUICK_FAILED",
      json: { sliceId: "s1", passed: false, checks: [{ command: FLIP, exitCode: 7, passed: false }] },
      stateFiles: {
        "work-items/{active}/slices/s1.json": {
          status: "implementing",
          quickReport: { revision: 1, passed: false, checks: [{ command: FLIP, exitCode: 7, passed: false }] },
        },
      },
    },
    fix: verifyQuick.concat(["--json"]),
    expectAfterFix: {
      code: 0,
      json: { sliceId: "s1", passed: true, checks: [{ command: FLIP, exitCode: 0, passed: true }] },
    },
  },
  {
    name: "非法 quick 条目在创建时拒绝：对象缺 command（NFR-03 稳定错误）",
    seed: [...START],
    run: create({ verification: { quick: [{ environmentSensitiveTtlSeconds: 5 }] } }),
    expect: { code: 1, error: "E_INVALID_QUICK_CHECK" },
  },
  {
    name: "非法 quick 条目在创建时拒绝：负 TTL（NFR-03 稳定错误）",
    seed: [...START],
    run: create({ verification: { quick: [{ command: PASS, environmentSensitiveTtlSeconds: -1 }] } }),
    expect: { code: 1, error: "E_INVALID_QUICK_CHECK" },
  },
  // ---- PRD 9.5/16.1：Quick 通过背书 runnable，报告绑定全部字段 ----
  {
    name: "Quick 通过后进入 runnable；报告绑定 workItem/slice/revision、命令与结果（§9.5、FR-S02）",
    seed: [...START_CAPTURED, create(), advance("implementing"), verifyQuick],
    run: advance("runnable").concat(["--json"]),
    expect: {
      code: 0,
      json: { sliceId: "s1", from: "implementing", to: "runnable", revision: 1 },
      stateFiles: {
        "work-items/{active}/slices/s1.json": {
          status: "runnable",
          quickReport: {
            version: 1,
            workItemId: "{W}",
            sliceId: "s1",
            revision: 1,
            passed: true,
            contractRefs: [],
            dependencyDigests: [],
            content: { files: [{ path: "src/a.js", sha256: null }] },
            config: { path: ".harness/config.json" },
            checks: [
              { command: PASS, exitCode: 0, passed: true, environmentSensitiveTtlSeconds: null, expiresAt: null },
            ],
          },
        },
      },
    },
  },
  {
    name: "Quick 只执行 Slice 声明的验证命令：不要求 Work Item Full（FR-E01、§16.1）",
    seed: [...START, create({ verification: { quick: [PASS, 'node -e "process.exit( 0 )"'] } }), advance("implementing")],
    run: verifyQuick.concat(["--json"]),
    expect: {
      code: 0,
      json: {
        passed: true,
        ran: [PASS, 'node -e "process.exit( 0 )"'],
        reused: [],
        checks: [{ command: PASS, passed: true }, { command: 'node -e "process.exit( 0 )"', passed: true }],
      },
    },
  },
  {
    name: "runnable 上重复 verify quick：内容未变化原样复用，不因时间失效（§16.4 内容驱动失效）",
    seed: [...START, create(), advance("implementing"), verifyQuick, advance("runnable")],
    run: verifyQuick.concat(["--json"]),
    expect: {
      code: 0,
      json: { passed: true, ran: [], reused: [PASS], checks: [{ command: PASS, passed: true }] },
    },
  },
  // ---- Quick 执行状态边界 ----
  {
    name: "ready 状态不能执行 verify quick（Quick 属于 implementing/runnable）",
    seed: [...START, create()],
    run: verifyQuick,
    expect: { code: 1, error: "E_QUICK_NOT_ALLOWED" },
  },
  {
    name: "human-reviewed 后 verify quick 只做纯 TTL 刷新：无漂移无过期时幂等复用（§16.4）",
    seed: [...START, create(), advance("implementing"), verifyQuick, advance("runnable"), advance("human-reviewed")],
    run: verifyQuick.concat(["--json"]),
    expect: { code: 0, json: { passed: true, ran: [], reused: [PASS] } },
  },
  {
    name: "verify quick 缺少 --slice 是稳定用法错误（NFR-03）",
    seed: [...START],
    run: ["verify", "quick"],
    expect: { code: 2, error: "E_USAGE" },
  },
];
