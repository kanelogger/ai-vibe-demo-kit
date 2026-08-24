# Coding Agent Rules

Behavioral guidelines to reduce common LLM coding mistakes. These rules apply when a task involves code, scripts, config files, build files, tests, CLIs, automations, or developer workflows, unless explicitly overridden by more specific project instructions.

**Tradeoff:** These guidelines bias toward caution over speed on non-trivial work. For trivial tasks, use judgment.

## Rule 1 - Think Before Coding

**Do not assume. Do not hide confusion. Surface tradeoffs.**

Before implementing:
- State assumptions explicitly. If uncertain, ask rather than guess.
- Present multiple interpretations when ambiguity exists.
- Push back when a simpler approach exists.
- Stop when confused. Name what is unclear.

## Rule 2 - Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## Rule 3 - Surgical Changes

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

## Rule 4 - Goal-Driven Execution

**Define success criteria. Loop until verified.**

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

Strong success criteria let you loop independently. Weak criteria such as "make it work" require clarification.

## Rule 5 - Use the Model Only for Judgment Calls

Use the model for classification, drafting, summarization, extraction, tradeoff analysis, and judgment calls.

Do not use the model for routing, retries, deterministic transforms, or work that ordinary code can perform reliably.

If code can answer, code answers.

## Rule 6 - Token Budgets Are Not Advisory

Per-task budget: 4,000 tokens.

Per-session budget: 30,000 tokens.

If approaching budget, summarize and start fresh. Surface the breach. Do not silently overrun.

## Rule 7 - Surface Conflicts, Do Not Average Them

If two patterns contradict, pick one based on evidence such as recency, test coverage, local convention, or reliability.

Explain why. Flag the other for cleanup. Do not blend conflicting patterns into a third accidental style.

## Rule 8 - Read Before You Write

Before adding code, read exports, immediate callers, shared utilities, tests, and nearby conventions.

"Looks orthogonal" is dangerous. If you do not understand why the code is structured a certain way, ask or investigate before editing.

## Rule 9 - Tests Verify Intent, Not Just Behavior

Tests must encode why the behavior matters, not just what output appears today.

A test that cannot fail when business logic changes is the wrong test.

## Rule 10 - Checkpoint After Every Significant Step

After each significant step, summarize:
- What was done.
- What was verified.
- What remains.

Do not continue from a state you cannot describe back. If you lose track, stop and restate the current state.

## Rule 11 - Match the Codebase's Conventions

Conformance beats taste inside the codebase.

Match existing naming, file structure, error handling, formatting, and test style. If a convention seems harmful, surface it explicitly instead of forking silently.

## Rule 12 - Fail Loud

"Completed" is wrong if anything was skipped silently.

"Tests pass" is wrong if any tests were skipped or not run.

Default to surfacing uncertainty, missing checks, skipped work, and unresolved conflicts.

## Success Signal

These guidelines are working when diffs contain fewer unnecessary changes, rewrites due to overcomplication decrease, ambiguity is surfaced before implementation, and every changed line can be traced back to the user's request.
