#!/usr/bin/env node
// check-harness.mjs — Agent Hook 适配层。
// 只调用 scripts/harness-check.mjs 并透传输出与退出码；不包含第二套门禁逻辑。
//
// 用法: node .agents/hooks/check-harness.mjs [context|gates|evidence|all]
// 默认执行 all。不支持 Hooks 的 Agent 环境可直接运行 scripts/harness-check.mjs。

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] ?? "all";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const checker = resolve(projectRoot, "scripts/harness-check.mjs");

const child = spawn(process.execPath, [checker, mode, "--root", projectRoot], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.stderr.write(`harness hook terminated by signal ${signal}\n`);
    process.exit(2);
  }
  process.exit(code ?? 2);
});

child.on("error", (error) => {
  process.stderr.write(`harness hook failed to start: ${error.message}\n`);
  process.exit(2);
});
