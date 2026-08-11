import test from "node:test";
import assert from "node:assert/strict";
import { applyControl, createIdleState } from "../../src/runtime/kernel.mjs";
import { decision, stageResult, workflow } from "../helpers.mjs";

const now = () => "2026-08-08T12:00:00.000Z";
const idFactory = () => "wi-test";

function start(value = workflow()) {
  return applyControl({
    state: createIdleState(),
    workflow: value,
    command: {
      kind: "start",
      intent: "Build a useful control layer",
      workflowRef: "workflows/test.json",
      workflowDigest: "sha256:test",
    },
    now,
    idFactory,
  }).state;
}

test("auto transition advances and human transition waits", () => {
  const value = workflow();
  let state = start(value);
  let result = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: stageResult() },
    now,
  });
  state = result.state;
  assert.equal(state.active.stage, "build");
  assert.equal(result.decision.kind, "ready");

  result = applyControl({
    state,
    workflow: value,
    command: {
      kind: "signal",
      expectedRevision: 2,
      result: stageResult({ outcome: "done", summary: "Built", conditions: [] }),
    },
    now,
  });
  assert.equal(result.state.active.status, "awaiting-human");
  assert.equal(result.decision.kind, "await-human");
});

test("pause invalidates an agent revision and resume restores the prior state", () => {
  const value = workflow();
  let state = start(value);
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "decide", expectedRevision: 1, decision: decision("pause") },
    now,
  }).state;
  assert.equal(state.active.status, "paused");
  assert.throws(() => applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: stageResult() },
    now,
  }), (error) => error.code === "E_STALE_REVISION");
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "decide", expectedRevision: 2, decision: decision("resume") },
    now,
  }).state;
  assert.equal(state.active.status, "active");
});

test("pause freezes pending gates until resume, redirect or abort", () => {
  const value = workflow();
  let state = start(value);
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: stageResult() },
    now,
  }).state;
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 2, result: stageResult({ outcome: "done", summary: "Built", conditions: [] }) },
    now,
  }).state;
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "decide", expectedRevision: 3, decision: decision("pause") },
    now,
  }).state;
  assert.throws(() => applyControl({
    state,
    workflow: value,
    command: { kind: "decide", expectedRevision: 4, decision: decision("approve") },
    now,
  }), (error) => error.code === "E_PHASE");
});

test("reject returns to the configured stage and supersedes the pending result", () => {
  const value = workflow();
  let state = start(value);
  state = applyControl({ state, workflow: value, command: { kind: "signal", expectedRevision: 1, result: stageResult() }, now }).state;
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 2, result: stageResult({ outcome: "done", summary: "Built", conditions: [] }) },
    now,
  }).state;
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "decide", expectedRevision: 3, decision: decision("reject") },
    now,
  }).state;
  assert.equal(state.active.stage, "build");
  assert.equal(state.active.status, "active");
  assert.equal(state.active.results.at(-1).status, "superseded");
});

test("failed policy conditions require an exact human override", () => {
  const value = workflow();
  let state = start(value);
  let result = applyControl({
    state,
    workflow: value,
    command: {
      kind: "signal",
      expectedRevision: 1,
      result: stageResult({
        conditions: [{ id: "intent-clear", status: "failed", reason: "Owner unavailable", evidenceRefs: [] }],
      }),
    },
    now,
  });
  state = result.state;
  assert.equal(result.decision.kind, "policy-blocked");
  assert.throws(() => applyControl({
    state,
    workflow: value,
    command: {
      kind: "decide",
      expectedRevision: 2,
      decision: decision("override", { acceptRisk: [] }),
    },
    now,
  }), (error) => error.code === "E_OVERRIDE_INCOMPLETE");

  result = applyControl({
    state,
    workflow: value,
    command: {
      kind: "decide",
      expectedRevision: 2,
      decision: decision("override", { acceptRisk: ["intent-clear"] }),
    },
    now,
  });
  assert.equal(result.state.active.stage, "build");
  assert.deepEqual(result.state.active.acceptedRisks, ["intent-clear"]);
});

test("approve completes with override history and archives a full last record", () => {
  const value = workflow();
  let state = start(value);
  state = applyControl({
    state,
    workflow: value,
    command: {
      kind: "signal",
      expectedRevision: 1,
      result: stageResult({
        conditions: [{ id: "intent-clear", status: "failed", reason: "Accepted risk", evidenceRefs: [] }],
      }),
    },
    now,
  }).state;
  state = applyControl({
    state,
    workflow: value,
    command: {
      kind: "decide",
      expectedRevision: 2,
      decision: decision("override", { acceptRisk: ["intent-clear"] }),
    },
    now,
  }).state;
  state = applyControl({
    state,
    workflow: value,
    command: {
      kind: "signal",
      expectedRevision: 3,
      result: stageResult({ outcome: "done", summary: "Built", conditions: [] }),
    },
    now,
  }).state;
  const completed = applyControl({
    state,
    workflow: value,
    command: { kind: "decide", expectedRevision: 4, decision: decision("approve") },
    now,
  }).state;
  assert.equal(completed.active, null);
  assert.equal(completed.last.outcome, "completed-with-override");
  assert.ok(completed.last.events.some((event) => event.type === "human-decision"));
});

test("redirect preserves history and supersedes affected results", () => {
  const value = workflow();
  let state = start(value);
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: stageResult() },
    now,
  }).state;
  state = applyControl({
    state,
    workflow: value,
    command: {
      kind: "decide",
      expectedRevision: 2,
      decision: decision("redirect", { target: "align" }),
    },
    now,
  }).state;
  assert.equal(state.active.stage, "align");
  assert.equal(state.active.results[0].status, "superseded");
});

test("repeating identical signal is idempotent while different content conflicts", () => {
  const value = workflow();
  let state = start(value);
  const first = stageResult();
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: first },
    now,
  }).state;
  const repeated = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: first },
    now,
  });
  assert.equal(repeated.decision.kind, "idempotent");
  assert.equal(repeated.state.revision, 2);
  assert.throws(() => applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 0, result: first },
    now,
  }), (error) => error.code === "E_STALE_REVISION");
  assert.throws(() => applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: stageResult({ summary: "Different" }) },
    now,
  }), (error) => error.code === "E_SIGNAL_CONFLICT");
});

test("an identical terminal signal remains idempotent after archival", () => {
  const value = workflow();
  delete value.stages.build;
  value.transitions = [{
    id: "align-ready",
    from: "align",
    on: "ready",
    to: "complete",
    gate: { mode: "auto" },
  }];
  let state = start(value);
  const first = stageResult();
  state = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: first },
    now,
  }).state;
  assert.equal(state.active, null);
  const repeated = applyControl({
    state,
    workflow: value,
    command: { kind: "signal", expectedRevision: 1, result: first },
    now,
  });
  assert.equal(repeated.decision.kind, "idempotent");
  assert.equal(repeated.state.revision, 2);
});
