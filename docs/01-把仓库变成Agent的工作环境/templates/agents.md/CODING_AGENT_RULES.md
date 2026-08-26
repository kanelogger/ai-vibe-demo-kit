# Coding Agent Rules

Behavioral guidelines to reduce common LLM coding mistakes. These rules apply when a task involves code, scripts, config files, build files, tests, CLIs, automations, or developer workflows, unless explicitly overridden by more specific project instructions.

**Tradeoff:** These guidelines bias toward caution over speed on non-trivial work. For trivial tasks, use judgment.

## Rule 1 - Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.

Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## Rule 2 - Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Do not improve adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it. Do not delete it.

When your changes create orphans:
- Remove imports, variables, and functions that your changes made unused.
- Do not remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## Rule 3 - Goal-Driven Execution

**Define success criteria. Iterate only when verification produces new evidence.**

Transform tasks into verifiable goals:
- "Add validation" becomes "write tests for invalid inputs, then make them pass."
- "Fix the bug" becomes "write a test that reproduces it, then make it pass."
- "Refactor X" becomes "ensure tests pass before and after."

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria such as "make it work" must be converted into observable checks before implementation. Ask only when the intended behavior cannot be inferred from available evidence.

## Rule 4 - Surface Conflicts, Do Not Average Them

If two patterns contradict, pick one based on evidence such as recency, test coverage, local convention, or reliability.

Explain why. Flag the other for cleanup. Do not blend conflicting patterns into a third accidental style.

## Rule 5 - Fail Loud

"Completed" is wrong if anything was skipped silently.

"Tests pass" is wrong if any tests were skipped or not run.

Default to surfacing uncertainty, missing checks, skipped work, and unresolved conflicts.

## Hard Constraints

- **Retry requires new evidence.** Do not keep retrying the same failed approach without new evidence.
- **Never silently skip work or checks.**
- **Do not claim evidence you do not have.** Never claim a file was read, a command was run, a test passed, or behavior was verified unless it actually happened.

