#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(content);
  if (!frontmatter) errors.push("SKILL.md requires YAML frontmatter and a body");
  else {
    const entries = frontmatter[1].split(/\r?\n/).filter(Boolean).map((line) => /^([a-zA-Z0-9_-]+):\s*(.+)$/.exec(line));
    if (entries.some((entry) => !entry)) errors.push("SKILL.md frontmatter contains an invalid line");
    else {
      const metadata = Object.fromEntries(entries.map((entry) => [entry[1], entry[2].trim()]));
      if (Object.keys(metadata).sort().join(",") !== "description,name") errors.push("SKILL.md frontmatter may contain only name and description");
      if (metadata.name !== "ai-vibe-demo-kit") errors.push("SKILL.md name must be ai-vibe-demo-kit");
      if (!metadata.description) errors.push("SKILL.md description must be non-empty");
    }
    if (frontmatter[2].trim().length < 200) errors.push("SKILL.md body is unexpectedly empty");
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
