import { readFile } from "node:fs/promises";
import { digestValue } from "./kernel.mjs";
import { HarnessError, fail } from "../shared/errors.mjs";
import { firstSymlinkInPath, resolveInside } from "../shared/path-safety.mjs";
import { readRepoJson } from "../shared/repo-io.mjs";
import { readSkillLock, readSkillRegistry, resolveSkillControlPaths, sha256Hex } from "../shared/skills.mjs";

// Profile -> complete Workflow -> Stage Skill Calls selection and the Active
// binding digest. Runtime never merges skillCalls across Profiles: a Profile
// references exactly one complete Workflow.

export const PROFILES_PATH = "source/workflows/profiles.json";
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";
const issue = (code, message, facts = null, repair = null) => ({ code, message, facts, repair });

export function validateProfiles(value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: [issue("E_PROFILES_INVALID", "profiles must be a JSON object")] };
  if (value.schemaVersion !== 1) errors.push(issue("E_PROFILES_INVALID", "schemaVersion must be 1"));
  if (!nonEmpty(value.defaultProfile) || !ID.test(value.defaultProfile)) errors.push(issue("E_PROFILES_INVALID", "defaultProfile must be a valid profile id"));
  if (!Array.isArray(value.profiles) || value.profiles.length === 0) errors.push(issue("E_PROFILES_INVALID", "profiles must be a non-empty array"));
  const ids = new Set();
  for (const [index, entry] of (Array.isArray(value.profiles) ? value.profiles : []).entries()) {
    const path = `profiles.${index}`;
    if (!isObject(entry) || !nonEmpty(entry.id) || !ID.test(entry.id)) {
      errors.push(issue("E_PROFILES_INVALID", `${path}.id must be a valid unique profile id`));
      continue;
    }
    if (ids.has(entry.id)) errors.push(issue("E_PROFILES_INVALID", `${path}.id is duplicated: ${entry.id}`));
    ids.add(entry.id);
    if (!nonEmpty(entry.description)) errors.push(issue("E_PROFILES_INVALID", `${path}.description must be non-empty`));
    if (!nonEmpty(entry.workflowRef) || entry.workflowRef.includes("\\") || entry.workflowRef.startsWith("/") || entry.workflowRef.split("/").includes("..")) {
      errors.push(issue("E_PROFILES_INVALID", `${path}.workflowRef must be a safe repository-relative path`));
    }
  }
  if (nonEmpty(value?.defaultProfile) && !ids.has(value.defaultProfile)) errors.push(issue("E_PROFILES_INVALID", `defaultProfile does not exist: ${value.defaultProfile}`));
  return { valid: errors.length === 0, errors };
}

export async function loadProfiles(root) {
  const value = await readRepoJson(root, PROFILES_PATH, "profiles");
  const report = validateProfiles(value);
  if (!report.valid) fail("E_PROFILES_INVALID", "profiles registry is invalid", { facts: report });
  return { defaultProfile: value.defaultProfile, profiles: value.profiles.map((entry) => ({ id: entry.id, description: entry.description, workflowRef: entry.workflowRef })) };
}

// One selector, never both. With neither, the default Profile applies. An
// explicit --workflow resolves without the Profiles registry, so bare
// workflow-only repositories and stateless checks keep working.
export async function resolveWorkflowSelection({ root, profileId = null, workflowRef = null }) {
  if (profileId && workflowRef) fail("E_USAGE", "--profile and --workflow are mutually exclusive");
  if (workflowRef) {
    if (!nonEmpty(workflowRef) || !resolveInside(root, workflowRef)) fail("E_PATH_OUTSIDE", "workflow path must be a safe repository-relative path");
    let defaultProfile = null;
    try {
      defaultProfile = (await loadProfiles(root)).defaultProfile;
    } catch (error) {
      if (!(error instanceof HarnessError && error.code === "E_REFERENCE_INVALID")) throw error;
    }
    return { profileId: null, workflowRef, profile: null, defaultProfile };
  }
  const registry = await loadProfiles(root);
  const id = profileId ?? registry.defaultProfile;
  const profile = registry.profiles.find((entry) => entry.id === id);
  if (!profile) fail("E_PROFILE_UNKNOWN", `unknown profile: ${id}`, { facts: { known: registry.profiles.map((entry) => entry.id) } });
  return { profileId: profile.id, workflowRef: profile.workflowRef, profile, defaultProfile: registry.defaultProfile };
}

async function entityDigest(root, skillRef) {
  const target = resolveInside(root, skillRef);
  if (!target) return { digest: null, problem: issue("E_PATH_OUTSIDE", `skill entity path leaves the repository: ${skillRef}`) };
  if (await firstSymlinkInPath(root, target)) return { digest: null, problem: issue("E_PATH_SYMLINK", `skill entity path must not use symlinks: ${skillRef}`) };
  try {
    const bytes = await readFile(target);
    return { digest: `sha256:${sha256Hex(bytes)}`, problem: null };
  } catch (error) {
    if (error.code === "ENOENT") return { digest: null, problem: null };
    return { digest: null, problem: issue("E_REFERENCE_INVALID", `skill entity cannot be read: ${skillRef}`) };
  }
}

function skillCallsFor(workflow) {
  const calls = new Map();
  for (const stage of Object.values(workflow?.stages ?? {})) {
    for (const call of stage?.skillCalls ?? []) {
      if (!nonEmpty(call?.skill)) continue;
      calls.set(call.skill, (calls.get(call.skill) ?? false) || call.required === true);
    }
  }
  return calls;
}

// The normalized binding digest covers: the current Profile entry, the
// complete Workflow, the Catalog, registry and lock digests, and every Skill
// the Workflow calls (id, sourceId, skillRef, entity digest). Other Profiles
// are excluded: their changes must not drift an Active binding.
export async function computeBinding({ root, selection, workflow, catalog }) {
  const issues = [];
  const entries = new Map((catalog?.skills ?? []).map((entry) => [entry.id, entry]));
  const hasExternal = [...entries.values()].some((entry) => entry.availability === "lock-owned");
  let registryDigest = null;
  let lockDigest = null;
  if (hasExternal) {
    const control = await resolveSkillControlPaths(root);
    try {
      registryDigest = digestValue(await readSkillRegistry(root, control));
    } catch (error) {
      issues.push(issue(error instanceof HarnessError ? error.code : "E_SKILLS_REGISTRY_INVALID", error.message));
    }
    if (registryDigest) {
      try {
        const lock = await readSkillLock(root, control, { missing: "null" });
        lockDigest = lock ? digestValue(lock) : null;
      } catch (error) {
        issues.push(issue(error instanceof HarnessError ? error.code : "E_SKILLS_LOCK_INVALID", error.message));
      }
    }
  }
  const skills = [];
  for (const [skill, required] of skillCallsFor(workflow)) {
    const entry = entries.get(skill);
    if (!entry) {
      issues.push(issue("E_SKILL_UNKNOWN", `skill is not present in catalog: ${skill}`));
      continue;
    }
    const { digest, problem } = await entityDigest(root, entry.skillRef);
    if (problem && (required || entry.availability !== "lock-owned")) issues.push(problem);
    skills.push({ id: entry.id, sourceId: entry.sourceId ?? null, skillRef: entry.skillRef, entityDigest: digest });
  }
  skills.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const profile = selection.profile ? { id: selection.profile.id, description: selection.profile.description, workflowRef: selection.profile.workflowRef } : null;
  const bindingDigest = digestValue({ profile, workflow, catalog, registryDigest, lockDigest, skills });
  return { bindingDigest, lockDigest, issues };
}

// Re-resolves the Active binding without mutating anything. Drift categories:
// unreadable/invalid controls -> issue entries; changed inputs -> digest
// mismatch. Status consumes the report; signal/decide fail on it.
export async function inspectActiveBinding({ root, active, loadWorkflowFor }) {
  const issues = [];
  const profileId = active.profileId ?? null;
  const workflowRef = active.workflowRef ?? active.workflow?.ref ?? null;
  if (active.bindingDigest === undefined) {
    return { drift: true, issues: [issue("E_BINDING_LEGACY", "active binding predates Profile binding; abort and restart the Work Item")], workflowDrift: false };
  }
  let selection;
  try {
    selection = await resolveWorkflowSelection({ root, profileId, workflowRef: profileId ? null : workflowRef });
  } catch (error) {
    issues.push(issue(error instanceof HarnessError ? error.code : "E_PROFILES_INVALID", error.message));
    return { drift: true, issues, workflowDrift: false };
  }
  if (selection.workflowRef !== workflowRef) {
    issues.push(issue("E_PROFILE_DRIFT", `profile "${profileId}" now resolves to a different workflow`, { facts: { expected: workflowRef, actual: selection.workflowRef } }));
    return { drift: true, issues, workflowDrift: false };
  }
  let loaded;
  try {
    loaded = await loadWorkflowFor(selection.workflowRef);
  } catch (error) {
    issues.push(issue(error instanceof HarnessError ? error.code : "E_REFERENCE_INVALID", error.message));
    return { drift: true, issues, workflowDrift: false };
  }
  let workflowDrift = false;
  if (!loaded.report.valid) {
    issues.push(issue("E_WORKFLOW_INVALID", "active workflow is structurally invalid", { facts: loaded.report }));
    workflowDrift = true;
  } else if (loaded.digest !== active.workflow.digest) {
    issues.push(issue("E_WORKFLOW_DRIFT", "active workflow changed after work started", { facts: { expected: active.workflow.digest, actual: loaded.digest } }));
    workflowDrift = true;
  }
  if (issues.length > 0) return { drift: true, issues, workflowDrift };
  const catalog = loaded.catalog;
  const binding = await computeBinding({ root, selection, workflow: loaded.workflow, catalog });
  if (binding.issues.length > 0) return { drift: true, issues: binding.issues, workflowDrift };
  if (binding.bindingDigest !== active.bindingDigest) {
    issues.push(issue("E_BINDING_DRIFT", "active binding inputs changed after work started", { expected: active.bindingDigest, actual: binding.bindingDigest }));
    return { drift: true, issues, workflowDrift };
  }
  return { drift: false, issues: [], workflowDrift: false, loaded };
}
