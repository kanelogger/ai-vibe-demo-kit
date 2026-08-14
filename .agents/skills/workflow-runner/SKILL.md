---
name: workflow-runner
description: "Drive the current AI Vibe Demo Kit Workflow Stage from active state to a validated Stage Result by observing Harness state, selecting the minimum capabilities already exposed in the Agent session, executing project work, recording execution-trace/v1 Evidence, and advancing safely. Use in repositories with an active ./harness Workflow for alignment, implementation, acceptance, remediation, or blocked-stage handling."
---

# Workflow Runner

Drive exactly one current Workflow Stage to a truthful, validated Stage Result. Treat Workflow as the declaration of required outcomes and Harness as the deterministic control layer; perform all project work outside Harness.

## Run the Stage

### 1. Observe

1. Read `AGENTS.md`, `project.yml`, `AI_ENVIRONMENT.md` when required, `ARCHITECTURE.md` and the minimum context selected by `source/knowledge/ROUTING.md`.
2. Run the required environment probes, `./harness check --json` and `./harness status --json`.
3. Stop when a required environment fact is incompatible. Record the deviation instead of assuming compatibility.
4. Follow only `allowedActions`. Stop immediately when a Human Gate or Policy decision is pending.

### 2. Understand

Read the active Stage goal, outcomes, exit conditions, required Artifact contracts and the `workflow-runner` Skill Call. Convert them into explicit capability requirements without adding scope.

### 3. Discover

Use only Skills, tools and native Agent capabilities already exposed in the current session. Do not scan `.agents/skills`, read `skills.sources.json` as a readiness source, resolve remote repositories, install Skills, or probe authentication and external health.

When no focused domain Skill is needed, select the specific tool or `agent-native` capability explicitly.

### 4. Decide

Choose the smallest capability set that covers every Stage requirement. Record each selected capability, its `skill|tool|agent` kind, covered requirement IDs and a concrete reason. Do not select capabilities for hypothetical future work.

### 5. Execute

Invoke the selected capabilities and preserve their observable outputs as repository-local Evidence. Record every attempt, including failed or skipped calls. When a call fails, choose a minimal fallback and continue only when permissions and Stage policy allow it.

Use `blocked` when the Stage cannot be completed. In acceptance, use `changes-requested` when verified evidence requires another implementation cycle.

### 6. Record

Create `execution-trace/v1` from `source/workflows/execution-trace-template.json`:

- Cover every declared trace requirement with at least one capability selection.
- Record at least one execution for every selection.
- Give succeeded executions Artifact or Evidence references.
- Give failed or skipped executions a reason.
- Never reference the execution trace itself as an execution output.
- Keep dynamically selected domain capabilities inside the trace. The Stage Result `skills[]` contains only the declared Workflow Runner receipt.

Create every remaining required Stage Artifact and build the Stage Result from `source/workflows/stage-result-template.json`. A succeeded Runner receipt means the Stage loop was executed and reported truthfully; domain failures may still lead to a truthful blocked or changes-requested outcome.

### 7. Advance

Validate the Stage Result before submission. For completion candidates, run:

```sh
./harness check-result --workflow <workflow.json> --stage acceptance \
  --file <acceptance-result.json> --require-complete --json
```

Submit with the current revision, then inspect status again:

```sh
./harness signal --revision <revision> --file <stage-result.json> --json
./harness status --json
```

Treat exit code `1` as a potentially persisted Gate or Policy state; inspect the response before taking another action.

## Permission boundaries

- Never approve, reject, override, redirect, abort, publish, tag, push, perform production writes or run destructive cleanup without an explicit user instruction for that exact action.
- Write only task-scoped source and Evidence authorized by the user.
- Do not install, update, remove, validate or authenticate consumer domain Skills.
- Do not use Lifecycle apply commands; hand installation, upgrade, sync, recovery and uninstall work to `kit-lifecycle`.
