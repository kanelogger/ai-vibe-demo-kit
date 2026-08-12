import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { HarnessError, fail } from "./errors.mjs";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const COMMANDS = ["version", "check", "check-architecture", "check-environment", "check-result", "start", "status", "signal", "decide"];

function validateManifest(value, { allowLegacy = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("E_MANIFEST_INVALID", "Harness manifest must be an object");
  if (value.schemaVersion !== 2 && !(allowLegacy && value.schemaVersion === 1)) fail("E_MANIFEST_INVALID", "Harness manifest schemaVersion must be 2");
  if (value.name !== "ai-vibe-demo-kit") fail("E_MANIFEST_INVALID", "Harness manifest name is invalid");
  if (typeof value.version !== "string" || !SEMVER.test(value.version)) fail("E_MANIFEST_INVALID", "Harness manifest version must be semantic versioning");
  if (typeof value.minimumNodeVersion !== "string" || !/^[1-9]\d*$/.test(value.minimumNodeVersion)) {
    fail("E_MANIFEST_INVALID", "Harness manifest minimumNodeVersion must be a positive major version");
  }
  if (value.schemaVersion === 2) {
    if (!value.capabilities || typeof value.capabilities !== "object" || Array.isArray(value.capabilities)) fail("E_MANIFEST_INVALID", "Harness manifest capabilities must be an object");
    if (!Array.isArray(value.capabilities.commands) || new Set(value.capabilities.commands).size !== value.capabilities.commands.length || COMMANDS.some((command) => !value.capabilities.commands.includes(command))) {
      fail("E_MANIFEST_INVALID", "Harness manifest commands are incomplete or duplicated");
    }
    if (!Array.isArray(value.capabilities.contracts) || new Set(value.capabilities.contracts).size !== value.capabilities.contracts.length || !value.capabilities.contracts.includes("verification-report/v1") || !value.capabilities.contracts.includes("test-impact/v1")) {
      fail("E_MANIFEST_INVALID", "Harness manifest contracts are incomplete or duplicated");
    }
  }
  return value;
}

export async function loadHarnessManifest(root, options = {}) {
  const path = join(resolve(root), ".harness", "manifest.json");
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("E_MANIFEST_INVALID", "Harness manifest must be a regular file");
    return validateManifest(JSON.parse(await readFile(path, "utf8")), options);
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    if (error.code === "ENOENT") fail("E_MANIFEST_INVALID", `Harness manifest does not exist: ${path}`);
    fail("E_MANIFEST_INVALID", `Harness manifest cannot be read: ${error.message}`);
  }
}
