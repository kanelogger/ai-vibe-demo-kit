import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";

export function workflow(overrides = {}) {
  return {
    schemaVersion: 2,
    id: "test-flow",
    version: 1,
    initialStage: "align",
    stages: {
      align: {
        goal: "Align",
        outcomes: ["ready"],
        exitConditions: [
          { id: "intent-clear", description: "Intent is clear", required: true },
        ],
        skillCalls: [],
        requiredArtifacts: [],
      },
      build: {
        goal: "Build",
        outcomes: ["done"],
        exitConditions: [],
        skillCalls: [],
        requiredArtifacts: [],
      },
    },
    transitions: [
      {
        id: "align-ready",
        from: "align",
        on: "ready",
        to: "build",
        gate: { mode: "auto" },
      },
      {
        id: "build-done",
        from: "build",
        on: "done",
        to: "complete",
        gate: { mode: "human", prompt: "Accept", onReject: "build" },
      },
    ],
    ...overrides,
  };
}

export function stageResult(overrides = {}) {
  return {
    outcome: "ready",
    summary: "Alignment is complete",
    conditions: [
      { id: "intent-clear", status: "passed", evidenceRefs: ["note://intent"] },
    ],
    skills: [],
    artifacts: [],
    ...overrides,
  };
}

export function decision(action, overrides = {}) {
  return {
    action,
    actor: "Kane",
    reason: `${action} for test`,
    ...overrides,
  };
}

export async function makeGitRepo() {
  const root = await mkdtemp(join(tmpdir(), "harness-test-"));
  await mkdir(join(root, "workflows"), { recursive: true });
  await run("git", ["init", "-q"], root);
  await run("git", ["config", "user.name", "Harness Test"], root);
  await run("git", ["config", "user.email", "harness@example.test"], root);
  await writeFile(join(root, "README.md"), "# Test\n");
  await run("git", ["add", "README.md"], root);
  await run("git", ["commit", "-qm", "initial"], root);
  return root;
}

export function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr}`));
    });
  });
}

export function runRaw(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}
