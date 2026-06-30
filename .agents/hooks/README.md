# Agent Hooks

Hook scripts are deterministic helpers for agent routing. They can recommend skill aliases from the current workflow stage and user message, but they do not advance stages, edit workflow files, or execute skills.

## route-skill.mjs

Input contract:

- `stage`: one of the workflow stages from `workflow-state.json`.
- `message`: the latest user message.
- `root`: optional project root. Defaults to the current working directory.

Command-line usage:

```sh
node .agents/hooks/route-skill.mjs --stage initialized --message "帮我先梳理需求"
```

If `--stage` is omitted, the script reads `<root>/workflow-state.json`.

Output contract:

```json
{
  "stage": "initialized",
  "aliases": ["requirement-clarification", "requirement-grilling"],
  "skills": [
    {
      "alias": "requirement-clarification",
      "skill": "ce-brainstorm",
      "reason": "stage-default"
    }
  ],
  "source": ".agents/skills.json"
}
```

Rules:

- `aliases` is ordered by recommendation priority.
- Unknown aliases are dropped from the output.
- The script exits non-zero for invalid JSON, unknown stage, or missing `.agents/skills.json`.
- The hook is an optional routing enhancement. `workflow-state.json` remains the only stage fact source, and `kit stage advance` remains the only supported stage transition path.
