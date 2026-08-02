#!/usr/bin/env node
// cli.mjs — 统一 harness CLI（PRD 12.1，Phase A 状态根基 + Phase B 快路径子集）。
// 子命令：status / migrate-state / start / confirm / advance / suspend / resume / close /
//         rollback / suspend-and-start / close-and-start。
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
} from "./lib/ops.mjs";
import { allowedActions, itemStatePath } from "./lib/work-item.mjs";
import { WORK_ITEM_TYPES, OUTCOMES, RESULTS } from "./lib/lifecycle.mjs";

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
