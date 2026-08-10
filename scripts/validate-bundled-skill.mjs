#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillDocument } from "./harness/lib/validator.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = join(root, ".agents", "skills", "ai-vibe-demo-kit");
const errors = [];

async function regular(path, label) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) errors.push(`${label} must be a regular file`);
  } catch (error) {
    errors.push(`${label} cannot be read: ${error.message}`);
  }
}

await regular(join(skillRoot, "SKILL.md"), "SKILL.md");
await regular(join(skillRoot, "agents", "openai.yaml"), "agents/openai.yaml");

if (errors.length === 0) {
  const content = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const document = parseSkillDocument(content);
  if (!document) errors.push("SKILL.md requires YAML frontmatter and a body");
  else {
    if (Object.keys(document.metadata).sort().join(",") !== "description,name") errors.push("SKILL.md frontmatter may contain only name and description");
    if (document.metadata.name !== "ai-vibe-demo-kit") errors.push("SKILL.md name must be ai-vibe-demo-kit");
    if (!document.metadata.description) errors.push("SKILL.md description must be non-empty");
    if (document.body.trim().length < 200) errors.push("SKILL.md body is unexpectedly empty");
    if (!document.body.includes("## Permission boundaries")) errors.push("SKILL.md must declare its permission boundaries");
  }
  const openai = await readFile(join(skillRoot, "agents", "openai.yaml"), "utf8");
  for (const required of [
    'display_name: "AI Vibe Demo Kit"',
    'short_description: "Guide agents through Harness workflow and evidence controls"',
    'default_prompt: "Use $ai-vibe-demo-kit',
    "allow_implicit_invocation: true",
  ]) if (!openai.includes(required)) errors.push(`agents/openai.yaml is missing: ${required}`);
}

if (errors.length) {
  process.stderr.write(`${errors.map((entry) => `ERROR ${entry}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write("bundled Skill: valid\n");
