#!/usr/bin/env node

import { denyOutput, runGuardForHook } from "./hook-core.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

try {
  const payload = JSON.parse(await readStdin());
  const decision = await runGuardForHook(payload);
  if (decision.blocked) process.stdout.write(`${JSON.stringify(denyOutput(decision.reason))}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify(denyOutput(`Context Guard adapter failed: ${error.message}`))}\n`);
}
