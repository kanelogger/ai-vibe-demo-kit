#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REF = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const FEATURE = /^(feat|fix)(\([a-z0-9][a-z0-9._/-]*\))?!?: /;

function validRef(value) {
  return REF.test(value) && !value.includes("..") && !value.endsWith("/");
}

function validPath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..");
}

function matches(path, configured) {
  return configured.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) return { error: result.stderr || result.error?.message || `git ${args[0]} failed` };
  return { stdout: result.stdout };
}

export function checkChangeTests(base, head, { behaviorPaths, testRoots, cwd = process.cwd() } = {}) {
  if (!validRef(base) || !validRef(head) || !Array.isArray(behaviorPaths) || behaviorPaths.length === 0 || !Array.isArray(testRoots) || testRoots.length === 0 || [...behaviorPaths, ...testRoots].some((entry) => !validPath(entry))) {
    return { code: 2, stderr: "Usage: node source/tools/check-change-tests.mjs <base-ref> <head-ref> --behavior-path <path>... --test-root <path>...\n" };
  }
  const logged = git(["log", "--no-merges", "--format=%H%x09%s", `${base}..${head}`], cwd);
  if (logged.error) return { code: 2, stderr: `${logged.error.trimEnd()}\n` };
  const commits = logged.stdout.trimEnd() ? logged.stdout.trimEnd().split("\n").map((line) => {
    const separator = line.indexOf("\t");
    return { hash: line.slice(0, separator), subject: line.slice(separator + 1) };
  }) : [];
  const failures = [];
  for (const commit of commits) {
    if (!FEATURE.test(commit.subject)) continue;
    const changed = git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", commit.hash], cwd);
    if (changed.error) return { code: 2, stderr: `${changed.error.trimEnd()}\n` };
    const paths = changed.stdout.split("\0").filter(Boolean);
    const behavior = paths.filter((path) => matches(path, behaviorPaths) && !path.endsWith("/ARCHITECTURE.md") && path !== "ARCHITECTURE.md");
    if (behavior.length > 0 && !paths.some((path) => matches(path, testRoots))) failures.push({ ...commit, behavior });
  }
  if (failures.length > 0) {
    let stderr = "Feature and fix commits that change behavior must update tests in the same commit:\n";
    for (const failure of failures) stderr += `  ${failure.hash.slice(0, 12)} ${failure.subject}\n    behavior: ${failure.behavior.join(", ")}\n`;
    return { code: 1, stderr };
  }
  return { code: 0, stdout: `change tests: valid (${commits.length} commit(s))\n` };
}

function parse(argv) {
  const [base, head, ...rest] = argv;
  const behaviorPaths = [];
  const testRoots = [];
  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index];
    const value = rest[index + 1];
    if (!value || !new Set(["--behavior-path", "--test-root"]).has(option)) return null;
    (option === "--behavior-path" ? behaviorPaths : testRoots).push(value);
  }
  return { base, head, behaviorPaths, testRoots };
}

function main(argv) {
  const options = parse(argv);
  const result = options ? checkChangeTests(options.base, options.head, options) : { code: 2, stderr: "Usage: node source/tools/check-change-tests.mjs <base-ref> <head-ref> --behavior-path <path>... --test-root <path>...\n" };
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
