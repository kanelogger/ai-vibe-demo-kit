import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../cli.mjs", import.meta.url));

export function sh(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, { cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        rejectPromise(error);
        return;
      }
      resolvePromise(stdout.trim());
    });
  });
}

export async function writeRepoFile(root, path, content) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

export async function readConfig(root) {
  return JSON.parse(await readFile(join(root, ".harness", "config.json"), "utf8"));
}

export async function writeConfig(root, config) {
  await writeRepoFile(root, ".harness/config.json", `${JSON.stringify(config, null, 2)}\n`);
}

export async function makeRepo({ quick = ["node -e \"process.exit(0)\""], full = ["node -e \"process.exit(0)\""] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "solo-harness-"));
  await sh("git", ["init", "-b", "main"], root);
  await sh("git", ["config", "user.name", "harness-test"], root);
  await sh("git", ["config", "user.email", "harness@test.local"], root);
  await writeConfig(root, {
    version: 2,
    project: { name: "fixture", summary: "Harness fixture", hasUserInterface: false },
    contextIndex: { codeRoots: [] },
    risk: { highRiskPaths: [] },
    commands: {
      quick: { static: quick, test: [] },
      full: { static: full, test: [] },
      contracts: [],
    },
    criticalUserPaths: [],
    verification: { commandTimeoutMs: 10_000 },
    recovery: { testDataCleanup: [], rollback: [] },
  });
  await writeRepoFile(root, "src/value.txt", "v1\n");
  await writeRepoFile(root, "README.md", "# fixture\n");
  await sh("git", ["add", "-A"], root);
  await sh("git", ["commit", "-m", "initial"], root);
  return root;
}

export async function commitAll(root, message = "candidate") {
  await sh("git", ["add", "-A"], root);
  await sh("git", ["commit", "-m", message], root);
}

export async function runCli(root, args) {
  try {
    const stdout = await sh("node", [CLI, ...args, "--root", root], root);
    return { code: 0, stdout, stderr: "", json: tryJson(stdout) };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      json: tryJson(error.stdout ?? ""),
    };
  }
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
