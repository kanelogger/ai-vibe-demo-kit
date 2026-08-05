# AI Native Harness

AI Native Harness governs how repository-owned development work is understood, authorized, executed, verified, promoted, and recovered. This glossary defines the domain language used across workflow documents, state, Skills, and verification evidence.

## Workflow Governance

**Workflow Control Plane**:
The authoritative mechanism that owns Work Item lifecycle, human gates, evidence requirements, promotion, and recovery.
_Avoid_: Workflow scripts, process files

**Legacy Control Plane**:
The previously authoritative Workflow Control Plane retained only as frozen historical evidence after State Bootstrap.
_Avoid_: Old Harness, fallback workflow

**Canonical Control Plane**:
The sole mutable Workflow Control Plane after State Bootstrap and the sole public workflow interface after Control Plane Cutover.
_Avoid_: New Harness, v2 path

**State Bootstrap**:
The reversible event that imports the accepted legacy history into the Canonical Control Plane and authorizes it to manage new Work Items before public entrypoints are switched.
_Avoid_: Partial cutover, dual-write period

**Cutover Readiness**:
The evidence-backed condition that the Canonical Control Plane provides the required lifecycle, review, verification, promotion, health, Hook, and recovery behavior before public entrypoints may switch.
_Avoid_: Code complete, migration ready

**Control Plane Cutover**:
The atomic event that switches public workflow entrypoints to the Canonical Control Plane, archives legacy evidence, and removes legacy runtime paths.
_Avoid_: State Bootstrap, gradual fallback

**Promotion Candidate**:
An exact integration commit and tree with current Full verification evidence, awaiting user acceptance and promotion to the target reference.
_Avoid_: Latest HEAD, build output

## Acceptance And Health

**Acceptance Outcome**:
An immutable user decision that closes a Work Item as accepted. It records what happened and is never revoked by time or later repository changes.
_Avoid_: Accepted stage, current acceptance

**Accepted Baseline**:
The exact commit, tree, configuration, contract identities, verification report, and user decision atomically established when a Promotion Candidate is accepted.
_Avoid_: Current workspace, latest main

**Baseline Health**:
A read-only assessment of whether an Accepted Baseline is still current, has verification evidence beyond its freshness policy, has diverged from the target reference, or has failed integrity checks. It never rewrites the Acceptance Outcome.
_Avoid_: Acceptance status, workspace cleanliness

**Workspace State**:
A read-only classification of uncommitted repository changes as clean, relevant to the current risk scope, or unrelated to it. It is reported separately from Baseline Health.
_Avoid_: Baseline drift, acceptance invalidation

## Skills And Project Knowledge

**Skill Plan**:
The deterministic Skill DAG selected for a Work Item, stage, risk profile, Slice state, and trigger context.
_Avoid_: Skill Run, prompt bundle

**Skill Run**:
An evidence record binding executed Skill Plan nodes to their inputs, outputs, artifact digests, and execution Adapter.
_Avoid_: Route result, Agent transcript

**Agent Adapter**:
A platform-specific bridge that executes Skill Plan nodes and submits Skill Run evidence without owning workflow or completion rules.
_Avoid_: Workflow Control Plane, Skill router

**Project Profile**:
An installable project-specific data plane that supplies source Adapters, domain glossary bridges, design mappings, validation paths, and context coverage policies through Harness-owned contracts.
_Avoid_: Core plugin, project wiki alone

**Context Coverage Policy**:
Project Profile-owned rules declaring which project knowledge must cover which files or modules, when that knowledge needs review, and what evidence clears the review state.
_Avoid_: Automatically inferred dependencies, Context Guard declaration integrity
