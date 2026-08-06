import { createHash, randomUUID } from "node:crypto";
import { E } from "./errors.mjs";
import { assertClean, changedFiles, headIdentity, headSnapshot, isAncestor, workspaceDigest, worktreeStatus } from "./git.mjs";
import { loadState, mutateState } from "./state.mjs";
import { digest, runVerification, verificationDigests } from "./verification.mjs";
import { guardWriteContext } from "./context-guard.mjs";

function nowIso(now) {
  return now().toISOString();
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw E.USAGE(`${label} 必须非空`);
  return value.trim();
}

function pathInside(path, root) {
  const normalized = root.replace(/\/$/, "");
  return path === normalized || path.startsWith(`${normalized}/`);
}

function confirmationDigest(active, kind) {
  if (kind === "alignment") {
    return digest({ id: active.id, revision: active.revision, alignment: active.alignment, risk: active.risk, baseline: active.baseline });
  }
  return digest({ id: active.id, revision: active.revision, full: active.full, risk: active.risk });
}

function receiptKey(session, target) {
  return createHash("sha256").update(`${session}\0${target}`).digest("hex");
}

function publicActive(active) {
  if (active === null) return null;
  return structuredClone(active);
}

async function reportCurrent(root, config, report) {
  if (!report) return null;
  const expected = verificationDigests(config, report.profile);
  let current = report.configDigest === expected.configDigest && report.planDigest === expected.planDigest;
  if (report.profile === "quick") current = current && report.workspaceDigest === await workspaceDigest(root);
  else {
    const head = await headSnapshot(root);
    current =
      current &&
      report.candidate?.branch === head.branch &&
      report.candidate?.commit === head.commit &&
      report.candidate?.tree === head.tree &&
      (await worktreeStatus(root)) === "";
  }
  return { ...structuredClone(report), current };
}

async function view(root, config, state) {
  const active = publicActive(state.active);
  if (active) {
    active.quick = await reportCurrent(root, config, active.quick);
    active.full = await reportCurrent(root, config, active.full);
  }
  return { version: 1, idle: active === null, active, last: structuredClone(state.last), allowedActions: allowedActions(active) };
}

function allowedActions(active) {
  if (!active) return ["align"];
  if (active.phase === "alignment") return ["align --confirm", "abort"];
  if (active.phase === "implementation") return ["check", "finish", "abort"];
  return ["finish --confirm", "abort"];
}

export async function status({ root, config }) {
  return view(root, config, await loadState(root));
}

export async function align({ root, config, draft = null, confirmation = null, now = () => new Date() }) {
  if (draft) {
    await assertClean(root);
    const intent = requireText(draft.intent, "--intent");
    if (!Array.isArray(draft.doneWhen) || draft.doneWhen.length === 0) throw E.USAGE("至少提供一个 --done-when");
    const doneWhen = draft.doneWhen.map((entry) => requireText(entry, "--done-when"));
    const riskLevel = draft.risk ?? "normal";
    if (!new Set(["normal", "high"]).has(riskLevel)) throw E.USAGE("--risk 必须是 normal 或 high");
    const reasons = (draft.riskReasons ?? []).map((entry) => requireText(entry, "--risk-reason"));
    const rollback = draft.rollback?.trim() || config.recovery.rollback.join(" && ");
    if (riskLevel === "high" && reasons.length === 0) throw E.USAGE("高风险任务至少提供一个 --risk-reason");
    if (riskLevel === "high" && rollback === "") throw E.USAGE("高风险任务必须提供 --rollback 或配置 recovery.rollback");
    const baseline = await headSnapshot(root);
    let created;
    await mutateState(root, (state) => {
      if (state.active) throw E.ACTIVE(state.active.id);
      const at = nowIso(now);
      created = {
        id: `wi-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
        revision: 1,
        phase: riskLevel === "high" ? "alignment" : "implementation",
        alignment: {
          intent,
          doneWhen,
          constraints: (draft.constraints ?? []).map((entry) => requireText(entry, "--constraint")),
          sources: (draft.sources ?? []).map((entry) => requireText(entry, "--source")),
        },
        risk: { level: riskLevel, reasons, rollback: rollback || null },
        baseline,
        confirmations: { alignment: null, acceptance: null },
        contextReceipts: {},
        quick: null,
        full: null,
        createdAt: at,
        updatedAt: at,
      };
      state.active = created;
    });
    const result = await view(root, config, await loadState(root));
    if (created.phase === "alignment") {
      return { ...result, decision: "confirmation-required", confirmationDigest: confirmationDigest(created, "alignment") };
    }
    return result;
  }

  if (!confirmation) throw E.USAGE("align 需要 draft 或 --confirm");
  await mutateState(root, (state) => {
    const active = state.active;
    if (!active) throw E.IDLE();
    if (active.phase !== "alignment") throw E.PHASE(active.phase, "align --confirm");
    const expected = confirmationDigest(active, "alignment");
    if (confirmation.digest !== expected) throw E.CONFIRM_STALE();
    active.confirmations.alignment = { digest: expected, quote: requireText(confirmation.quote, "--quote"), confirmedAt: nowIso(now) };
    active.phase = "implementation";
    active.updatedAt = nowIso(now);
  });
  return view(root, config, await loadState(root));
}

async function assertCandidate(root, active) {
  await assertClean(root);
  const candidate = await headSnapshot(root);
  if (candidate.branch !== active.baseline.branch) throw E.GIT_DRIFT(`当前分支 ${candidate.branch} 与起始分支 ${active.baseline.branch} 不一致`);
  if (!(await isAncestor(root, active.baseline.commit, candidate.commit))) throw E.GIT_DRIFT("任务 baseline 不是当前候选的祖先");
  if (candidate.commit === active.baseline.commit) throw E.GIT_DRIFT("当前任务尚未形成候选提交");
  return candidate;
}

async function promoteChangedHighRisk(root, config, active, now) {
  if (active.risk.level === "high") return null;
  const files = await changedFiles(root, active.baseline.commit);
  const high = files.filter((path) => config.risk.highRiskPaths.some((entry) => pathInside(path, entry)));
  if (high.length === 0) return null;
  await mutateState(root, (state) => {
    if (state.active?.id !== active.id || state.active.revision !== active.revision) throw E.STATE("任务在风险升级期间发生漂移");
    state.active.revision += 1;
    state.active.phase = "alignment";
    state.active.risk = {
      level: "high",
      reasons: high.map((path) => `high-risk-path:${path}`),
      rollback: config.recovery.rollback.join(" && ") || "git revert <candidate-commit>",
    };
    state.active.confirmations = { alignment: null, acceptance: null };
    state.active.contextReceipts = {};
    state.active.quick = null;
    state.active.full = null;
    state.active.updatedAt = nowIso(now);
  });
  const promoted = (await loadState(root)).active;
  return { decision: "confirmation-required", confirmationDigest: confirmationDigest(promoted, "alignment") };
}

export async function check({ root, config, now = () => new Date() }) {
  const state = await loadState(root);
  const active = state.active;
  if (!active) throw E.IDLE();
  if (active.phase !== "implementation") throw E.PHASE(active.phase, "check");
  const report = await runVerification({ root, config, profile: "quick", now });
  await mutateState(root, (current) => {
    if (current.active?.id !== active.id || current.active.revision !== active.revision) throw E.STATE("任务在 Quick 期间发生漂移");
    current.active.quick = report;
    current.active.updatedAt = nowIso(now);
  });
  if (!report.passed) throw E.VERIFY_FAILED(report);
  return { report, ...(await view(root, config, await loadState(root))) };
}

function closeState(state, active, outcome, now, reason = null, candidate = active.full?.candidate ?? null) {
  state.last = {
    id: active.id,
    outcome,
    intent: active.alignment.intent,
    risk: active.risk.level,
    baseline: active.baseline,
    candidate,
    full: active.full,
    reason,
    closedAt: nowIso(now),
  };
  state.active = null;
}

export async function finish({ root, config, confirmation = null, now = () => new Date() }) {
  const state = await loadState(root);
  const active = state.active;
  if (!active) throw E.IDLE();

  if (active.phase === "acceptance") {
    if (!confirmation) return { ...(await view(root, config, state)), decision: "confirmation-required", confirmationDigest: confirmationDigest(active, "acceptance") };
    const expected = confirmationDigest(active, "acceptance");
    if (confirmation.digest !== expected) throw E.CONFIRM_STALE();
    await assertClean(root);
    const candidate = await headSnapshot(root);
    const current = await reportCurrent(root, config, active.full);
    if (!current.current || candidate.commit !== active.full.candidate.commit) throw E.VERIFY_STALE();
    await mutateState(root, (currentState) => {
      if (currentState.active?.id !== active.id || currentState.active.revision !== active.revision) throw E.STATE("任务在验收确认期间发生漂移");
      currentState.active.confirmations.acceptance = {
        digest: expected,
        quote: requireText(confirmation.quote, "--quote"),
        confirmedAt: nowIso(now),
      };
      closeState(currentState, currentState.active, "accepted", now);
    });
    return { completed: true, ...(await view(root, config, await loadState(root))) };
  }

  if (active.phase !== "implementation") throw E.PHASE(active.phase, "finish");
  await assertCandidate(root, active);
  const promotion = await promoteChangedHighRisk(root, config, active, now);
  if (promotion) return { ...(await view(root, config, await loadState(root))), ...promotion };

  const report = await runVerification({ root, config, profile: "full", now });
  await mutateState(root, (current) => {
    if (current.active?.id !== active.id || current.active.revision !== active.revision) throw E.STATE("任务在 Full 期间发生漂移");
    current.active.full = report;
    current.active.updatedAt = nowIso(now);
    if (report.passed && current.active.risk.level === "high") current.active.phase = "acceptance";
    if (report.passed && current.active.risk.level === "normal") closeState(current, current.active, "accepted", now);
  });
  if (!report.passed) throw E.VERIFY_FAILED(report);
  const current = await loadState(root);
  if (current.active?.phase === "acceptance") {
    return {
      ...(await view(root, config, current)),
      decision: "confirmation-required",
      confirmationDigest: confirmationDigest(current.active, "acceptance"),
    };
  }
  return { completed: true, report, ...(await view(root, config, current)) };
}

export async function abort({ root, config, reason, now = () => new Date() }) {
  const before = await loadState(root);
  if (!before.active) throw E.IDLE();
  const candidate = await headIdentity(root);
  let result;
  await mutateState(root, (state) => {
    if (!state.active) throw E.IDLE();
    if (state.active.id !== before.active.id || state.active.revision !== before.active.revision) {
      throw E.STATE("任务在 abort 期间发生漂移");
    }
    const active = state.active;
    result = {
      aborted: true,
      baseline: active.baseline,
      candidate,
      recovery: active.risk.rollback ?? "git revert <candidate-commit> 或按 baseline 手工恢复",
    };
    closeState(state, active, "abandoned", now, requireText(reason, "--reason"), candidate);
  });
  return { ...result, ...(await view(root, config, await loadState(root))) };
}

async function authorizeContext(root, config, target, session, now) {
  let state = await loadState(root);
  let active = state.active;
  if (!active) throw E.PHASE("idle", "managed write");
  if (active.risk.level === "normal" && config.risk.highRiskPaths.some((entry) => pathInside(target, entry))) {
    await mutateState(root, (current) => {
      if (current.active?.id !== active.id || current.active.revision !== active.revision) throw E.STATE("任务在写前风险升级期间发生漂移");
      current.active.revision += 1;
      current.active.phase = "alignment";
      current.active.risk = { level: "high", reasons: [`high-risk-path:${target}`], rollback: config.recovery.rollback.join(" && ") || "git revert <candidate-commit>" };
      current.active.confirmations = { alignment: null, acceptance: null };
      current.active.contextReceipts = {};
      current.active.quick = null;
      current.active.full = null;
      current.active.updatedAt = nowIso(now);
    });
    state = await loadState(root);
    throw E.CONFIRM_REQUIRED("alignment", confirmationDigest(state.active, "alignment"));
  }
  active = state.active;
  if (active.phase !== "implementation") throw E.PHASE(active.phase, "managed write");
  const key = receiptKey(session, target);
  return {
    workItemId: active.id,
    workItemRevision: active.revision,
    prior: active.contextReceipts[key] ?? null,
    displayPath: `control.json#active.contextReceipts.${key}`,
    save: async (receipt) => mutateState(root, (current) => {
      if (current.active?.id !== active.id || current.active.revision !== active.revision) throw E.STATE("任务在上下文交付期间发生漂移");
      current.active.contextReceipts[key] = receipt;
      current.active.updatedAt = nowIso(now);
    }),
  };
}

export async function guardWrite({ root, config, targetPath, sessionId, deliver, now = () => new Date() }) {
  return guardWriteContext({
    root,
    config,
    targetPath,
    sessionId,
    deliver,
    now,
    authorize: ({ target, session }) => authorizeContext(root, config, target, session, now),
  });
}
