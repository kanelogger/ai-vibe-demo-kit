import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../cli.mjs", import.meta.url));
const WRITE_TOOLS = new Set(["apply_patch", "edit", "write", "notebookedit", "ast_edit"]);

function patchTargets(command) {
  const targets = [];
  for (const line of String(command ?? "").split(/\r?\n/)) {
    const marker = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
    if (marker) targets.push(marker[1].trim());
  }
  return targets;
}

export function extractWriteTargets(payload) {
  const toolName = String(payload.tool_name ?? payload.toolName ?? "").toLowerCase();
  if (!WRITE_TOOLS.has(toolName)) return [];
  const input = payload.tool_input ?? payload.toolInput ?? payload.input ?? {};
  const direct = [input.file_path, input.notebook_path, input.path, input.file, input.target]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
  const fromPatch = toolName === "apply_patch" ? patchTargets(input.command ?? input.patch) : [];
  const targets = [...new Set([...direct, ...fromPatch])];
  if (targets.length === 0) throw new Error(`无法从 ${payload.tool_name ?? payload.toolName} 提取结构化目标路径`);
  return targets;
}

function runCli(root, target, session) {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [CLI, "context", "guard", "--file", target, "--session", session, "--root", root, "--json"],
      { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolvePromise({ code: error?.code ?? 0, stdout, stderr });
      },
    );
  });
}

function renderContext(result) {
  const lines = [
    `Context Guard blocked ${result.target}. Read the delivered prerequisites, then retry the same tool call.`,
    `context: ${result.resolutionDigest}`,
  ];
  for (const index of result.indexes ?? []) lines.push(`index ${index.path}: ${index.summary}`);
  for (const dependency of result.dependencies ?? []) {
    lines.push(`dependency ${dependency.path} (${dependency.sha256})`);
    if (dependency.content) lines.push(dependency.content);
  }
  return lines.join("\n").slice(0, 48 * 1024);
}

export async function runGuardForHook(payload) {
  const targets = extractWriteTargets(payload);
  if (targets.length === 0) return { blocked: false, targets: [] };
  const root = resolve(payload.cwd ?? process.cwd());
  const session = payload.session_id ?? payload.sessionId ?? payload.conversation_id;
  if (typeof session !== "string" || session.trim() === "") {
    return { blocked: true, reason: "Context Guard requires a stable session id from the host." };
  }
  const blocked = [];
  for (const target of targets) {
    const result = await runCli(root, target, session.trim());
    if (result.code === 0) continue;
    let parsed = null;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      // The stable stderr is still useful if the host adapter failed before JSON output.
    }
    if (parsed?.decision === "blocked") {
      blocked.push(parsed);
      continue;
    }
    const error = parsed?.error;
    const reason = error
      ? `${error.code}: ${error.message}${error.repair ? `\nRepair: ${error.repair}` : ""}`
      : (result.stderr || `Context Guard failed for ${target}`).trim();
    return { blocked: true, reason, result: parsed };
  }
  if (blocked.length > 0) {
    return { blocked: true, reason: blocked.map(renderContext).join("\n\n"), results: blocked };
  }
  return { blocked: false, targets };
}

export function denyOutput(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}
