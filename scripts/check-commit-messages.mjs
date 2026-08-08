#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SUBJECT = /^(feat|fix|docs|test|refactor|perf|build|ci|chore|revert)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S(?:.*\S)?$/;
const REF = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

export function validCommitSubject(subject) {
  return SUBJECT.test(subject);
}

function validRef(value) {
  return REF.test(value) && !value.includes("..") && !value.endsWith("/");
}

function main(argv) {
  const [base, head] = argv;
  if (argv.length !== 2 || !validRef(base) || !validRef(head)) {
    process.stderr.write("Usage: node scripts/check-commit-messages.mjs <base-ref> <head-ref>\n");
    return 2;
  }
  const range = `${base}..${head}`;
  const result = spawnSync("git", ["log", "--no-merges", "--format=%H%x09%s", range], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stderr || `${result.error?.message ?? "git log failed"}\n`);
    return 2;
  }
  const commits = result.stdout.trimEnd()
    ? result.stdout.trimEnd().split("\n").map((line) => {
        const separator = line.indexOf("\t");
        return { hash: line.slice(0, separator), subject: line.slice(separator + 1) };
      })
    : [];
  const invalid = commits.filter((commit) => !validCommitSubject(commit.subject));
  if (invalid.length > 0) {
    process.stderr.write(`Invalid commit subject${invalid.length === 1 ? "" : "s"}:\n`);
    for (const commit of invalid) process.stderr.write(`  ${commit.hash.slice(0, 12)} ${commit.subject}\n`);
    process.stderr.write("Expected: <type>(<optional-scope>)<optional-!>: <non-empty summary>\n");
    return 1;
  }
  process.stdout.write(`commit messages: valid (${commits.length})\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
