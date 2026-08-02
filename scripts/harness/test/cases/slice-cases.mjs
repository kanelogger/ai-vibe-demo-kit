// slice-cases.mjs — Slice 模型声明式 fixtures（PRD 9.1–9.3、FR-S01/S06/S07、NFR-06 路径层）。
// spec、期望状态与错误码全部为手工字面量；{active} 由 fixture 运行器替换为 active workItemId。

/** 最小合法 spec；各用例在此之上覆盖差异字段。 */
const BASE_SPEC = {
  sliceId: "s1",
  primaryUncertainty: "六态推进是否足够表达进度",
  nonGoals: ["不实现 Quick 证据门禁"],
  acceptanceCriteria: ["slice 状态可在 stateRef 中逐态推进"],
  writeScope: { exact: ["src/a.js"], subtrees: [], renames: [] },
  contractRefs: [],
  dependencyDigests: [],
  reviewPath: "src/a.js",
  // Quick 实际执行（slice 02 起）：用确定性瞬时命令，fixtures 不依赖外部工具链。
  verification: { quick: ['node -e "process.exit(0)"'] },
};

const spec = (over = {}) => JSON.stringify({ ...BASE_SPEC, ...over });

const create = (over = {}) => ["slice", "create", "--spec", spec(over), "--json"];

const START = [
  ["migrate-state"],
  ["start", "--type", "feature", "--quote", "实现 Slice 模型", "--json"],
];

const START_CAPTURED = [
  ["migrate-state"],
  { cmd: ["start", "--type", "feature", "--quote", "实现 Slice 模型", "--json"], as: "W" },
];

const advance = (sliceId, to) => ["slice", "advance", "--slice", sliceId, "--to", to];

const verifyQuick = (sliceId) => ["verify", "quick", "--slice", sliceId];

/** 创建 Slice 并推进到指定状态之前；进入 runnable 前先跑 Quick（FR-S02，slice 02）。 */
const walkTo = (before, sliceId = "s1") => {
  const steps = [];
  const path = ["implementing", "runnable", "human-reviewed", "verified", "done"];
  for (const to of path.slice(0, path.indexOf(before))) {
    if (to === "runnable") steps.push(verifyQuick(sliceId));
    steps.push(advance(sliceId, to));
  }
  return steps;
};

export const sliceCases = [
  // ---- FR-S01：六态正常路径 + invalidated ----
  {
    name: "六态全路径逐态推进允许；最小字段齐全且状态存于 stateRef Work Item namespace（§9.2、FR-S01）",
    seed: [...START_CAPTURED, create(), ...walkTo("done")],
    run: advance("s1", "done").concat(["--json"]),
    expect: {
      code: 0,
      json: { sliceId: "s1", from: "verified", to: "done", revision: 1 },
      stateFiles: {
        "work-items/{active}/slices/s1.json": {
          version: 2,
          workItemId: "{W}",
          sliceId: "s1",
          revision: 1,
          status: "done",
          primaryUncertainty: "六态推进是否足够表达进度",
          nonGoals: ["不实现 Quick 证据门禁"],
          dependsOn: [],
          writeScope: { exact: ["src/a.js"], subtrees: [], renames: [] },
          contractRefs: [],
          dependencyDigests: [],
          acceptanceCriteria: ["slice 状态可在 stateRef 中逐态推进"],
          reviewPath: "src/a.js",
          verificationPlan: { quick: ['node -e "process.exit(0)"'] },
          quickReport: { passed: true, revision: 1 },
          reviewAttempts: [],
          currentHumanReview: null,
          feedback: [],
          commit: null,
          integratedAt: null,
          rollback: null,
        },
      },
    },
  },
  {
    name: "跳过 runnable：ready → runnable 被拒绝并返回稳定错误码（FR-S01）",
    seed: [...START, create()],
    run: advance("s1", "runnable"),
    expect: { code: 1, error: "E_ILLEGAL_SLICE_TRANSITION" },
  },
  {
    name: "跳过 Human Review：runnable → verified 被拒绝（FR-S01）",
    seed: [...START, create(), ...walkTo("human-reviewed")],
    run: advance("s1", "verified"),
    expect: { code: 1, error: "E_ILLEGAL_SLICE_TRANSITION" },
  },
  {
    name: "跳过 verified：human-reviewed → done 被拒绝（FR-S01）",
    seed: [...START, create(), ...walkTo("verified")],
    run: advance("s1", "done"),
    expect: { code: 1, error: "E_ILLEGAL_SLICE_TRANSITION" },
  },
  {
    name: "异常态 invalidated：任意下游状态可进入，旧状态保留在 history（PRD 9.1）",
    seed: [...START, create(), ...walkTo("runnable")],
    run: advance("s1", "invalidated").concat(["--json"]),
    expect: {
      code: 0,
      json: { sliceId: "s1", from: "implementing", to: "invalidated" },
      stateFiles: {
        "work-items/{active}/slices/s1.json": {
          status: "invalidated",
          history: [{ action: "create" }, { action: "advance", to: "implementing" }, { action: "advance", to: "invalidated" }],
        },
      },
    },
  },
  // ---- FR-S07：DAG 与 frontier ----
  {
    name: "dependsOn 前驱未 done：Slice 不进入 frontier，advance 被拒并说明前驱（FR-S07）",
    seed: [...START, create({ sliceId: "a" }), create({ sliceId: "b", dependsOn: ["a"], writeScope: { exact: ["src/b.js"], subtrees: [], renames: [] } })],
    run: advance("b", "implementing"),
    expect: { code: 1, error: "E_SLICE_BLOCKED" },
  },
  {
    name: "dependsOn 前驱未 done：frontier 只含无前驱的 Slice（FR-S07）",
    seed: [...START, create({ sliceId: "a" }), create({ sliceId: "b", dependsOn: ["a"], writeScope: { exact: ["src/b.js"], subtrees: [], renames: [] } })],
    run: ["slice", "list", "--json"],
    expect: {
      code: 0,
      json: {
        frontier: ["a"],
        slices: [
          { sliceId: "a", frontier: true, blockedBy: [] },
          { sliceId: "b", frontier: false, blockedBy: ["a"], dependsOn: ["a"] },
        ],
      },
    },
  },
  {
    name: "前驱 done 后 dependent 进入 frontier 并可推进（FR-S07）",
    seed: [
      ...START,
      create({ sliceId: "a" }),
      create({ sliceId: "b", dependsOn: ["a"], writeScope: { exact: ["src/b.js"], subtrees: [], renames: [] } }),
      ...walkTo("done", "a"),
      advance("a", "done"),
    ],
    run: ["slice", "list", "--json"],
    expect: {
      code: 0,
      json: {
        frontier: ["b"],
        slices: [
          { sliceId: "a", status: "done", frontier: false },
          { sliceId: "b", status: "ready", frontier: true, blockedBy: [] },
        ],
      },
    },
  },
  // ---- PRD 9.3：环依赖、未知引用、scope 重叠分别拒绝 ----
  {
    name: "环依赖：dependsOn 自引用被拒绝并说明环（PRD 9.3）",
    seed: [...START],
    run: create({ sliceId: "self", dependsOn: ["self"] }),
    expect: { code: 1, error: "E_SLICE_CYCLE" },
  },
  {
    name: "未知 dependsOn 引用被拒绝（PRD 9.3）",
    seed: [...START],
    run: create({ dependsOn: ["ghost"] }),
    expect: { code: 1, error: "E_UNKNOWN_SLICE_REF" },
  },
  {
    name: "Write Scope 重叠：subtree 相互包含被拒绝并说明原因（PRD 9.3）",
    seed: [...START, create({ sliceId: "a", writeScope: { exact: [], subtrees: ["src"], renames: [] } })],
    run: create({ sliceId: "b", writeScope: { exact: [], subtrees: ["src/lib"], renames: [] } }),
    expect: { code: 1, error: "E_SCOPE_OVERLAP" },
  },
  {
    name: "Write Scope 重叠：exact 落入对方 subtree 被拒绝（PRD 9.3）",
    seed: [...START, create({ sliceId: "a", writeScope: { exact: [], subtrees: ["src"], renames: [] } })],
    run: create({ sliceId: "b", writeScope: { exact: ["src/a.js"], subtrees: [], renames: [] } }),
    expect: { code: 1, error: "E_SCOPE_OVERLAP" },
  },
  {
    name: "done Slice 释放 scope：同一路径可被后续 Slice 串行复用（PRD 9.3/9.4）",
    seed: [
      ...START,
      create({ sliceId: "a", writeScope: { exact: [], subtrees: ["src"], renames: [] } }),
      ...walkTo("done", "a"),
      advance("a", "done"),
    ],
    run: create({ sliceId: "b", writeScope: { exact: [], subtrees: ["src/lib"], renames: [] } }),
    expect: { code: 0, json: { sliceId: "b", status: "ready" } },
  },
  // ---- NFR-06 路径层：glob、rename、新文件边界 ----
  {
    name: "glob 语法 scope 被拒绝：exact 只接受具体文件路径（NFR-06）",
    seed: [...START],
    run: create({ writeScope: { exact: ["src/**"], subtrees: [], renames: [] } }),
    expect: { code: 1, error: "E_INVALID_WRITE_SCOPE" },
  },
  {
    name: "traversal 路径被拒绝：scope 不允许 .. 段（NFR-06）",
    seed: [...START],
    run: create({ writeScope: { exact: ["../evil.js"], subtrees: [], renames: [] } }),
    expect: { code: 1, error: "E_INVALID_WRITE_SCOPE" },
  },
  {
    name: "rename 只有 source 被拒绝（PRD 9.3）",
    seed: [...START],
    run: create({ writeScope: { exact: [], subtrees: ["src"], renames: [{ from: "src/old.js" }] } }),
    expect: { code: 1, error: "E_INVALID_WRITE_SCOPE" },
  },
  {
    name: "rename 只有 destination 被拒绝（PRD 9.3）",
    seed: [...START],
    run: create({ writeScope: { exact: [], subtrees: ["src"], renames: [{ to: "src/new.js" }] } }),
    expect: { code: 1, error: "E_INVALID_WRITE_SCOPE" },
  },
  {
    name: "rename destination 落在非 owned subtree 被拒绝；改入 owned subtree 后通过（PRD 9.3、NFR-06）",
    seed: [...START],
    run: create({
      writeScope: { exact: [], subtrees: ["src"], renames: [{ from: "src/old.js", to: "docs/new.js" }] },
    }),
    expect: { code: 1, error: "E_INVALID_WRITE_SCOPE" },
    fix: create({
      writeScope: { exact: [], subtrees: ["src"], renames: [{ from: "src/old.js", to: "src/new.js" }] },
    }),
    expectAfterFix: { code: 0, json: { sliceId: "s1", status: "ready" } },
  },
  // ---- PRD 9.3：未固定共享契约 ----
  {
    name: "未固定共享契约被拒绝；携带 digest 后通过（PRD 9.3）",
    seed: [...START],
    run: create({ contractRefs: [{ ref: "SPECS/api.md" }] }),
    expect: { code: 1, error: "E_UNPINNED_CONTRACT" },
    fix: create({ contractRefs: [{ ref: "SPECS/api.md", digest: "sha256:abc123" }] }),
    expectAfterFix: {
      code: 0,
      stateFiles: {
        "work-items/{active}/slices/s1.json": {
          contractRefs: [{ ref: "SPECS/api.md", digest: "sha256:abc123" }],
        },
      },
    },
  },
  // ---- FR-S06：Write Scope revision 冻结 ----
  {
    name: "扩大 scope 创建新 revision：回 ready、旧 revision 证据标记失效（FR-S06）",
    seed: [...START, create(), ...walkTo("human-reviewed")],
    run: ["slice", "update-scope", "--slice", "s1", "--spec", JSON.stringify({
      writeScope: { exact: ["src/a.js"], subtrees: ["src"], renames: [] },
    }), "--json"],
    expect: {
      code: 0,
      json: { sliceId: "s1", fromRevision: 1, toRevision: 2, status: "ready" },
      stateFiles: {
        "work-items/{active}/slices/s1.json": {
          revision: 2,
          status: "ready",
          writeScope: { exact: ["src/a.js"], subtrees: ["src"], renames: [] },
          quickReport: null,
          currentHumanReview: null,
          history: [
            { action: "create", revision: 1 },
            { action: "advance", to: "implementing", revision: 1 },
            { action: "advance", to: "runnable", revision: 1 },
            { action: "scope-revised", fromRevision: 1, toRevision: 2, fromStatus: "runnable" },
          ],
        },
      },
    },
  },
  {
    name: "缩小 scope 同样创建新 revision；human-reviewed 进度失效回 ready（FR-S06）",
    seed: [...START, create({ writeScope: { exact: ["src/a.js"], subtrees: ["src"], renames: [] } }), ...walkTo("verified")],
    run: ["slice", "update-scope", "--slice", "s1", "--spec", JSON.stringify({
      writeScope: { exact: ["src/a.js"], subtrees: [], renames: [] },
    }), "--json"],
    expect: {
      code: 0,
      json: { sliceId: "s1", fromRevision: 1, toRevision: 2, status: "ready" },
      stateFiles: {
        "work-items/{active}/slices/s1.json": {
          revision: 2,
          status: "ready",
          writeScope: { exact: ["src/a.js"], subtrees: [], renames: [] },
          history: [
            { action: "create" },
            { action: "advance", to: "implementing" },
            { action: "advance", to: "runnable" },
            { action: "advance", to: "human-reviewed" },
            { action: "scope-revised", fromRevision: 1, toRevision: 2, fromStatus: "human-reviewed" },
          ],
        },
      },
    },
  },
  {
    name: "update-scope 重算冲突：扩到他人 live scope 被拒绝（FR-S06/PRD 9.3）",
    seed: [
      ...START,
      create({ sliceId: "a", writeScope: { exact: [], subtrees: ["src/a"], renames: [] } }),
      create({ sliceId: "b", writeScope: { exact: [], subtrees: ["src/b"], renames: [] } }),
    ],
    run: ["slice", "update-scope", "--slice", "b", "--spec", JSON.stringify({
      writeScope: { exact: [], subtrees: ["src"], renames: [] },
    })],
    expect: { code: 1, error: "E_SCOPE_OVERLAP" },
  },
  {
    name: "done Slice 的 scope 已冻结：update-scope 被拒绝（FR-S06）",
    seed: [...START, create(), ...walkTo("done"), advance("s1", "done")],
    run: ["slice", "update-scope", "--slice", "s1", "--spec", JSON.stringify({
      writeScope: { exact: ["src/b.js"], subtrees: [], renames: [] },
    })],
    expect: { code: 1, error: "E_ILLEGAL_SLICE_TRANSITION" },
  },
  // ---- 稳定错误契约（NFR-03）----
  {
    name: "未迁移状态下 slice list 返回稳定迁移错误而非内部错误（NFR-03）",
    run: ["slice", "list"],
    expect: { code: 1, error: "E_NOT_MIGRATED" },
  },
  {
    name: "--spec 为非对象 JSON 时返回用法错误与正确修复命令（NFR-03）",
    seed: [...START],
    run: ["slice", "update-scope", "--slice", "s1", "--spec", "null"],
    expect: { code: 2, error: "E_USAGE" },
  },
  {
    name: "writeScope 集合非数组时返回稳定错误而非内部错误（NFR-03）",
    seed: [...START],
    run: ["slice", "create", "--spec", JSON.stringify({
      ...BASE_SPEC,
      writeScope: { exact: {}, subtrees: [], renames: [] },
    })],
    expect: { code: 1, error: "E_INVALID_WRITE_SCOPE" },
  },
];
