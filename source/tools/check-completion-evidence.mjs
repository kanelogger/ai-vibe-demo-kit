#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REF = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const ACCEPTANCE_RESULT = /^work\/requirements\/[^/]+\/acceptance-result\.json$/;
const GOVERNED_PATHS = [
  /^harness$/,
  /^bin\//,
  /^src\//,
  /^test\//,
  /^scripts\//,
  /^source\//,
  /^\.harness\//,
  /^\.github\/workflows\//,
  /^publish-npm\.sh$/,
  /^(?:AGENTS|AGENTS_template|ARCHITECTURE|README)\.md$/,
  /^project(?:-template)?\.yml$/,
];

function validRef(value) {
  return REF.test(value) && !value.includes("..") && !value.endsWith("/");
}

function changedPaths(base, head, cwd) {
  const result = spawnSync("git", ["diff", "--name-only", "-z", `${base}..${head}`], { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) return { error: result.stderr || result.error?.message || "git diff failed" };
  return { paths: result.stdout ? result.stdout.split("\0").filter(Boolean) : [] };
}

function workflowForResult(path, cwd) {
  const sibling = `${dirname(path)}/workflow.json`;
  try {
    lstatSync(resolve(cwd, sibling));
    return sibling;
  } catch (error) {
    if (error.code !== "ENOENT") return sibling;
    return "source/workflows/workflow-default.json";
  }
}

export function checkCompletionEvidence(base, head, { cwd = process.cwd() } = {}) {
  if (!validRef(base) || !validRef(head)) return { code: 2, stderr: "Usage: node source/tools/check-completion-evidence.mjs <base-ref> <head-ref>\n" };
  const changed = changedPaths(base, head, cwd);
  if (changed.error) return { code: 2, stderr: `${changed.error.trimEnd()}\n` };
  const governed = changed.paths.filter((path) => GOVERNED_PATHS.some((pattern) => pattern.test(path)));
  if (governed.length === 0) return { code: 0, stdout: "completion evidence: not required\n" };
  const results = changed.paths.filter((path) => ACCEPTANCE_RESULT.test(path));
  if (results.length === 0) return { code: 1, stderr: "governed changes require at least one changed acceptance result under work/requirements/<work-id>/acceptance-result.json\n" };
  for (const path of results) {
    const workflow = workflowForResult(path, cwd);
    const checked = spawnSync(process.execPath, [resolve(cwd, "harness"), "check-result", "--workflow", workflow, "--stage", "acceptance", "--file", path, "--require-complete", "--json"], { cwd, encoding: "utf8" });
    if (checked.error || checked.status !== 0) {
      const details = checked.stdout || checked.stderr || checked.error?.message || "check-result failed";
      return { code: checked.status ?? 2, stderr: `completion evidence invalid: ${path}\n${details.trimEnd()}\n` };
    }
  }
  return { code: 0, stdout: `completion evidence: valid (${results.length})\n` };
}

function main(argv) {
  if (argv.length !== 2) {
    process.stderr.write("Usage: node source/tools/check-completion-evidence.mjs <base-ref> <head-ref>\n");
    return 2;
  }
  const result = checkCompletionEvidence(argv[0], argv[1]);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
