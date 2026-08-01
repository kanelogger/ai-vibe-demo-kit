#!/usr/bin/env node
// skills-sync.mjs — 外部 Skill 可追溯同步 v2 的 CLI adapter（薄壳）。
// 全部同步逻辑在 skills-sync-core.mjs（协议无关，可被未来 MCP adapter 复用）；
// 本文件只负责参数解析、文本呈现与退出码。
//
//   node scripts/skills-sync.mjs [--root <dir>] [--force]           锁定 sync：严格恢复 lock 中的 resolved SHA（默认，安全）
//   node scripts/skills-sync.mjs --update [--root <dir>] [--force]  显式更新：联网解析 track（如 main 的当前 tip），生成新 lock 并物化
//
// 网络行为：READY 状态的普通 sync 零网络零写入；修复 drift 与 --update 才访问 Git。
// lock 行为：普通 sync 绝不改写 source spec / resolved；只有 --update 会替换 .agents/skills.lock.json。
// 退出码: 0 目标状态已达到；1 运行时/来源/冲突/校验失败；2 usage、manifest、lock 或内部契约错误。
// 会话要求：Skills 在 Agent 会话启动时加载；--update 成功后请开启新会话，本脚本不会也不应重启会话。
//
// 输出（Agent 可直接读取）:
//   KEPT   <name> @ <sha>          已锁定且磁盘一致，未访问网络
//   SYNCED <name> @ <sha>          新物化或修复的内容
//   PRUNED <name>                  不再被 lock 引用的受管目录（仅 --update）
//   UPDATED <id> <old> -> <new>    来源级更新报告（增删与摘要变化）
//   UNCHANGED <id> @ <sha>         来源 resolved 未变且本地 READY，零写入
//   WARNING <code> <message>       不阻断的问题（如缺少仓库级许可证）
//   OK skills-sync: ...            成功收尾

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSkillsSync, SyncError } from "./skills-sync-core.mjs";

const HELP = `Usage:
  node scripts/skills-sync.mjs [--root <dir>] [--force]   Locked sync: restore exactly the commits recorded in .agents/skills.lock.json (default; safe).
  node scripts/skills-sync.mjs --update [--root <dir>] [--force]
                                                          Update: resolve each track (e.g. main tip observed by this fetch), write a new lock and materialize.

Options:
  --root <dir>   Project root containing .agents/skills.sources.json (default: parent directory of this script).
  --force        Re-stage and re-materialize from the same resolved commits; never upgrades a track.
  --help         Show this help.

Network: a READY locked sync performs zero network and zero writes; only drift repair and --update contact Git.
Lock:    locked sync never rewrites source specs or resolved SHAs; only --update replaces .agents/skills.lock.json.
Exit:    0 target state reached; 1 runtime/source/conflict/validation failure; 2 usage, manifest, lock or internal contract error.
Session: skills load when an Agent session starts; after a successful --update, start a NEW Agent session to load them.
Errors:  ERROR skills-sync.<stable-id>: <source/skill, cause, single repair action>.`;

function sha12(value) {
  return typeof value === "string" && value.length >= 12 ? value.slice(0, 12) : String(value);
}

function renderEvent(event) {
  switch (event.type) {
    case "KEPT":
      return `KEPT ${event.name} @ ${sha12(event.resolved)}`;
    case "SYNCED":
      return `SYNCED ${event.name} @ ${sha12(event.resolved)}`;
    case "PRUNED":
      return `PRUNED ${event.name}`;
    case "UPDATED": {
      const from = event.from ? sha12(event.from) : "(new source)";
      const details = [];
      if (event.added.length > 0) details.push(`added: ${event.added.join(", ")}`);
      if (event.removed.length > 0) details.push(`removed: ${event.removed.join(", ")}`);
      if (event.changed.length > 0) details.push(`changed: ${event.changed.join(", ")}`);
      const suffix = details.length > 0 ? ` (${details.join("; ")})` : "";
      return `UPDATED ${event.sourceId} ${from} -> ${sha12(event.to)}${suffix}`;
    }
    case "UNCHANGED":
      return `UNCHANGED ${event.sourceId} @ ${sha12(event.resolved)}`;
    case "WARNING":
      return `WARNING ${event.code}: ${event.message}`;
    case "NOTE":
      return `NOTE ${event.code}: ${event.message}`;
    case "OK":
      return `OK skills-sync: ${event.skills} skills from ${event.sources} sources`;
    default:
      return null;
  }
}

function parseArgs(argv) {
  const args = [...argv];
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let update = false;
  let force = false;
  const rootIndex = args.indexOf("--root");
  if (rootIndex !== -1) {
    const value = args[rootIndex + 1];
    if (!value) throw new SyncError("skills-sync.usage", "--root requires a directory argument; fix: pass --root <dir>.", 2);
    root = resolve(value);
    args.splice(rootIndex, 2);
  }
  const updateIndex = args.indexOf("--update");
  if (updateIndex !== -1) {
    update = true;
    args.splice(updateIndex, 1);
  }
  const forceIndex = args.indexOf("--force");
  if (forceIndex !== -1) {
    force = true;
    args.splice(forceIndex, 1);
  }
  if (args.length > 0) {
    if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") return { help: true };
    throw new SyncError("skills-sync.usage", `unknown argument "${args[0]}"; fix: run with --help to see usage.`, 2);
  }
  return { root, update, force };
}

async function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    const result = await runSkillsSync({ root: options.root, update: options.update, force: options.force });
    for (const event of result.events) {
      const line = renderEvent(event);
      if (line !== null) process.stdout.write(`${line}\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof SyncError) {
      process.stderr.write(`ERROR ${error.code}: ${error.message}\n`);
      return error.exitCode;
    }
    process.stderr.write(`ERROR skills-sync.internal: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exit(code);
});
