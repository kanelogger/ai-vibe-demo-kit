#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillDocument } from "../src/runtime/validation/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const skills = [
  {
    id: "workflow-runner",
    displayName: "Workflow Runner",
    shortDescription: "Run Harness stages with dynamic capability selection",
    requiredBody: ["## Run the Stage", "## Permission boundaries", "execution-trace/v1", "skills.sources.json"],
  },
  {
    id: "kit-lifecycle",
    displayName: "Kit Lifecycle",
    shortDescription: "Manage AI Vibe Demo Kit installation lifecycle safely",
    requiredBody: ["## Plan before apply", "## Permission boundaries", "explicitly authorizes", "Work Item is active"],
  },
];

async function regular(path, label) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) errors.push(`${label} must be a regular file`);
  } catch (error) {
    errors.push(`${label} cannot be read: ${error.message}`);
  }
}

for (const skill of skills) {
  const skillRoot = join(root, ".agents", "skills", skill.id);
  const skillFile = join(skillRoot, "SKILL.md");
  const metadataFile = join(skillRoot, "agents", "openai.yaml");
  const label = `.agents/skills/${skill.id}`;
  const before = errors.length;
  await regular(skillFile, `${label}/SKILL.md`);
  await regular(metadataFile, `${label}/agents/openai.yaml`);
  if (errors.length !== before) continue;

  const content = await readFile(skillFile, "utf8");
  const document = parseSkillDocument(content);
  if (!document) errors.push(`${label}/SKILL.md requires YAML frontmatter and a body`);
  else {
    if (Object.keys(document.metadata).sort().join(",") !== "description,name") errors.push(`${label}/SKILL.md frontmatter may contain only name and description`);
    if (document.metadata.name !== skill.id) errors.push(`${label}/SKILL.md name must be ${skill.id}`);
    if (!document.metadata.description) errors.push(`${label}/SKILL.md description must be non-empty`);
    if (document.body.trim().length < 200) errors.push(`${label}/SKILL.md body is unexpectedly empty`);
    for (const required of skill.requiredBody) {
      if (!document.body.includes(required)) errors.push(`${label}/SKILL.md is missing: ${required}`);
    }
  }

  const openai = await readFile(metadataFile, "utf8");
  for (const required of [
    `display_name: "${skill.displayName}"`,
    `short_description: "${skill.shortDescription}"`,
    `default_prompt: "Use $${skill.id}`,
    "allow_implicit_invocation: true",
  ]) if (!openai.includes(required)) errors.push(`${label}/agents/openai.yaml is missing: ${required}`);
}

if (errors.length) {
  process.stderr.write(`${errors.map((entry) => `ERROR ${entry}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`bundled Skills: valid (${skills.map(({ id }) => id).join(", ")})\n`);
