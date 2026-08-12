import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { firstSymlinkInPath, isInside, resolveInside } from "../../shared/path-safety.mjs";

const SOURCE_EXTENSIONS = new Set([
  ".bash", ".cjs", ".cts", ".go", ".java", ".js", ".jsx", ".kt", ".kts",
  ".mjs", ".mts", ".php", ".py", ".rb", ".rs", ".sh", ".ts", ".tsx", ".zsh",
]);

const issue = (code, path, message) => ({ code, path, message });
const safeRelative = (value) => typeof value === "string"
  && value.length > 0
  && !value.startsWith("/")
  && !value.split("/").includes("..")
  && !value.includes("\\")
  && value !== ".";

function scalar(value, line, errors) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string" && parsed.length > 0) return parsed;
    } catch {}
  } else if (/^[a-zA-Z0-9._/*?-]+$/.test(trimmed)) return trimmed;
  errors.push(issue("E_ARCH_CONFIG", `project.yml:${line}`, "architecture_memory values must be non-empty strings in the supported YAML subset"));
  return null;
}

export function parseArchitectureMemory(content) {
  const errors = [];
  if (typeof content !== "string") return { valid: false, errors: [issue("E_ARCH_CONFIG", "project.yml", "project manifest must be text")] };
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "architecture_memory:");
  if (start < 0) return { valid: false, errors: [issue("E_ARCH_CONFIG", "project.yml#architecture_memory", "architecture_memory is required")] };
  const value = { filename: null, codeRoots: [], exclude: [] };
  let list = null;
  const seen = new Set();
  for (let index = start + 1; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
    if (!raw.startsWith(" ")) break;
    const key = /^  (filename|code_roots|exclude):(?:\s*(.*))?$/.exec(raw);
    if (key) {
      if (seen.has(key[1])) errors.push(issue("E_ARCH_CONFIG", `project.yml:${index + 1}`, `duplicate architecture_memory key: ${key[1]}`));
      seen.add(key[1]);
      if (key[1] === "filename") {
        list = null;
        value.filename = scalar(key[2] ?? "", index + 1, errors);
      } else {
        list = key[1] === "code_roots" ? value.codeRoots : value.exclude;
        if ((key[2] ?? "").trim() !== "") errors.push(issue("E_ARCH_CONFIG", `project.yml:${index + 1}`, `${key[1]} must use an indented list`));
      }
      continue;
    }
    const item = /^    -\s+(.+)$/.exec(raw);
    if (item && list) {
      const parsed = scalar(item[1], index + 1, errors);
      if (parsed !== null) list.push(parsed);
      continue;
    }
    errors.push(issue("E_ARCH_CONFIG", `project.yml:${index + 1}`, "unsupported architecture_memory YAML syntax"));
  }
  if (!value.filename || basename(value.filename) !== value.filename) errors.push(issue("E_ARCH_CONFIG", "project.yml#architecture_memory.filename", "filename must be a file name without path separators"));
  if (value.codeRoots.length === 0) errors.push(issue("E_ARCH_CONFIG", "project.yml#architecture_memory.code_roots", "at least one code root is required"));
  for (const root of value.codeRoots) if (!safeRelative(root)) errors.push(issue("E_ARCH_CONFIG", "project.yml#architecture_memory.code_roots", `unsafe code root: ${root}`));
  for (const pattern of value.exclude) if (!safeRelative(pattern) && pattern !== "**") errors.push(issue("E_ARCH_CONFIG", "project.yml#architecture_memory.exclude", `unsafe exclude pattern: ${pattern}`));
  if (new Set(value.codeRoots).size !== value.codeRoots.length) errors.push(issue("E_ARCH_CONFIG", "project.yml#architecture_memory.code_roots", "code roots must be unique"));
  return { valid: errors.length === 0, value, errors };
}

function globRegex(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*" && pattern[index + 2] === "/") {
      source += "(?:[^/]+/)*";
      index += 2;
    } else if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

function token(content, value) {
  return content.includes(`\`${value}\``);
}

function sourceFile(name, stat) {
  if (name.startsWith(".")) return false;
  const extension = name.includes(".") ? `.${name.split(".").at(-1)}` : "";
  return SOURCE_EXTENSIONS.has(extension) || extension === "" && (stat.mode & 0o111) !== 0;
}

async function regularText(root, path, errors, code) {
  const target = resolveInside(root, path);
  if (!target) {
    errors.push(issue("E_ARCH_PATH", path, "architecture path leaves the repository"));
    return null;
  }
  if (await firstSymlinkInPath(root, target)) {
    errors.push(issue("E_ARCH_SYMLINK", path, "architecture paths must not use symlinks"));
    return null;
  }
  try {
    const stat = await lstat(target);
    if (!stat.isFile()) {
      errors.push(issue(code, path, "architecture index must be a regular file"));
      return null;
    }
    return await readFile(target, "utf8");
  } catch (error) {
    errors.push(issue(code, path, error.code === "ENOENT" ? "architecture index is missing" : error.message));
    return null;
  }
}

export async function validateArchitectureIndex(root, projectContent) {
  const parsed = parseArchitectureMemory(projectContent);
  const errors = [...parsed.errors];
  const warnings = [];
  if (!parsed.valid) return { valid: false, configurationValid: false, project: null, errors, warnings };
  const canonicalRoot = await realpath(root);
  const { filename, codeRoots, exclude } = parsed.value;
  const excluded = exclude.map(globRegex);
  const isExcluded = (path) => excluded.some((pattern) => pattern.test(path));
  const rootArchitecture = await regularText(canonicalRoot, filename, errors, "E_ARCH_INDEX_MISSING");

  async function inspectDirectory(relative) {
    const target = resolveInside(canonicalRoot, relative);
    if (!target || !isInside(canonicalRoot, target)) {
      errors.push(issue("E_ARCH_PATH", relative, "code directory leaves the repository"));
      return;
    }
    if (await firstSymlinkInPath(canonicalRoot, target)) {
      errors.push(issue("E_ARCH_SYMLINK", relative, "code directories must not use symlinks"));
      return;
    }
    let entries;
    try {
      if (!(await lstat(target)).isDirectory()) {
        errors.push(issue("E_ARCH_ROOT", relative, "code root must be a directory"));
        return;
      }
      entries = await readdir(target, { withFileTypes: true });
    } catch (error) {
      errors.push(issue("E_ARCH_ROOT", relative, error.code === "ENOENT" ? "code root does not exist" : error.message));
      return;
    }
    const architecturePath = `${relative}/${filename}`;
    const architecture = await regularText(canonicalRoot, architecturePath, errors, "E_ARCH_INDEX_MISSING");
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        errors.push(issue("E_ARCH_SYMLINK", child, "code modules must not contain symlinks"));
        continue;
      }
      if (entry.isDirectory()) {
        if (isExcluded(child)) continue;
        if (architecture !== null && !token(architecture, `${entry.name}/`)) errors.push(issue("E_ARCH_CHILD_UNINDEXED", architecturePath, `direct child module is not indexed: ${entry.name}/`));
        await inspectDirectory(child);
        continue;
      }
      if (entry.name === filename || !entry.isFile()) continue;
      const stat = await lstat(join(target, entry.name));
      if (sourceFile(entry.name, stat) && architecture !== null && !token(architecture, entry.name)) errors.push(issue("E_ARCH_FILE_UNINDEXED", architecturePath, `direct source file is not indexed: ${entry.name}`));
    }
  }

  for (const codeRoot of codeRoots) {
    if (isExcluded(codeRoot)) {
      errors.push(issue("E_ARCH_ROOT", codeRoot, "code root cannot also be excluded"));
      continue;
    }
    if (rootArchitecture !== null && !token(rootArchitecture, `${codeRoot}/${filename}`)) errors.push(issue("E_ARCH_ROOT_UNINDEXED", filename, `code root architecture is not indexed: ${codeRoot}/${filename}`));
    await inspectDirectory(codeRoot);
  }
  const configurationCodes = new Set(["E_ARCH_CONFIG", "E_ARCH_PATH", "E_ARCH_ROOT", "E_ARCH_SYMLINK"]);
  return {
    valid: errors.length === 0,
    configurationValid: !errors.some((entry) => configurationCodes.has(entry.code)),
    project: { filename, codeRoots, exclude },
    errors,
    warnings,
  };
}
