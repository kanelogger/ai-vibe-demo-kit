// helpers.mjs — Phase A 测试公共工具：临时 git 仓库与 CLI 驱动。

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
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

/** 创建带 main 分支、一次初始提交与 .harness/config.json 的临时仓库。 */
export async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), "harness-phaseA-"));
  await sh("git", ["init", "-b", "main"], root);
  await sh("git", ["config", "user.name", "phase-a-test"], root);
  await sh("git", ["config", "user.email", "phase-a@test.local"], root);
  await mkdir(join(root, ".harness"), { recursive: true });
  await writeFile(
    join(root, ".harness", "config.json"),
    `${JSON.stringify({ version: 1, git: { targetRef: "refs/heads/main", stateRef: "refs/heads/harness/state" } }, null, 2)}\n`,
  );
  await writeFile(join(root, "README.md"), "# fixture\n");
  await sh("git", ["add", "-A"], root);
  await sh("git", ["commit", "-m", "init"], root);
  return root;
}

export function ctxOf(root) {
  return { root, config: {}, targetRef: "refs/heads/main", stateRef: "refs/heads/harness/state" };
}

/** 运行 CLI；非零退出不抛异常，返回 { code, stdout, stderr, json }。 */
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

/** 读取 stateRef 中的文件内容。 */
export async function stateFile(root, path) {
  return sh("git", ["show", `refs/heads/harness/state:${path}`], root);
}

export async function stateFileJson(root, path) {
  return JSON.parse(await stateFile(root, path));
}

export async function refTip(root, ref) {
  try {
    return await sh("git", ["rev-parse", "--verify", ref], root);
  } catch {
    return null;
  }
}
