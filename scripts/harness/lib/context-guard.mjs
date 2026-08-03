// context-guard.mjs — directory-local context indexes and write-precondition receipts.

import { isUtf8 } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { E } from "./errors.mjs";
import { git } from "./git.mjs";

const INDEX_NAME = ".harness-index.json";
const INDEX_VERSION = 1;
const RECEIPT_VERSION = 1;
const GLOB_CHARS = /[*?[\]{}]/;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const CANONICAL_ROOTS = new Map();
const MAX_INDEX_BYTES = 64 * 1024;
const MAX_DEPENDENCY_BYTES = 512 * 1024;
const MAX_CLOSURE_BYTES = 2 * 1024 * 1024;
const GIT_PRIVATE_ROOTS = new Map();

function canonicalRepoRoot(root) {
  let pending = CANONICAL_ROOTS.get(root);
  if (pending === undefined) {
    pending = realpath(root);
    CANONICAL_ROOTS.set(root, pending);
  }
  return pending;
}

function sha256(data) {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

function slash(path) {
  return path.split(sep).join("/");
}

function inside(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function ownRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function normalizeCodePath(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw E.CONTEXT_CONFIG_INVALID(`${label} 必须是非空字符串`);
  const path = value.trim();
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path)) throw E.CONTEXT_CONFIG_INVALID(`${label} 不接受绝对路径：${value}`);
  if (path.includes("\\") || GLOB_CHARS.test(path)) throw E.CONTEXT_CONFIG_INVALID(`${label} 不接受反斜杠或 glob：${value}`);
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw E.CONTEXT_CONFIG_INVALID(`${label} 必须是规范化仓库相对路径：${value}`);
  }
  return segments.join("/");
}

function normalizeFileKey(value, indexPath) {
  if (typeof value !== "string" || value.trim() === "") throw E.CONTEXT_INDEX_INVALID(indexPath, "files key 必须是非空字符串");
  const path = value.trim();
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.includes("\\") || GLOB_CHARS.test(path)) {
    throw E.CONTEXT_INDEX_INVALID(indexPath, `files key 必须是无 glob 的相对路径：${value}`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw E.CONTEXT_INDEX_INVALID(indexPath, `files key 必须规范化：${value}`);
  }
  return segments.join("/");
}

function normalizeTarget(root, value) {
  if (typeof value !== "string" || value.trim() === "") throw E.CONTEXT_TARGET_INVALID(String(value));
  const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value);
  const path = slash(relative(root, absolute));
  if (path === "" || path === ".." || path.startsWith("../")) throw E.CONTEXT_TARGET_INVALID(value);
  return path;
}

function absoluteInside(path, root) {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function gitPrivateRoots(root) {
  let pending = GIT_PRIVATE_ROOTS.get(root);
  if (pending === undefined) {
    pending = (async () => {
      const [gitDirRaw, commonDirRaw] = await Promise.all([
        git(root, ["rev-parse", "--absolute-git-dir"]),
        git(root, ["rev-parse", "--git-common-dir"]),
      ]);
      const lexical = [join(root, ".git"), gitDirRaw.trim(), commonDirRaw.trim()].map((path) =>
        isAbsolute(path) ? resolve(path) : resolve(root, path),
      );
      const canonical = await Promise.all(
        lexical.map(async (path) => {
          try {
            return await realpath(path);
          } catch (error) {
            if (error?.code === "ENOENT") return path;
            throw error;
          }
        }),
      );
      return [...new Set([...lexical, ...canonical])];
    })();
    GIT_PRIVATE_ROOTS.set(root, pending);
  }
  return pending;
}

async function isGitPrivate(root, absolute) {
  const canonical = await realpath(absolute);
  return (await gitPrivateRoots(root)).some(
    (privateRoot) => absoluteInside(absolute, privateRoot) || absoluteInside(canonical, privateRoot),
  );
}

function pathFailure(kind, path, detail) {
  if (kind === "target") throw E.CONTEXT_TARGET_INVALID(path);
  if (kind === "config") throw E.CONTEXT_CONFIG_INVALID(`${path}：${detail}`);
  if (kind === "index") throw E.CONTEXT_INDEX_INVALID(path, detail);
  throw E.CONTEXT_REFERENCE_INVALID(path, path, detail);
}

async function inspectPath(root, path, kind, { allowMissing = false, expected = "file" } = {}) {
  let absolute = root;
  let finalInfo = null;
  const segments = path.split("/");
  for (const [index, segment] of segments.entries()) {
    absolute = join(absolute, segment);
    try {
      finalInfo = await lstat(absolute);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      if (allowMissing) return null;
      if (kind === "index") throw E.CONTEXT_INDEX_REQUIRED(path);
      pathFailure(kind, path, "路径不存在");
    }
    if (finalInfo.isSymbolicLink()) pathFailure(kind, path, `路径分量 ${segments.slice(0, index + 1).join("/")} 是 symlink`);
    if (index < segments.length - 1 && !finalInfo.isDirectory()) {
      pathFailure(kind, path, `路径分量 ${segments.slice(0, index + 1).join("/")} 不是目录`);
    }
  }
  if (expected === "file" && !finalInfo.isFile()) pathFailure(kind, path, "必须是普通文件");
  if (expected === "directory" && !finalInfo.isDirectory()) pathFailure(kind, path, "必须是普通目录");
  if (!absoluteInside(await realpath(absolute), await canonicalRepoRoot(root))) pathFailure(kind, path, "canonical path 越出仓库");
  return { absolute, info: finalInfo };
}

async function assertSafeTarget(root, target) {
  await inspectPath(root, target, "target", { allowMissing: true, expected: "file" });
}

function normalizeReference(root, indexDir, value, indexPath) {
  if (typeof value !== "string" || value.trim() === "") {
    throw E.CONTEXT_REFERENCE_INVALID(indexPath, String(value), "引用必须是非空字符串");
  }
  const ref = value.trim();
  if (isAbsolute(ref) || /^[A-Za-z]:/.test(ref) || ref.includes("\\") || GLOB_CHARS.test(ref)) {
    throw E.CONTEXT_REFERENCE_INVALID(indexPath, value, "只接受无 glob 的相对文件路径");
  }
  const absolute = resolve(root, indexDir, ref);
  const path = slash(relative(root, absolute));
  if (path === "" || path === ".." || path.startsWith("../")) {
    throw E.CONTEXT_REFERENCE_INVALID(indexPath, value, "引用解析后越出仓库");
  }
  return path;
}

function requireStringArray(value, indexPath, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw E.CONTEXT_INDEX_INVALID(indexPath, `${field} 必须是非空字符串数组`);
  }
  return value;
}

function parseIndex(buffer, indexPath, root) {
  let text;
  try {
    text = UTF8.decode(buffer);
  } catch {
    throw E.CONTEXT_INDEX_INVALID(indexPath, "索引不是合法 UTF-8");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw E.CONTEXT_INDEX_INVALID(indexPath, `JSON 无法解析：${error.message}`);
  }
  if (!ownRecord(value)) throw E.CONTEXT_INDEX_INVALID(indexPath, "索引必须是 JSON object");
  const extra = unknownKeys(value, new Set(["version", "summary", "readBeforeWrite", "files"]));
  if (extra.length > 0) throw E.CONTEXT_INDEX_INVALID(indexPath, `未知字段：${extra.join("、")}`);
  if (value.version !== INDEX_VERSION) throw E.CONTEXT_INDEX_INVALID(indexPath, `version 必须是 ${INDEX_VERSION}`);
  if (typeof value.summary !== "string" || value.summary.trim() === "") {
    throw E.CONTEXT_INDEX_INVALID(indexPath, "summary 必须是非空字符串");
  }
  const indexDir = posix.dirname(indexPath);
  const defaults = requireStringArray(value.readBeforeWrite, indexPath, "readBeforeWrite").map((entry) =>
    normalizeReference(root, indexDir, entry, indexPath),
  );
  const files = value.files ?? {};
  if (!ownRecord(files)) throw E.CONTEXT_INDEX_INVALID(indexPath, "files 必须是 object");
  const normalizedFiles = new Map();
  for (const [rawKey, rawEntry] of Object.entries(files)) {
    const key = normalizeFileKey(rawKey, indexPath);
    if (!ownRecord(rawEntry)) throw E.CONTEXT_INDEX_INVALID(indexPath, `files.${rawKey} 必须是 object`);
    const entryExtra = unknownKeys(rawEntry, new Set(["readBeforeWrite"]));
    if (entryExtra.length > 0) throw E.CONTEXT_INDEX_INVALID(indexPath, `files.${rawKey} 未知字段：${entryExtra.join("、")}`);
    normalizedFiles.set(
      key,
      requireStringArray(rawEntry.readBeforeWrite, indexPath, `files.${rawKey}.readBeforeWrite`).map((entry) =>
        normalizeReference(root, indexDir, entry, indexPath),
      ),
    );
  }
  return { summary: value.summary.trim(), defaults, files: normalizedFiles };
}

async function regularFile(root, path, kind) {
  const inspected = await inspectPath(root, path, kind, { expected: "file" });
  if (await isGitPrivate(root, inspected.absolute)) {
    if (kind === "index") throw E.CONTEXT_INDEX_INVALID(path, "Git private path 不能作为目录索引");
    throw E.CONTEXT_REFERENCE_INVALID(path, path, "Git private path 不能作为前置上下文");
  }
  const limit = kind === "index" ? MAX_INDEX_BYTES : MAX_DEPENDENCY_BYTES;
  if (inspected.info.size > limit) throw E.CONTEXT_FILE_TOO_LARGE(path, limit);
  return readFile(inspected.absolute);
}

function assertTextDependency(buffer, path) {
  if (buffer.includes(0) || !isUtf8(buffer)) throw E.CONTEXT_REFERENCE_NOT_TEXT(path);
}

async function codeRoots(root, config) {
  const contextIndex = config.contextIndex;
  if (contextIndex === undefined) return [];
  if (!ownRecord(contextIndex)) throw E.CONTEXT_CONFIG_INVALID("contextIndex 必须是 object");
  const extra = unknownKeys(contextIndex, new Set(["codeRoots"]));
  if (extra.length > 0) throw E.CONTEXT_CONFIG_INVALID(`contextIndex 未知字段：${extra.join("、")}`);
  if (!Array.isArray(contextIndex.codeRoots)) throw E.CONTEXT_CONFIG_INVALID("contextIndex.codeRoots 必须是数组");
  const roots = contextIndex.codeRoots.map((entry, index) => normalizeCodePath(entry, `contextIndex.codeRoots[${index}]`));
  if (new Set(roots).size !== roots.length) throw E.CONTEXT_CONFIG_INVALID("contextIndex.codeRoots 不能重复");
  for (const current of roots) {
    const inspected = await inspectPath(root, current, "config", { expected: "directory" });
    if (await isGitPrivate(root, inspected.absolute)) throw E.CONTEXT_CONFIG_INVALID(`Code Root 不能位于 Git private path：${current}`);
    for (const other of roots) {
      if (current !== other && inside(current, other)) {
        throw E.CONTEXT_CONFIG_INVALID(`Code Roots 不能重叠：${other} 与 ${current}`);
      }
    }
  }
  return roots.sort();
}

function matchingRoot(target, roots) {
  return roots.find((root) => inside(target, root)) ?? null;
}

function indexDirectories(codeRoot, target) {
  const targetDir = posix.dirname(target);
  const suffix = targetDir === codeRoot ? [] : targetDir.slice(codeRoot.length + 1).split("/");
  const directories = [codeRoot];
  for (const segment of suffix) directories.push(`${directories[directories.length - 1]}/${segment}`);
  return directories;
}

async function loadIndex(root, path, required) {
  let buffer;
  try {
    buffer = await regularFile(root, path, "index");
  } catch (error) {
    if (!required && error?.code === "E_CONTEXT_INDEX_REQUIRED") return null;
    throw error;
  }
  return { path, sha256: sha256(buffer), ...parseIndex(buffer, path, root) };
}

async function resolveContextClosure(root, roots, target) {
  const indexes = new Map();
  const indexCache = new Map();
  const dependencies = new Map();
  let dependencyBytes = 0;

  const cachedIndex = async (path, required) => {
    let pending = indexCache.get(path);
    if (pending === undefined) {
      pending = loadIndex(root, path, required);
      indexCache.set(path, pending);
    }
    return pending;
  };

  const visitTarget = async (currentTarget, stack) => {
    const codeRoot = matchingRoot(currentTarget, roots);
    if (codeRoot === null) return;
    const direct = [];
    for (const directory of indexDirectories(codeRoot, currentTarget)) {
      const indexPath = `${directory}/${INDEX_NAME}`;
      const index = await cachedIndex(indexPath, directory === codeRoot);
      if (index === null) continue;
      if (!indexes.has(indexPath)) indexes.set(indexPath, index);
      direct.push(...index.defaults.map((path) => ({ path, index: indexPath })));
      const fileKey = posix.relative(directory, currentTarget);
      direct.push(...(index.files.get(fileKey) ?? []).map((path) => ({ path, index: indexPath })));
    }

    for (const edge of direct) {
      const cycleAt = stack.indexOf(edge.path);
      if (cycleAt !== -1) throw E.CONTEXT_DEPENDENCY_CYCLE([...stack.slice(cycleAt), edge.path]);
      if (dependencies.has(edge.path)) continue;
      const buffer = await regularFile(root, edge.path, "dependency");
      assertTextDependency(buffer, edge.path);
      dependencyBytes += buffer.byteLength;
      if (dependencyBytes > MAX_CLOSURE_BYTES) throw E.CONTEXT_CLOSURE_TOO_LARGE(MAX_CLOSURE_BYTES);
      dependencies.set(edge.path, {
        path: edge.path,
        sha256: sha256(buffer),
        buffer,
        declaredBy: edge.index,
      });
      await visitTarget(edge.path, [...stack, edge.path]);
    }
  };

  await visitTarget(target, [target]);
  const indexList = [...indexes.values()].map(({ path, sha256: digest, summary }) => ({ path, sha256: digest, summary }));
  const dependencyList = [...dependencies.values()];
  const manifest = [
    ...indexList.map(({ path, sha256: digest }) => ({ kind: "index", path, sha256: digest })),
    ...dependencyList.map(({ path, sha256: digest, declaredBy }) => ({ kind: "dependency", path, sha256: digest, declaredBy })),
  ];
  return { indexes: indexList, dependencies: dependencyList, manifest, resolutionDigest: sha256(JSON.stringify(manifest)) };
}

async function receiptLocation(root, sessionId, target) {
  const sessionHash = sha256(sessionId).slice("sha256:".length);
  const targetHash = sha256(target).slice("sha256:".length);
  const rawRoot = (await git(root, ["rev-parse", "--git-path", "harness/context-receipts"])).trim();
  const receiptRoot = isAbsolute(rawRoot) ? rawRoot : resolve(root, rawRoot);
  return {
    sessionHash,
    targetHash,
    directory: join(receiptRoot, sessionHash),
    path: join(receiptRoot, sessionHash, `${targetHash}.json`),
    displayPath: `harness/context-receipts/${sessionHash}/${targetHash}.json`,
  };
}

async function currentReceipt(path) {
  try {
    const receipt = JSON.parse(await readFile(path, "utf8"));
    return ownRecord(receipt) ? receipt : null;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function writeReceipt(location, receipt) {
  await mkdir(location.directory, { recursive: true, mode: 0o700 });
  const temporary = `${location.path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, location.path);
}

export async function guardWriteContext({ root, config, targetPath, sessionId, deliver, now = () => new Date() }) {
  const target = normalizeTarget(root, targetPath);
  const roots = await codeRoots(root, config);
  await assertSafeTarget(root, target);
  if (matchingRoot(target, roots) === null) {
    return { version: 1, decision: "unmanaged", target, indexes: [], dependencies: [], resolutionDigest: null, receipt: null };
  }
  if (typeof sessionId !== "string" || sessionId.trim() === "") throw E.CONTEXT_SESSION_REQUIRED();
  const session = sessionId.trim();

  const resolved = await resolveContextClosure(root, roots, target);
  const location = await receiptLocation(root, session, target);
  const prior = await currentReceipt(location.path);
  const current =
    prior?.version === RECEIPT_VERSION &&
    prior.target === target &&
    prior.sessionHash === location.sessionHash &&
    prior.resolutionDigest === resolved.resolutionDigest;
  if (current) {
    return {
      version: 1,
      decision: "allowed",
      target,
      indexes: resolved.indexes,
      dependencies: resolved.dependencies.map(({ buffer: _buffer, ...entry }) => entry),
      resolutionDigest: resolved.resolutionDigest,
      receipt: { path: location.displayPath, createdAt: prior.createdAt },
    };
  }
  if (typeof deliver !== "function") throw E.CONTEXT_DELIVERY_REQUIRED();

  const createdAt = now().toISOString();
  const result = {
    version: 1,
    decision: "blocked",
    target,
    indexes: resolved.indexes,
    dependencies: resolved.dependencies.map(({ buffer, ...entry }) => ({ ...entry, content: UTF8.decode(buffer) })),
    resolutionDigest: resolved.resolutionDigest,
    receipt: { path: location.displayPath, createdAt },
  };
  await deliver(result);
  await writeReceipt(location, {
    version: RECEIPT_VERSION,
    target,
    sessionHash: location.sessionHash,
    resolutionDigest: resolved.resolutionDigest,
    manifest: resolved.manifest,
    createdAt,
  });
  return result;
}
