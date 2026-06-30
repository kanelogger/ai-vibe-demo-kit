#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const STAGES = new Set([
  "initialized",
  "requirements-draft",
  "requirements-confirmed",
  "solution-options",
  "solution-selected",
  "implementation-ready",
]);

const KEYWORD_RULES = [
  {
    alias: "debug-flow",
    terms: ["报错", "失败", "error", "failed", "failing", "exception", "stack trace", "build fail", "test fail"],
    reason: "message-debug",
  },
  {
    alias: "debug",
    terms: ["debug", "调试", "定位根因", "复现"],
    reason: "message-debug",
  },
  {
    alias: "api-design",
    terms: ["api", "接口", "契约", "字段", "前后端"],
    reason: "message-api",
  },
  {
    alias: "frontend-ui",
    terms: ["ui", "页面", "界面", "组件", "element plus", "vue"],
    reason: "message-ui",
  },
  {
    alias: "webapp-testing",
    terms: ["浏览器", "截图", "playwright", "验收", "smoke"],
    reason: "message-browser-test",
  },
  {
    alias: "code-review",
    terms: ["review", "审查", "代码质量", "合并前"],
    reason: "message-review",
  },
  {
    alias: "documentation",
    terms: ["adr", "文档", "记录决策", "release notes", "changelog"],
    reason: "message-docs",
  },
  {
    alias: "solution-options",
    terms: ["三个方案", "3 个方案", "方案", "options", "选型"],
    reason: "message-options",
  },
  {
    alias: "tech-plan-generator",
    terms: ["拆任务", "实施计划", "计划", "sprint", "backlog"],
    reason: "message-plan",
  },
  {
    alias: "security-review",
    terms: ["安全", "鉴权", "权限", "输入校验", "漏洞"],
    reason: "message-security",
  },
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  const index = await readJson(join(root, ".agents", "skills.json"), ".agents/skills.json");
  const stage = options.stage ?? await readStage(root);

  if (!STAGES.has(stage)) {
    throw new Error(`Unknown workflow stage: ${stage}`);
  }

  const entries = Array.isArray(index.skills) ? index.skills.filter(isRecord) : [];
  const byAlias = new Map(entries.map((entry) => [String(entry.alias ?? ""), entry]).filter(([alias]) => alias));
  const reasons = new Map();
  const aliases = [];

  const addAlias = (alias, reason) => {
    if (!byAlias.has(alias) || aliases.includes(alias)) return;
    aliases.push(alias);
    reasons.set(alias, reason);
  };

  const message = String(options.message ?? "").toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.terms.some((term) => message.includes(term.toLowerCase()))) {
      addAlias(rule.alias, rule.reason);
    }
  }

  const stageDefaults = isRecord(index.stageDefaults) ? index.stageDefaults : {};
  const defaults = Array.isArray(stageDefaults[stage]) ? stageDefaults[stage] : [];
  for (const alias of defaults) {
    if (typeof alias === "string") addAlias(alias, "stage-default");
  }

  const skills = aliases.map((alias) => {
    const entry = byAlias.get(alias);
    return {
      alias,
      skill: typeof entry.skill === "string" ? entry.skill : "",
      reason: reasons.get(alias),
    };
  });

  console.log(JSON.stringify({
    stage,
    aliases,
    skills,
    source: ".agents/skills.json",
  }, null, 2));
}

async function readStage(root) {
  const state = await readJson(join(root, "workflow-state.json"), "workflow-state.json");
  return String(state.stage ?? "");
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label}: ${detail}`);
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
