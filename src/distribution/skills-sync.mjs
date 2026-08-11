import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { HarnessError, fail } from "../shared/errors.mjs";
import { assertRuntimeMutationAllowed, repositoryPaths, withRepositoryMutation } from "../shared/repository-guard.mjs";
import { loadState } from "../runtime/store.mjs";
import { digestValue } from "../runtime/kernel.mjs";
import {
  PINNED_SHA,
  RESERVED_SKILL_NAMES,
  SAFE_SKILL_NAME,
  SKILLS_GITIGNORE_HEADER,
  SKILLS_ROOT,
  SOURCES_DIRNAME,
  STAGING_DIRNAME,
  canonicalSourceSpec,
  digestEntries,
  expectedGitignore,
  inspectSkillDirectory,
  licenseLocalPath,
  parseExternalSkillDocument,
  readSkillLock,
  readSkillRegistry,
  registryMatchesLock,
  resolveSkillControlPaths,
  sha256Hex,
  sourceSpecEqual,
} from "../shared/skills.mjs";

// Skills mutation engine (lock-first v2, ported from prior art commit
// 0005c05e08277dd423a091d709bda9a302d196be and re-validated against the
// Runtime, RepositoryGuard and path model):
// - network fetches and tmp staging happen OUTSIDE the RepositoryGuard;
// - the commit (staging tree, lock-first write, renames, gitignore, verify)
//   happens INSIDE the guard after re-checking Active state, registry, the
//   prior lock and unmanaged target conflicts;
// - update is refused during any Active Work Item;
// - restore-only sync during Active requires the current lock digest to equal
//   the Active binding lock digest;
// - an interrupted lock-first commit leaves drift that a later sync repairs;
// - unregistered directories are never deleted or overwritten; the bundled
//   skill is never managed.

const PACKAGE_NAME = "ai-vibe-demo-kit";
const UPDATE_REPAIR = 'Run "ai-vibe-demo-kit skills update" to resolve sources and regenerate the lock.';
const SYNC_REPAIR = 'Run "ai-vibe-demo-kit skills sync" to materialize the locked skills.';
const STATUS_EXIT = new Map([
  ["ok", 0], ["planned", 0], ["applied", 0], ["idempotent", 0],
  ["manual-action-required", 1], ["conflict", 2], ["error", 2],
]);

const issue = (code, message, facts = null, repair = null) => ({ code, path: null, message, facts, repair });

function skillsError(code, message, exitCode = 1, repair = null) {
  return new HarnessError(code, message, { exitCode, repair });
}

// ---------------------------------------------------------------------------
// Git access: argument arrays, non-interactive, bounded timeouts.
// ---------------------------------------------------------------------------

class GitError extends Error {
  constructor(args, detail) {
    super(`git ${args.join(" ")}: ${detail}`);
    this.name = "GitError";
    this.args = args;
  }
}

export function createNodeGit({ timeoutMs = 120_000 } = {}) {
  return function git(args, options = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
      execFile(
        "git",
        args,
        {
          cwd: options.cwd,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          timeout: options.timeoutMs ?? timeoutMs,
          maxBuffer: 256 * 1024 * 1024,
          encoding: "buffer",
        },
        (error, stdout, stderr) => {
          if (error) {
            const detail = typeof stderr === "object" && stderr !== null && stderr.length > 0 ? stderr.toString("utf8").trim() : error.message;
            rejectPromise(new GitError(args, detail));
            return;
          }
          resolvePromise(stdout);
        },
      );
    });
  };
}

async function dirExists(path) {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lock construction and serialization (deterministic; no timestamps).
// ---------------------------------------------------------------------------

export function buildLock({ skillsRoot, resolvedSources }) {
  const sources = resolvedSources
    .map((entry) => ({
      ...canonicalSourceSpec(entry.spec),
      resolved: entry.resolved,
      licenseFiles: [...entry.licenseFiles]
        .map((file) => ({ path: file.path, sha256: file.sha256, localPath: licenseLocalPath(skillsRoot, entry.spec.id, file.path) }))
        .sort((a, b) => (a.path < b.path ? -1 : 1)),
      skills: [...entry.skills]
        .map((skill) => ({ name: skill.name, sourcePath: skill.sourcePath, treeDigest: skill.treeDigest }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 2, skillsRoot, sources };
}

export function serializeLock(lock) {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Git tree reading: ls-tree parsing, blob reads, frontmatter identity.
// ---------------------------------------------------------------------------

function parseLsTree(buffer) {
  const text = buffer.toString("utf8");
  const entries = [];
  for (const record of text.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    const meta = record.slice(0, tab).split(" ");
    entries.push({ mode: meta[0], type: meta[1], sha: meta[2], path: record.slice(tab + 1) });
  }
  return entries;
}

function frontmatterName(skillMarkdown) {
  const document = parseExternalSkillDocument(skillMarkdown);
  const name = document?.metadata?.name;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
}

function filterMatches(pattern, skill) {
  if (pattern.endsWith("/")) return skill.sourcePath.startsWith(pattern) || skill.sourcePath === pattern.slice(0, -1);
  const base = skill.sourcePath.includes("/") ? skill.sourcePath.slice(skill.sourcePath.lastIndexOf("/") + 1) : skill.sourcePath;
  return skill.name === pattern || base === pattern;
}

function selectedByFilters(skill, source) {
  if (source.only && !source.only.some((pattern) => filterMatches(pattern, skill))) return false;
  if (source.exclude && source.exclude.some((pattern) => filterMatches(pattern, skill))) return false;
  return true;
}

function refspecOf(track) {
  if (track.kind === "branch") return `refs/heads/${track.value}`;
  if (track.kind === "tag") return `refs/tags/${track.value}`;
  return track.value;
}

async function readBlobs({ git, repoDir, source, items }) {
  const blobs = new Map();
  const CHUNK = 16;
  for (let offset = 0; offset < items.length; offset += CHUNK) {
    await Promise.all(
      items.slice(offset, offset + CHUNK).map(async (item) => {
        try {
          blobs.set(item.sha, await git(["-C", repoDir, "cat-file", "blob", item.sha]));
        } catch (error) {
          throw skillsError("E_SKILLS_FETCH", `source "${source.id}": cannot read blob ${item.sha.slice(0, 12)}: ${error.message}; re-run with --force or report a sync bug.`);
        }
      }),
    );
  }
  return blobs;
}

// Discovery + filtering + validation + digests + licenses for one source at
// one resolved commit. Any directory depth holding a SKILL.md is a skill;
// discovery does not descend below the first SKILL.md in a directory chain.
async function stageSourceContent({ git, repoDir, source, resolved }) {
  if (source.path !== ".") {
    const probe = parseLsTree(await git(["-C", repoDir, "ls-tree", "-z", resolved, "--", source.path]));
    if (probe.length === 0 || probe[0].type !== "tree") {
      throw skillsError("E_SKILL_SOURCE_PATH_MISSING", `source "${source.id}": path "${source.path}" does not exist in ${source.repo} @ ${resolved.slice(0, 12)}; correct the path in the skills registry.`);
    }
  }
  const treeArgs = source.path === "." ? ["-C", repoDir, "ls-tree", "-r", "-z", resolved] : ["-C", repoDir, "ls-tree", "-r", "-z", resolved, "--", source.path];
  const tree = parseLsTree(await git(treeArgs));
  const prefix = source.path === "." ? "" : `${source.path}/`;
  const relativize = (path) => (prefix === "" ? path : path.slice(prefix.length));

  const skillMdByDir = new Map();
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const rel = relativize(entry.path);
    const base = rel.includes("/") ? rel.slice(rel.lastIndexOf("/") + 1) : rel;
    if (base !== "SKILL.md") continue;
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".";
    skillMdByDir.set(dir, { entry, rel });
  }
  const candidates = [...skillMdByDir.keys()].sort();
  const skillDirs = candidates.filter((dir) => !candidates.some((other) => other !== dir && dir.startsWith(`${other}/`)));
  if (skillDirs.length === 0) {
    throw skillsError("E_SKILL_NONE_SELECTED", `source "${source.id}": no directory with SKILL.md found under "${source.path}"; correct path or only/exclude in the skills registry.`);
  }

  const mdBlobs = await readBlobs({ git, repoDir, source, items: skillDirs.map((dir) => skillMdByDir.get(dir).entry) });
  let discovered = skillDirs.map((dir) => {
    const { entry, rel } = skillMdByDir.get(dir);
    const name = frontmatterName(mdBlobs.get(entry.sha).toString("utf8"));
    if (name === null) {
      throw skillsError("E_SKILL_FRONTMATTER_INVALID", `source "${source.id}": ${rel} has no parseable frontmatter "name"; add it upstream or exclude the directory.`);
    }
    return { name, sourcePath: dir };
  });

  discovered = discovered.filter((skill) => selectedByFilters(skill, source));
  if (discovered.length === 0) {
    throw skillsError("E_SKILL_NONE_SELECTED", `source "${source.id}": only/exclude filters leave no skills under "${source.path}"; adjust only/exclude in the skills registry.`);
  }
  for (const skill of discovered) {
    if (!SAFE_SKILL_NAME.test(skill.name) || RESERVED_SKILL_NAMES.has(skill.name)) {
      throw skillsError("E_SKILL_NAME_INVALID", `source "${source.id}": skill name "${skill.name}" (at "${skill.sourcePath}") is illegal or reserved; match [A-Za-z0-9._-]+ and avoid ".", "..", "${SOURCES_DIRNAME}", "${STAGING_DIRNAME}".`);
    }
  }

  const selectedDirs = discovered.map((skill) => skill.sourcePath);
  for (const entry of tree) {
    const rel = relativize(entry.path);
    const inside = selectedDirs.some((dir) => (dir === "." ? true : rel === dir || rel.startsWith(`${dir}/`)));
    if (!inside) continue;
    if (entry.mode === "120000" || entry.mode === "160000") {
      const kind = entry.mode === "120000" ? "symlink" : "git submodule";
      throw skillsError("E_SKILL_TREE_UNSAFE", `source "${source.id}": selected tree contains ${kind} at "${rel}"; remove it upstream or exclude the affected skill.`, 2);
    }
  }

  const blobItems = [];
  const skillEntrySpecs = discovered.map((skill) => {
    const dirPrefix = skill.sourcePath === "." ? "" : `${skill.sourcePath}/`;
    const entries = [];
    for (const entry of tree) {
      if (entry.type !== "blob" || entry.mode === "120000" || entry.mode === "160000") continue;
      const rel = relativize(entry.path);
      if (dirPrefix !== "" && !rel.startsWith(dirPrefix)) continue;
      const path = dirPrefix === "" ? rel : rel.slice(dirPrefix.length);
      if (path === "") continue;
      const item = { path, executable: (parseInt(entry.mode, 8) & 0o111) !== 0, sha: entry.sha };
      entries.push(item);
      blobItems.push(item);
    }
    return { skill, entries };
  });
  const blobs = await readBlobs({ git, repoDir, source, items: blobItems });
  const skills = skillEntrySpecs.map(({ skill, entries }) => {
    const full = entries.map((entry) => ({ path: entry.path, executable: entry.executable, bytes: blobs.get(entry.sha) }));
    return { name: skill.name, sourcePath: skill.sourcePath, treeDigest: digestEntries(full), entries: full };
  });

  const rootListing = parseLsTree(await git(["-C", repoDir, "ls-tree", "-z", resolved]));
  const licenseEntries = rootListing
    .filter((entry) => entry.type === "blob" && !entry.path.includes("/") && /^license/i.test(entry.path))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const licenseBlobs = await readBlobs({ git, repoDir, source, items: licenseEntries });
  const licenseFiles = licenseEntries.map((entry) => ({
    path: entry.path,
    sha256: sha256Hex(licenseBlobs.get(entry.sha)),
    bytes: licenseBlobs.get(entry.sha),
  }));
  return { spec: source, resolved, skills, licenseFiles, licenseDeclared: licenseEntries.length > 0 };
}

async function stageSource({ git, tmpParent, index, source, pinnedResolved }) {
  const repoDir = join(tmpParent, `source-${index}`);
  await mkdir(repoDir, { recursive: true });
  try {
    await git(["init", "-q", "--bare", repoDir]);
  } catch (error) {
    throw skillsError("E_SKILLS_FETCH", `source "${source.id}": cannot init temp repo: ${error.message}; ensure git is installed.`);
  }
  const refspec = pinnedResolved ?? refspecOf(source.track);
  try {
    await git(["-C", repoDir, "fetch", "-q", "--depth", "1", source.repo, refspec]);
  } catch (error) {
    throw skillsError("E_SKILLS_FETCH", `source "${source.id}" (${source.repo}, ${source.track.kind} "${source.track.value}"): fetch failed: ${error.message}; check network, Git credentials and that the ref exists.`);
  }
  let resolved;
  try {
    resolved = (await git(["-C", repoDir, "rev-parse", "FETCH_HEAD^{commit}"])).toString("utf8").trim();
  } catch (error) {
    throw skillsError("E_SKILLS_FETCH", `source "${source.id}": ${source.track.kind} "${source.track.value}" does not resolve to a commit object: ${error.message}; point track at a branch, tag or commit.`);
  }
  if (!PINNED_SHA.test(resolved)) throw skillsError("E_SKILLS_FETCH", `source "${source.id}": resolver returned non-SHA ${JSON.stringify(resolved)}; report this as a sync bug.`);
  if (pinnedResolved && resolved !== pinnedResolved) {
    throw skillsError("E_SKILLS_FETCH", `source "${source.id}": fetched ${resolved} but the lock requires ${pinnedResolved}; check that the repository still serves the locked commit.`);
  }
  return stageSourceContent({ git, repoDir, source, resolved });
}

// ---------------------------------------------------------------------------
// Local state assessment: READY or drift classification.
// ---------------------------------------------------------------------------

export async function assessLocalState(root, lock) {
  const driftSkills = [];
  const keptSkills = [];
  const unsafeSkills = [];
  for (const source of lock.sources) {
    for (const skill of source.skills) {
      const inspected = await inspectSkillDirectory(root, skill.name);
      if (inspected.state === "unsafe") {
        unsafeSkills.push({ source, skill });
      } else if (inspected.state === "present" && inspected.digest === skill.treeDigest) {
        keptSkills.push({ source, skill });
      } else {
        driftSkills.push({ source, skill, missing: inspected.state === "missing" });
      }
    }
  }
  const licenseIssues = [];
  for (const source of lock.sources) {
    for (const file of source.licenseFiles) {
      const target = join(root, file.localPath);
      let ok = false;
      try { ok = sha256Hex(await readFile(target)) === file.sha256; }
      catch { ok = false; }
      if (!ok) licenseIssues.push({ source, file });
    }
  }
  const allNames = lock.sources.flatMap((source) => source.skills.map((skill) => skill.name));
  let gitignoreOk = false;
  try { gitignoreOk = (await readFile(join(root, lock.skillsRoot, ".gitignore"), "utf8")) === expectedGitignore(allNames); }
  catch { gitignoreOk = false; }
  const ready = driftSkills.length === 0 && unsafeSkills.length === 0 && licenseIssues.length === 0 && gitignoreOk;
  return { ready, driftSkills, keptSkills, unsafeSkills, licenseIssues, gitignoreOk };
}

// ---------------------------------------------------------------------------
// Commit (inside the RepositoryGuard): staging tree -> lock-first -> renames
// -> licenses -> gitignore -> end-to-end verify.
// ---------------------------------------------------------------------------

async function writeStagedTree({ stagingRoot, stagedSources }) {
  for (const staged of stagedSources) {
    for (const skill of staged.skills) {
      const base = join(stagingRoot, "skills", skill.name);
      for (const entry of skill.entries) {
        const target = join(base, ...entry.path.split("/"));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, entry.bytes);
        await chmod(target, entry.executable ? 0o755 : 0o644);
      }
    }
    if (staged.licenseFiles.length > 0) {
      const licenseBase = join(stagingRoot, "sources", staged.spec.id, "licenses");
      for (const file of staged.licenseFiles) {
        const target = join(licenseBase, ...file.path.split("/"));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.bytes);
        await chmod(target, 0o644);
      }
    }
  }
}

async function commitTransaction({ root, control, lock, priorLock, stagedBySourceId, writeLock, allowPrune, events }) {
  const skillsRootAbs = join(root, SKILLS_ROOT);
  const stagingRoot = join(skillsRootAbs, STAGING_DIRNAME);
  await rm(stagingRoot, { recursive: true, force: true });
  const stagedSources = [...stagedBySourceId.values()];
  await writeStagedTree({ stagingRoot, stagedSources });
  await mkdir(skillsRootAbs, { recursive: true });

  if (allowPrune && priorLock) {
    const newNames = new Set(lock.sources.flatMap((source) => source.skills.map((skill) => skill.name)));
    const newIds = new Set(lock.sources.map((source) => source.id));
    for (const source of priorLock.sources) {
      for (const skill of source.skills) {
        if (!newNames.has(skill.name)) {
          await rm(join(skillsRootAbs, skill.name), { recursive: true, force: true });
          events.push({ type: "PRUNED", name: skill.name });
        }
      }
      if (!newIds.has(source.id)) await rm(join(skillsRootAbs, SOURCES_DIRNAME, source.id), { recursive: true, force: true });
    }
  }

  // Lock lands first: an interrupted commit leaves "new lock + old dirs"
  // drift that a later plain sync repairs.
  if (writeLock) {
    const serialized = serializeLock(lock);
    const lockPath = join(root, control.lockPath);
    let current = null;
    try { current = await readFile(lockPath, "utf8"); }
    catch { current = null; }
    if (current !== serialized) {
      await mkdir(dirname(lockPath), { recursive: true });
      await writeFile(lockPath, serialized);
    }
  }

  for (const source of lock.sources) {
    const staged = stagedBySourceId.get(source.id);
    for (const skill of source.skills) {
      const target = join(skillsRootAbs, skill.name);
      const inspected = await inspectSkillDirectory(root, skill.name);
      if (inspected.state === "present" && inspected.digest === skill.treeDigest) {
        events.push({ type: "KEPT", name: skill.name, resolved: source.resolved });
        continue;
      }
      if (!staged) {
        throw skillsError("E_SKILLS_VERIFY_FAILED", `skill "${skill.name}" drifted but source "${source.id}" was not staged; re-run skills sync --force.`);
      }
      await rm(target, { recursive: true, force: true });
      await rename(join(stagingRoot, "skills", skill.name), target);
      events.push({ type: "SYNCED", name: skill.name, resolved: source.resolved });
    }
    if (staged) {
      const licenseBase = join(skillsRootAbs, SOURCES_DIRNAME, source.id, "licenses");
      await rm(licenseBase, { recursive: true, force: true });
      if (staged.licenseFiles.length > 0) {
        await mkdir(dirname(licenseBase), { recursive: true });
        await rename(join(stagingRoot, "sources", source.id, "licenses"), licenseBase);
      } else {
        await rm(join(skillsRootAbs, SOURCES_DIRNAME, source.id), { recursive: true, force: true });
      }
    }
  }

  const allNames = lock.sources.flatMap((source) => source.skills.map((skill) => skill.name));
  const gitignorePath = join(skillsRootAbs, ".gitignore");
  const expected = expectedGitignore(allNames);
  let currentGitignore = null;
  try { currentGitignore = await readFile(gitignorePath, "utf8"); }
  catch { currentGitignore = null; }
  if (currentGitignore !== expected) await writeFile(gitignorePath, expected);

  for (const source of lock.sources) {
    for (const skill of source.skills) {
      const inspected = await inspectSkillDirectory(root, skill.name);
      if (inspected.state !== "present" || inspected.digest !== skill.treeDigest) {
        throw skillsError("E_SKILLS_VERIFY_FAILED", `skill "${skill.name}" digest mismatch after materialize (expected ${skill.treeDigest.slice(0, 12)}); re-run skills sync to repair the drifted directory.`);
      }
    }
  }
  await rm(stagingRoot, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Planning (outside the guard): read controls, assess, stage, build lock.
// ---------------------------------------------------------------------------

async function planMutation({ root, control, registry, priorLock, update, force, git, events }) {
  const stagingParent = await mkdtemp(join(tmpdir(), "ai-vibe-demo-kit-skills-"));
  try {
    const stagedBySourceId = new Map();
    const local = priorLock && registryMatchesLock(registry, priorLock) ? await assessLocalState(root, priorLock) : null;
    const priorById = new Map((priorLock?.sources ?? []).map((source) => [source.id, source]));
    const driftSourceIds = new Set((local?.driftSkills ?? []).map((item) => item.source.id));
    for (const entry of local?.licenseIssues ?? []) driftSourceIds.add(entry.source.id);

    for (const [index, source] of registry.sources.entries()) {
      const prior = priorById.get(source.id);
      const specUnchanged = prior && sourceSpecEqual(source, prior);
      if (!update) {
        const needsStage = force || driftSourceIds.has(source.id);
        if (needsStage) stagedBySourceId.set(source.id, await stageSource({ git, tmpParent: stagingParent, index, source, pinnedResolved: prior.resolved }));
        continue;
      }
      const staged = await stageSource({ git, tmpParent: stagingParent, index, source, pinnedResolved: null });
      const unchanged = !force && specUnchanged && prior.resolved === staged.resolved && local?.ready;
      if (!unchanged) stagedBySourceId.set(source.id, staged);
      if (!staged.licenseDeclared) {
        events.push({ type: "WARNING", code: "W_SKILL_LICENSE_MISSING", message: `source "${source.id}" declares no repository-level LICENSE*; confirm upstream licensing before redistributing.` });
      }
    }

    const effectiveSources = registry.sources.map((source) => {
      const staged = stagedBySourceId.get(source.id);
      if (staged) return staged;
      const prior = priorById.get(source.id);
      return { spec: source, resolved: prior.resolved, skills: prior.skills, licenseFiles: prior.licenseFiles };
    });
    const nameOwners = new Map();
    for (const staged of effectiveSources) {
      for (const skill of staged.skills) {
        const owner = nameOwners.get(skill.name);
        if (owner) {
          throw skillsError("E_SKILL_NAME_CONFLICT", `skill name "${skill.name}" is produced by both "${owner.id}" (path "${owner.sourcePath}") and "${staged.spec.id}" (path "${skill.sourcePath}"); disambiguate with only/exclude in the skills registry.`);
        }
        nameOwners.set(skill.name, { id: staged.spec.id, sourcePath: skill.sourcePath });
      }
    }

    const lock = update
      ? buildLock({
          skillsRoot: SKILLS_ROOT,
          resolvedSources: effectiveSources.map((staged) => ({ spec: staged.spec, resolved: staged.resolved, skills: staged.skills, licenseFiles: staged.licenseFiles })),
        })
      : priorLock;
    return { stagedBySourceId, effectiveSources, lock, local, priorById };
  } finally {
    await rm(stagingParent, { recursive: true, force: true });
  }
}

async function assertUnmanagedTargetsSafe(root, lock, priorLock) {
  const rootsMatch = priorLock?.skillsRoot === SKILLS_ROOT;
  const priorNames = new Set(rootsMatch ? (priorLock?.sources ?? []).flatMap((source) => source.skills.map((skill) => skill.name)) : []);
  for (const source of lock.sources) {
    for (const skill of source.skills) {
      if (priorNames.has(skill.name)) continue;
      if (await dirExists(join(root, SKILLS_ROOT, skill.name))) {
        throw skillsError("E_SKILL_UNMANAGED_CONFLICT", `refusing to overwrite ${SKILLS_ROOT}/${skill.name}: it exists but is not managed by the lock; remove or rename the directory by hand, or rename the incoming skill.`, 2);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Envelope plumbing (same shape as the Distribution Lifecycle envelope).
// ---------------------------------------------------------------------------

function envelope(command, root, packageVersion, plan) {
  return {
    schemaVersion: 1,
    command,
    status: plan.status,
    target: root,
    applied: plan.applied === true,
    package: { name: PACKAGE_NAME, version: packageVersion, installedVersion: plan.installedVersion ?? null },
    transaction: null,
    changes: plan.changes ?? [],
    readiness: plan.readiness ?? null,
    warnings: plan.warnings ?? [],
    errors: plan.errors ?? [],
    nextActions: plan.nextActions ?? [],
  };
}

function errorEnvelope(command, root, packageVersion, error) {
  const normalized = error instanceof HarnessError ? error : new HarnessError("E_IO", error instanceof Error ? error.message : String(error));
  const status = normalized.exitCode === 1 ? "manual-action-required" : "conflict";
  return envelope(command, root, packageVersion, {
    status,
    errors: [issue(normalized.code, normalized.message, normalized.facts, normalized.repair)],
  });
}

function eventChanges(events) {
  const changes = [];
  for (const event of events) {
    if (event.type === "SYNCED") changes.push({ action: "replace", path: `${SKILLS_ROOT}/${event.name}`, kind: "skill", before: null, after: { resolved: event.resolved }, reason: null });
    else if (event.type === "KEPT") changes.push({ action: "keep", path: `${SKILLS_ROOT}/${event.name}`, kind: "skill", before: null, after: { resolved: event.resolved }, reason: null });
    else if (event.type === "PRUNED") changes.push({ action: "remove", path: `${SKILLS_ROOT}/${event.name}`, kind: "skill", before: null, after: null, reason: null });
    else if (event.type === "UPDATED") changes.push({ action: "update-source", path: null, kind: "source", before: { resolved: event.from }, after: { resolved: event.to }, reason: `source ${event.sourceId}: +${event.added.length} -${event.removed.length} ~${event.changed.length}` });
  }
  return changes;
}

function eventWarnings(events) {
  return events.filter((entry) => entry.type === "WARNING").map((entry) => issue(entry.code, entry.message));
}

// ---------------------------------------------------------------------------
// skills status
// ---------------------------------------------------------------------------

async function skillsStatus({ root, control, packageVersion }) {
  const base = { control, registryDigest: null, lockDigest: null, configured: true, valid: true, ready: false, skills: [] };
  let registry;
  try {
    registry = await readSkillRegistry(root, control);
  } catch (error) {
    if (error instanceof HarnessError && error.code === "E_SKILLS_REGISTRY_MISSING") {
      const lock = await readSkillLock(root, control, { missing: "null" }).catch(() => null);
      if (!lock) {
        return envelope("skills status", root, packageVersion, {
          status: "ok",
          readiness: { ...base, configured: false, ready: true },
        });
      }
    }
    const code = error instanceof HarnessError ? error.code : "E_SKILLS_REGISTRY_INVALID";
    return envelope("skills status", root, packageVersion, {
      status: "conflict",
      readiness: { ...base, valid: false },
      errors: [issue(code, error.message)],
    });
  }
  const registryDigest = digestValue(registry);
  let lock = null;
  try {
    lock = await readSkillLock(root, control, { missing: "null" });
  } catch (error) {
    return envelope("skills status", root, packageVersion, {
      status: "conflict",
      readiness: { ...base, registryDigest, valid: false },
      errors: [issue(error.code ?? "E_SKILLS_LOCK_INVALID", error.message)],
    });
  }
  const lockDigest = lock ? digestValue(lock) : null;
  const withDigests = { ...base, registryDigest, lockDigest };
  if (registry.sources.length === 0 && !lock) {
    return envelope("skills status", root, packageVersion, { status: "ok", readiness: { ...withDigests, configured: false, ready: true } });
  }
  if (registry.sources.length === 0) {
    return envelope("skills status", root, packageVersion, {
      status: "manual-action-required",
      readiness: withDigests,
      errors: [issue("E_SKILLS_LOCK_STALE", "skills registry declares no sources but the lock still manages skills", null, UPDATE_REPAIR)],
      nextActions: [`ai-vibe-demo-kit skills update --target ${root} --json`],
    });
  }
  if (!lock) {
    return envelope("skills status", root, packageVersion, {
      status: "manual-action-required",
      readiness: withDigests,
      errors: [issue("E_SKILLS_LOCK_MISSING", `skills lock does not exist: ${control.lockPath}`, null, UPDATE_REPAIR)],
      nextActions: [`ai-vibe-demo-kit skills update --target ${root} --json`],
    });
  }
  if (!registryMatchesLock(registry, lock)) {
    return envelope("skills status", root, packageVersion, {
      status: "manual-action-required",
      readiness: withDigests,
      errors: [issue("E_SKILLS_LOCK_STALE", "skills registry source specs differ from the lock", null, UPDATE_REPAIR)],
      nextActions: [`ai-vibe-demo-kit skills update --target ${root} --json`],
    });
  }
  const local = await assessLocalState(root, lock);
  if (local.unsafeSkills.length > 0) {
    return envelope("skills status", root, packageVersion, {
      status: "conflict",
      readiness: { ...withDigests, valid: false },
      errors: local.unsafeSkills.map((entry) => issue("E_SKILL_TREE_UNSAFE", `skill "${entry.skill.name}" materialization contains a symlink or non-regular file`, { skill: entry.skill.name })),
    });
  }
  const skills = lock.sources.flatMap((source) => source.skills.map((skill) => ({
    name: skill.name,
    sourceId: source.id,
    state: local.keptSkills.some((kept) => kept.skill === skill) ? "ready" : local.driftSkills.find((drift) => drift.skill === skill)?.missing ? "missing" : "drifted",
  })));
  if (!local.ready) {
    const drifted = local.driftSkills.map((entry) => entry.skill.name);
    if (!local.gitignoreOk) drifted.push(".gitignore");
    for (const entry of local.licenseIssues) drifted.push(entry.file.localPath);
    return envelope("skills status", root, packageVersion, {
      status: "manual-action-required",
      readiness: { ...withDigests, skills },
      errors: [issue("E_SKILL_ENTITY_DRIFT", "materialized skills differ from the lock", { drifted }, SYNC_REPAIR)],
      nextActions: [`ai-vibe-demo-kit skills sync --target ${root} --json`],
    });
  }
  return envelope("skills status", root, packageVersion, {
    status: "ok",
    readiness: { ...withDigests, ready: true, skills },
  });
}

// ---------------------------------------------------------------------------
// skills sync / update
// ---------------------------------------------------------------------------

async function skillsMutation({ root, control, packageVersion, update, force, git }) {
  const command = update ? "skills update" : "skills sync";
  const events = [];
  const registry = await readSkillRegistry(root, control);
  const priorLock = await readSkillLock(root, control, { missing: "null" });

  if (registry.sources.length === 0 && !priorLock) {
    return envelope(command, root, packageVersion, { status: "idempotent", readiness: { configured: false, valid: true, ready: true } });
  }

  if (registry.sources.length === 0) {
    if (!update) {
      throw skillsError("E_SKILLS_LOCK_STALE", "skills registry declares no sources but the lock still manages skills", 1, UPDATE_REPAIR);
    }
    return withRepositoryMutation(root, async (paths) => {
      await assertRuntimeMutationAllowed(paths);
      const state = await loadState(paths.root);
      if (state.active) throw skillsError("E_SKILLS_ACTIVE", "skills update is refused while a Work Item is active", 2, "Complete or abort the active Work Item first.");
      const currentLock = await readSkillLock(paths.root, control, { missing: "null" });
      if (JSON.stringify(currentLock) !== JSON.stringify(priorLock)) throw skillsError("E_SKILLS_CONCURRENT", "skills lock changed while planning; re-run the command", 2);
      for (const source of priorLock.sources) {
        for (const skill of source.skills) {
          await rm(join(paths.root, SKILLS_ROOT, skill.name), { recursive: true, force: true });
          events.push({ type: "PRUNED", name: skill.name });
        }
        await rm(join(paths.root, SKILLS_ROOT, SOURCES_DIRNAME, source.id), { recursive: true, force: true });
      }
      await rm(join(paths.root, control.lockPath), { force: true });
      const gitignorePath = join(paths.root, SKILLS_ROOT, ".gitignore");
      try {
        if ((await readFile(gitignorePath, "utf8")).startsWith(SKILLS_GITIGNORE_HEADER)) await rm(gitignorePath);
      } catch { /* absent gitignore is fine */ }
      return envelope(command, root, packageVersion, {
        status: "applied",
        applied: true,
        changes: eventChanges(events),
        readiness: { configured: false, valid: true, ready: true },
      });
    });
  }

  if (!priorLock && !update) throw skillsError("E_SKILLS_LOCK_MISSING", `skills lock does not exist: ${control.lockPath}`, 1, UPDATE_REPAIR);
  if (priorLock && !registryMatchesLock(registry, priorLock) && !update) {
    throw skillsError("E_SKILLS_LOCK_STALE", "skills registry source specs differ from the lock", 1, UPDATE_REPAIR);
  }

  // update is refused during any Active Work Item — even when resolution
  // would end up a no-op; the guard re-checks this before every commit.
  if (update && (await loadState(root)).active) {
    throw skillsError("E_SKILLS_ACTIVE", "skills update is refused while a Work Item is active", 2, "Complete or abort the active Work Item first.");
  }

  await rm(join(root, SKILLS_ROOT, STAGING_DIRNAME), { recursive: true, force: true });
  try {
    const plan = await planMutation({ root, control, registry, priorLock, update, force, git, events });
    const { stagedBySourceId, lock, local, priorById } = plan;

    // READY / UNCHANGED fast paths: zero writes, no guard needed.
    if (!update && !force && local?.ready) {
      for (const item of local.keptSkills) events.push({ type: "KEPT", name: item.skill.name, resolved: item.source.resolved });
      return envelope(command, root, packageVersion, {
        status: "idempotent",
        changes: eventChanges(events),
        readiness: { configured: true, valid: true, ready: true },
      });
    }
    if (update && !force && stagedBySourceId.size === 0 && local?.ready) {
      for (const source of registry.sources) events.push({ type: "UNCHANGED", sourceId: source.id, resolved: priorById.get(source.id).resolved });
      for (const item of local.keptSkills) events.push({ type: "KEPT", name: item.skill.name, resolved: item.source.resolved });
      return envelope(command, root, packageVersion, {
        status: "idempotent",
        changes: eventChanges(events),
        readiness: { configured: true, valid: true, ready: true },
      });
    }

    if (update) {
      for (const source of registry.sources) {
        if (!stagedBySourceId.has(source.id)) continue;
        const staged = stagedBySourceId.get(source.id);
        const prior = priorById.get(source.id);
        const priorSkills = new Map((prior?.skills ?? []).map((skill) => [skill.name, skill.treeDigest]));
        const nextSkills = new Map(staged.skills.map((skill) => [skill.name, skill.treeDigest]));
        events.push({
          type: "UPDATED",
          sourceId: source.id,
          from: prior?.resolved ?? null,
          to: staged.resolved,
          added: [...nextSkills.keys()].filter((name) => !priorSkills.has(name)),
          removed: [...priorSkills.keys()].filter((name) => !nextSkills.has(name)),
          changed: [...nextSkills.keys()].filter((name) => priorSkills.has(name) && priorSkills.get(name) !== nextSkills.get(name)),
        });
      }
    }

    const registrySnapshot = JSON.stringify(registry);
    const priorLockSnapshot = JSON.stringify(priorLock);
    return await withRepositoryMutation(root, async (paths) => {
      await assertRuntimeMutationAllowed(paths);
      const state = await loadState(paths.root);
      if (state.active) {
        if (update) throw skillsError("E_SKILLS_ACTIVE", "skills update is refused while a Work Item is active", 2, "Complete or abort the active Work Item first.");
        const currentLockDigest = digestValue(priorLock);
        const bound = state.active.bindingLockDigest ?? null;
        if (!bound || bound !== currentLockDigest) {
          throw skillsError("E_SKILLS_ACTIVE", "restore-only skills sync during an Active Work Item requires the lock to match the Active binding", 2, "Run sync after the Work Item closes, or abort it first.");
        }
      }
      // Re-read controls inside the lock: concurrent edits fail closed.
      const freshRegistry = await readSkillRegistry(paths.root, control);
      const freshLock = await readSkillLock(paths.root, control, { missing: "null" });
      if (JSON.stringify(freshRegistry) !== registrySnapshot || JSON.stringify(freshLock) !== priorLockSnapshot) {
        throw skillsError("E_SKILLS_CONCURRENT", "skills registry or lock changed while planning; re-run the command", 2);
      }
      if (local?.unsafeSkills?.length > 0) {
        throw skillsError("E_SKILL_TREE_UNSAFE", `skill "${local.unsafeSkills[0].skill.name}" materialization contains a symlink or non-regular file`, 2);
      }
      await assertUnmanagedTargetsSafe(paths.root, lock, priorLock);
      await commitTransaction({ root: paths.root, control, lock, priorLock, stagedBySourceId, writeLock: update, allowPrune: update, events });
      const total = lock.sources.reduce((count, source) => count + source.skills.length, 0);
      return envelope(command, root, packageVersion, {
        status: "applied",
        applied: true,
        changes: eventChanges(events),
        warnings: eventWarnings(events),
        readiness: { configured: true, valid: true, ready: true, skills: total },
      });
    });
  } finally {
    await rm(join(root, SKILLS_ROOT, STAGING_DIRNAME), { recursive: true, force: true });
  }
}

export async function runSkillsCommand({ root, action, force = false, packageVersion, git = createNodeGit() }) {
  const command = `skills ${action}`;
  try {
    let resolvedRoot = await realpath(root);
    try {
      resolvedRoot = (await repositoryPaths(resolvedRoot)).root;
    } catch (error) {
      if (action !== "status") throw error;
    }
    const control = await resolveSkillControlPaths(resolvedRoot);
    if (action === "status") return await skillsStatus({ root: resolvedRoot, control, packageVersion });
    if (action === "sync") return await skillsMutation({ root: resolvedRoot, control, packageVersion, update: false, force, git });
    if (action === "update") return await skillsMutation({ root: resolvedRoot, control, packageVersion, update: true, force, git });
    fail("E_USAGE", `unknown skills action: ${action}`);
  } catch (error) {
    return errorEnvelope(command, root, packageVersion, error);
  }
}

export function exitCodeForSkillsStatus(status) {
  return STATUS_EXIT.get(status) ?? 2;
}
