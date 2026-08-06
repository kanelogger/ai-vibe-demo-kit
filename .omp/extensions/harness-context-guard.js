import { runGuardForHook } from "../../scripts/harness/adapters/hook-core.mjs";

export default function harnessContextGuard(pi) {
  pi.on("tool_call", async (event, ctx) => {
    const sessionId = ctx.sessionManager?.getSessionFile?.() ?? process.env.OMP_SESSION_ID;
    const decision = await runGuardForHook({
      cwd: ctx.cwd,
      session_id: sessionId,
      tool_name: event.toolName,
      tool_input: event.input,
    });
    if (decision.blocked) return { block: true, reason: decision.reason };
  });
}
