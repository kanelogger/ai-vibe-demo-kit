#!/usr/bin/env node
// cli.mjs — 统一 harness CLI（PRD 12.1，Phase A 状态根基 + Phase B 快路径 + Phase C Slice 模型/Quick 绑定）。
// 子命令：status / migrate-state / start / confirm / advance / suspend / resume / close /
//         rollback / suspend-and-start / close-and-start / slice {create,list,advance,update-scope} /
//         verify {quick}。
// 契约：--json 稳定输出；退出码 0 成功、1 领域门禁拒绝、2 用法/IO/Git 错误。

import { HarnessError, E, EXIT_OK } from "./lib/errors.mjs";
import { resolveContext } from "./lib/context.mjs";
import { loadRegistry } from "./lib/state-store.mjs";
import { migrateState } from "./lib/migrate-v1.mjs";
import {
  opStart,
  opAdvance,
  opConfirmBrief,
  opSuspend,
  opResume,
  opClose,
  opRollback,
  opSuspendAndStart,
  opCloseAndStart,
  opSliceCreate,
  opSliceAdvance,
  opSliceUpdateScope,
  opVerifyQuick,
} from "./lib/ops.mjs";
import { allowedActions, itemStatePath } from "./lib/work-item.mjs";
import { collectSlices, computeFrontier, depsPending } from "./lib/slice.mjs";
import { computeQuickInputs, quickCurrency } from "./lib/quick.mjs";
import { DEFAULT_CONFIG_PATH, currentBaseline } from "./lib/context.mjs";
import { WORK_ITEM_TYPES, OUTCOMES, RESULTS } from "./lib/lifecycle.mjs";
import { loadSkillRouting, resolveSkillRoute, SKILL_ROUTING_PATH } from "./lib/skill-routing.mjs";

const USAGE = `用法:
  harness status [--json] [--root <dir>]
  harness migrate-state [--json] [--root <dir>]
  harness start --type <${WORK_ITEM_TYPES.join("|")}> --quote "<任务原话>" [--json]
      [--axes "k=v,..."] [--allowlist "k=true|false,..."] [--triggers "k=true|false,..."]
      [--risk-level <low|medium|high>] [--contract-ref <既有承诺引用>]
  harness confirm --brief '<json>' --quote "<确认原话>" [--session <引用>] [--json]
  harness advance --to <stage> [--quote "<确认原话>"] [--json]
  harness suspend --reason "<原因>" [--json]
  harness resume <work-item-id> [--json]
  harness close --outcome <${OUTCOMES.join("|")}> [--result <${RESULTS.join("|")}>] [--quote "<原话>"] [--json]
  harness rollback <work-item-id> --quote "<回退原话>" [--only] [--json]
  harness slice create --spec '<json>' [--json]
  harness slice list [--json]
  harness slice advance --slice <slice-id> --to <status> [--json]
  harness slice update-scope --slice <slice-id> --spec '<json>' [--json]
  harness verify quick --slice <slice-id> [--json]
  harness skills route [--type <type> --stage <stage>] [--risk-level <low|medium|high|unclassified>]
      [--slice-status <status> | --slice <slice-id>] [--trigger <name,...>] [--json]
  harness suspend-and-start --type <type> --quote "<任务原话>" --reason "<暂停原因>" [--contract-ref <引用>] [--json]
  harness close-and-start --outcome <outcome> [--result <result>] --type <type> --quote "<任务原话>" [--reason "<原因>"] [--contract-ref <引用>] [--json]`;

const BOOL_FLAGS = new Set(["json", "only"]);

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (BOOL_FLAGS.has(key)) {
        options[key] = true;
      } else {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) throw E.USAGE(`--${key} 缺少值`, USAGE);
        options[key] = value;
        i += 1;
      }
    } else {
      options._.push(arg);
    }
  }
  return options;
}

function out(options, data, human) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(`${human}\n`);
  }
}

/** 只读 status（FR-H02）：不修改任何仓库事实。 */
async function cmdStatus(options) {
  const ctx = await resolveContext({ root: options.root });
  const { commit, registry, snapshot } = await loadRegistry(ctx.root, ctx.stateRef);
  if (commit === null) {
    out(
      options,
      { migrated: false, stateRef: ctx.stateRef, targetRef: ctx.targetRef },
      `项目尚未迁移到 v2 状态拓扑（${ctx.stateRef} 不存在）。\n下一条命令: harness migrate-state`,
    );
    return;
  }
  const readItem = (id) => {
    const text = snapshot.files.get(itemStatePath(id));
    return text === undefined ? null : JSON.parse(text);
  };
  const active = registry.activeWorkItemId ? readItem(registry.activeWorkItemId) : null;
  const suspended = registry.suspendedWorkItemIds.map((id) => {
    const item = readItem(id);
    const baselineCommit = item?.suspension?.baseline?.commit ?? item?.baseAcceptance?.commit ?? null;
    return {
      workItemId: id,
      type: item?.type ?? null,
      stage: item?.stage ?? null,
      suspendedAt: item?.suspension?.at ?? null,
      baselineDrift: baselineCommit !== null && baselineCommit !== registry.lastAcceptedBaseline?.commit,
    };
  });
  const actions = allowedActions(active);
  const data = {
    migrated: true,
    stateCommit: commit,
    sequence: registry.sequence,
    targetRef: registry.targetRef,
    stateRef: registry.stateRef,
    lastAcceptedBaseline: registry.lastAcceptedBaseline,
    active: active
      ? {
          workItemId: active.workItemId,
          type: active.type,
          typeProvisional: active.typeProvisional,
          stage: active.stage,
          risk: active.risk,
          baseAcceptance: active.baseAcceptance,
        }
      : null,
    idle: active === null,
    suspended,
    allowedActions: actions,
    nextCommand:
      active === null
        ? suspended.length > 0
          ? `harness resume ${suspended[0].workItemId}`
          : 'harness start --type <type> --quote "<任务原话>"'
        : `harness ${actions[0]}`,
  };
  if (options.json) {
    out(options, data, "");
    return;
  }
  const lines = [];
  lines.push(`state: ${ctx.stateRef} @ ${data.stateCommit.slice(0, 12)} (sequence ${data.sequence})`);
  lines.push(`baseline: ${registry.lastAcceptedBaseline?.commit?.slice(0, 12) ?? "无"} (${registry.targetRef})`);
  if (active) {
    lines.push(`active: ${active.workItemId} [${active.type}${active.typeProvisional ? " provisional" : ""}] stage=${active.stage}`);
  } else {
    lines.push("active: 无（idle）");
  }
  for (const s of suspended) {
    lines.push(`suspended: ${s.workItemId} [${s.type}] stage=${s.stage}${s.baselineDrift ? "（baseline 已漂移，resume 需重判证据）" : ""}`);
  }
  lines.push(`允许动作: ${actions.length > 0 ? actions.join(", ") : "无"}`);
  lines.push(`下一条命令: ${data.nextCommand}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** 解析 --spec JSON 参数；必须是非数组对象。 */
function parseSpec(raw, repair) {
  if (!raw) throw E.USAGE("缺少 --spec '<json>'", USAGE);
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch {
    throw E.USAGE("--spec 不是合法 JSON", repair);
  }
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    throw E.USAGE("--spec 必须是非数组 JSON 对象", repair);
  }
  return spec;
}

function hasAutomatedTests(config) {
  const commands = config.commands ?? {};
  return [commands.quick?.test, commands.full?.test].some(
    (entries) => Array.isArray(entries) && entries.some((entry) => typeof entry === "string" && entry.trim() !== ""),
  );
}

function routeTriggers(raw) {
  if (raw === undefined) return [];
  const triggers = String(raw)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (triggers.length === 0) throw E.USAGE("--trigger 必须包含至少一个名称", USAGE);
  return triggers;
}

async function routeContext(options, ctx) {
  const explicitType = options.type !== undefined;
  const explicitStage = options.stage !== undefined;
  if (explicitType !== explicitStage) throw E.USAGE("显式路由查询必须同时提供 --type 与 --stage", USAGE);
  const common = {
    hasUserInterface: ctx.config.project?.hasUserInterface === true,
    hasAutomatedTests: hasAutomatedTests(ctx.config),
    triggers: routeTriggers(options.trigger),
  };
  if (explicitType) {
    if (options.slice !== undefined) throw E.USAGE("显式路由查询使用 --slice-status，不接受 --slice", USAGE);
    return {
      ...common,
      workItemType: options.type,
      stage: options.stage,
      riskLevel: options["risk-level"] ?? "unclassified",
      sliceStatus: options["slice-status"] ?? null,
    };
  }
  if (options["risk-level"] !== undefined || options["slice-status"] !== undefined) {
    throw E.USAGE("Active Work Item 路由不允许覆盖 risk/stage；使用 --slice 读取真实 Slice 状态", USAGE);
  }
  const { registry, snapshot } = await loadRegistry(ctx.root, ctx.stateRef);
  if (registry === null) throw E.NOT_MIGRATED(ctx.stateRef);
  if (registry.activeWorkItemId === null) throw E.NO_ACTIVE();
  const rawItem = snapshot.files.get(itemStatePath(registry.activeWorkItemId));
  if (rawItem === undefined) throw E.ITEM_NOT_FOUND(registry.activeWorkItemId);
  const item = JSON.parse(rawItem);
  let sliceStatus = null;
  if (options.slice !== undefined) {
    const slice = collectSlices(snapshot.files, item.workItemId).get(options.slice);
    if (slice === undefined) throw E.SLICE_NOT_FOUND(options.slice);
    sliceStatus = slice.status;
  }
  return {
    ...common,
    workItemType: item.type,
    stage: item.stage,
    riskLevel: item.risk?.level ?? "unclassified",
    sliceStatus,
  };
}

async function cmdSkills(options, ctx) {
  const sub = options._[0];
  if (sub !== "route") throw E.USAGE(`未知 skills 子命令 ${sub ?? "(空)"}`, USAGE);
  const config = await loadSkillRouting(ctx.root);
  const result = {
    configPath: SKILL_ROUTING_PATH,
    ...resolveSkillRoute(config, await routeContext(options, ctx)),
  };
  if (options.json) {
    out(options, result, "");
    return;
  }
  const context = result.context;
  const lines = [
    `route: ${result.route.id}`,
    `context: ${context.workItemType}/${context.stage} risk=${context.riskLevel}` +
      `${context.sliceStatus === null ? "" : ` slice=${context.sliceStatus}`}`,
  ];
  for (const node of result.nodes) {
    const dependencies = node.needs.length === 0 ? "" : ` after=${node.needs.join(",")}`;
    lines.push(`${node.required ? "required" : "optional"}: ${node.id} → ${node.skillPath}${dependencies}`);
  }
  if (result.nodes.length === 0) lines.push("skills: 无（当前节点已完成）");
  if (result.policies.testing.directive) lines.push(`testing: ${result.policies.testing.directive}`);
  if (result.route.completion.humanGate) lines.push(`human gate: ${result.route.completion.humanGate}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** slice 子命令：create / list / advance / update-scope（PRD 9.1–9.3）。 */
async function cmdSlice(options, ctx) {
  const sub = options._[0];
  switch (sub) {
    case "create": {
      const { result } = await opSliceCreate(ctx.root, ctx, {
        spec: parseSpec(options.spec, "harness slice create --spec '<json>'"),
      });
      out(
        options,
        result,
        `已创建 Slice ${result.sliceId}（revision ${result.revision}，status=${result.status}）；frontier: ${result.frontier.join(", ") || "无"}`,
      );
      return;
    }
    case "list": {
      const data = await sliceListData(ctx);
      if (options.json) {
        out(options, data, "");
        return;
      }
      if (data.workItemId === null) {
        process.stdout.write("无 active Work Item，Slice 列表为空。\n");
        return;
      }
      const lines = [`work-item: ${data.workItemId}`, `frontier: ${data.frontier.join(", ") || "无"}`];
      for (const slice of data.slices) {
        const blocked = slice.blockedBy.length > 0 ? `（等待前驱: ${slice.blockedBy.join(", ")}）` : "";
        const stale = slice.quick?.state === "stale" ? `（Quick 已 stale: ${slice.quick.reasons.join("；")}）` : "";
        lines.push(
          `slice: ${slice.sliceId} r${slice.revision} status=${slice.status}${slice.frontier ? " [frontier]" : ""}${blocked}${stale}`,
        );
      }
      process.stdout.write(`${lines.join("\n")}\n`);
      return;
    }
    case "advance": {
      if (!options.slice || !options.to) throw E.USAGE("slice advance 缺少 --slice 或 --to", USAGE);
      const { result } = await opSliceAdvance(ctx.root, ctx, { sliceId: options.slice, to: options.to });
      out(options, result, `${result.sliceId}: ${result.from} → ${result.to}（revision ${result.revision}）`);
      return;
    }
    case "update-scope": {
      if (!options.slice) throw E.USAGE("slice update-scope 缺少 --slice", USAGE);
      const spec = parseSpec(options.spec, "harness slice update-scope --slice <slice-id> --spec '<json>'");
      if (spec.writeScope === undefined) throw E.USAGE("update-scope 的 --spec 必须包含 writeScope", USAGE);
      const { result } = await opSliceUpdateScope(ctx.root, ctx, {
        sliceId: options.slice,
        writeScope: spec.writeScope,
      });
      out(
        options,
        result,
        `${result.sliceId}: scope 已修订 r${result.fromRevision} → r${result.toRevision}，回 ready` +
          `（失效证据: ${result.invalidatedEvidence.join(", ") || "无"}）`,
      );
      return;
    }
    default:
      throw E.USAGE(`未知 slice 子命令 ${sub ?? "(空)"}`, USAGE);
  }
}

/**
 * 只读 slice 列表 + 派生 frontier 与 Quick 时效；无 active 项时返回空列表（同 status 的 idle 语义）。
 * Quick 时效实时重算（PRD 9.5）：内容/config/contract/dependency 漂移或 TTL 过期后，
 * status 虽是持久化的 runnable，quick.state 必须表明 stale——Slice 不能再宣称 runnable（FR-S02）。
 */
async function sliceListData(ctx) {
  const { registry, snapshot } = await loadRegistry(ctx.root, ctx.stateRef);
  if (registry === null) throw E.NOT_MIGRATED(ctx.stateRef);
  if (registry.activeWorkItemId === null) {
    return { workItemId: null, frontier: [], slices: [] };
  }
  const workItemId = registry.activeWorkItemId;
  const slices = collectSlices(snapshot.files, workItemId);
  const frontier = new Set(computeFrontier(slices));
  const baseline = await currentBaseline(ctx.root, ctx.targetRef);
  const configPath = ctx.configPath ?? DEFAULT_CONFIG_PATH;
  const now = new Date().toISOString();
  const list = [];
  for (const slice of [...slices.values()].sort((a, b) => a.sliceId.localeCompare(b.sliceId))) {
    let quick = null;
    if (slice.quickReport !== null && slice.status !== "invalidated") {
      const inputs = await computeQuickInputs(ctx.root, slice, baseline.commit, configPath);
      const currency = quickCurrency(slice, inputs, now);
      quick = { passed: slice.quickReport.passed, state: currency.state, reasons: currency.reasons };
    }
    list.push({
      sliceId: slice.sliceId,
      revision: slice.revision,
      status: slice.status,
      dependsOn: slice.dependsOn,
      frontier: frontier.has(slice.sliceId),
      blockedBy: depsPending(slice, slices),
      writeScope: slice.writeScope,
      quick,
    });
  }
  return { workItemId, frontier: [...frontier].sort(), slices: list };
}

/** verify 子命令：quick（Slice 级验证，PRD 16.1）。 */
async function cmdVerify(options, ctx) {
  const sub = options._[0];
  switch (sub) {
    case "quick": {
      if (!options.slice) throw E.USAGE("verify quick 缺少 --slice", USAGE);
      const { result } = await opVerifyQuick(ctx.root, ctx, { sliceId: options.slice });
      const digest = result.contentDigest.slice(0, 19);
      out(
        options,
        result,
        `${result.sliceId}: Quick ${result.passed ? "通过" : "未通过"}（revision ${result.revision}，content ${digest}…，` +
          `执行 ${result.ran.length} 项，复用 ${result.reused.length} 项）`,
      );
      // Quick 未通过：报告已落账可审计，以门禁拒绝退出（PRD 12.1 退出码契约）。
      if (!result.passed) {
        const failed = result.checks.filter((check) => !check.passed).map((check) => check.command);
        throw E.QUICK_FAILED(failed.join("、"));
      }
      return;
    }
    default:
      throw E.USAGE(`未知 verify 子命令 ${sub ?? "(空)"}`, USAGE);
  }
}

async function run(argv) {
  const [command, ...rest] = argv;
  const options = parseArgs(rest);
  const ctx = await resolveContext({ root: options.root });

  switch (command) {
    case "status":
      await cmdStatus(options);
      return;
    case "migrate-state": {
      const result = await migrateState(ctx.root, ctx);
      out(
        options,
        result,
        result.migrated
          ? `迁移完成：${result.mode}，state commit ${result.commit.slice(0, 12)}${result.backupRef ? `，rollback ref ${result.backupRef}` : ""}`
          : `无需迁移：${result.reason}`,
      );
      return;
    }
    case "skills":
      await cmdSkills(options, ctx);
      return;
    case "slice":
      await cmdSlice(options, ctx);
      return;
    case "verify":
      await cmdVerify(options, ctx);
      return;
    case "start": {
      if (!options.type) throw E.USAGE("start 缺少 --type", USAGE);
      const { result } = await opStart(ctx.root, ctx, {
        type: options.type,
        quote: options.quote,
        contractRef: options["contract-ref"] ?? null,
        risk: {
          axes: options.axes ?? null,
          allowlist: options.allowlist ?? null,
          triggers: options.triggers ?? null,
          override: options["risk-level"] ?? null,
        },
      });
      out(options, result, `已创建 active Work Item ${result.workItemId} [${result.type}] stage=${result.stage}`);
      return;
    }
    case "advance": {
      if (!options.to) throw E.USAGE("advance 缺少 --to", USAGE);
      const { result } = await opAdvance(ctx.root, ctx, { to: options.to, quote: options.quote });
      out(options, result, `${result.workItemId}: ${result.from} → ${result.to}`);
      return;
    }
    case "confirm": {
      if (!options.brief) throw E.USAGE("confirm 缺少 --brief", USAGE);
      const { result } = await opConfirmBrief(ctx.root, ctx, {
        brief: options.brief,
        quote: options.quote,
        sessionRef: options.session ?? null,
      });
      out(
        options,
        result,
        `${result.workItemId}: Brief 已确认，事实冻结并进入 ${result.stage}（人工停顿 ${result.humanStops.count}/${result.humanStops.budget}）`,
      );
      return;
    }
    case "suspend": {
      if (!options.reason) throw E.USAGE("suspend 缺少 --reason", USAGE);
      const { result } = await opSuspend(ctx.root, ctx, { reason: options.reason });
      out(options, result, `已暂停 ${result.workItemId}`);
      return;
    }
    case "resume": {
      const workItemId = options._[0];
      if (!workItemId) throw E.USAGE("resume 缺少 <work-item-id>", USAGE);
      const { result } = await opResume(ctx.root, ctx, { workItemId });
      out(
        options,
        result,
        `已恢复 ${result.workItemId}${result.baselineDrift ? "（baseline 已漂移，需按依赖重判证据有效性）" : ""}`,
      );
      return;
    }
    case "close": {
      if (!options.outcome) throw E.USAGE("close 缺少 --outcome", USAGE);
      const { result } = await opClose(ctx.root, ctx, {
        outcome: options.outcome,
        result: options.result ?? null,
        quote: options.quote,
      });
      out(options, result, `已关闭 ${result.workItemId}：outcome=${result.outcome} result=${result.result ?? "null"}`);
      return;
    }
    case "suspend-and-start": {
      if (!options.type || !options.reason) throw E.USAGE("suspend-and-start 缺少 --type 或 --reason", USAGE);
      const { result } = await opSuspendAndStart(ctx.root, ctx, {
        type: options.type,
        quote: options.quote,
        reason: options.reason,
        contractRef: options["contract-ref"] ?? null,
      });
      out(options, result, `已暂停 ${result.suspendedWorkItemId} 并创建 ${result.workItemId} [${result.type}]`);
      return;
    }
    case "close-and-start": {
      if (!options.outcome || !options.type) throw E.USAGE("close-and-start 缺少 --outcome 或 --type", USAGE);
      const { result } = await opCloseAndStart(ctx.root, ctx, {
        outcome: options.outcome,
        result: options.result ?? null,
        type: options.type,
        quote: options.quote,
        reason: options.reason,
        contractRef: options["contract-ref"] ?? null,
      });
      out(options, result, `已关闭 ${result.closedWorkItemId}（${result.outcome}）并创建 ${result.workItemId} [${result.type}]`);
      return;
    }
    case "rollback": {
      const targetId = options._[0];
      if (!targetId) throw E.USAGE("rollback 缺少 <work-item-id>", USAGE);
      const { result } = await opRollback(ctx.root, ctx, {
        targetId,
        only: options.only === true,
        quote: options.quote,
      });
      out(
        options,
        result,
        `已创建 Rollback ${result.workItemId}：级联 ${result.cascade.join(" → ")}${result.suspendedWorkItemId ? `（已暂停 ${result.suspendedWorkItemId}）` : ""}`,
      );
      return;
    }
    default:
      throw E.USAGE(`未知命令 ${command ?? "(空)"}`, USAGE);
  }
}

run(process.argv.slice(2)).then(
  () => process.exit(EXIT_OK),
  (error) => {
    if (error instanceof HarnessError) {
      process.stderr.write(`ERROR ${error.code}: ${error.message}\n`);
      if (error.repair) process.stderr.write(`REPAIR: ${error.repair}\n`);
      process.exit(error.exitCode);
    }
    process.stderr.write(`ERROR E_INTERNAL: ${error?.stack ?? error}\n`);
    process.exit(2);
  },
);
