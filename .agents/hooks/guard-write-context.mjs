#!/usr/bin/env node
// guard-write-context.mjs — platform-neutral write-event adapter for the unified Context Guard CLI.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.includes("--root")) {
  process.stderr.write("ERROR hook.usage: guard-write-context does not accept --root; configure HARNESS_PROJECT_ROOT in the platform adapter.\n");
  process.exitCode = 2;
} else {
  const installedRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const projectRoot = resolve(process.env.HARNESS_PROJECT_ROOT ?? installedRoot);
  const cli = resolve(installedRoot, "scripts/harness/cli.mjs");
  const child = spawn(process.execPath, [cli, "context", "guard", ...args, "--root", projectRoot], {
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.stderr.write(`context guard hook terminated by signal ${signal}\n`);
      process.exitCode = 2;
      return;
    }
    process.exitCode = code ?? 2;
  });

  child.on("error", (error) => {
    process.stderr.write(`context guard hook failed to start: ${error.message}\n`);
    process.exitCode = 2;
  });
}
