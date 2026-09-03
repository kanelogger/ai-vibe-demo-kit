# Coding Agent Rules

Behavioral guidelines to reduce common LLM coding mistakes. These rules apply when a task involves code, scripts, config files, build files, tests, CLIs, automations, or developer workflows, unless explicitly overridden by more specific project instructions.

**Tradeoff:** These guidelines bias toward caution over speed on non-trivial work. For trivial tasks, use judgment.

## Rule 1 - Understand Before Changing

**Trace the real behavior before choosing an implementation.**

- Read the affected code and follow the execution or data path that the change will touch.
- Inspect callers, tests, schemas, and configuration when they determine that path's contract.
- State only assumptions and tradeoffs that could change the result; do not narrate obvious assumptions.
- If repository evidence resolves the interpretation, proceed. Ask only when an unresolved choice materially changes an interface, stored data, architecture, destructive effects, or risk.
- Surface a simpler approach when it satisfies the same contract; use it unless a stated constraint rules it out.

## Rule 2 - Simplicity First

**Minimum clear code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for states excluded by an enforced type, schema, database constraint, or other verified invariant.

Before writing new code, prefer the first option that satisfies the contract:

1. Avoid the new code when the behavior is unnecessary.
2. Reuse an existing repository implementation or local pattern.
3. Use the standard library or a platform primitive.
4. Use an already-installed dependency.
5. Write the smallest clear local implementation.

Add a dependency only when it materially reduces complexity or risk.

Simplicity must not remove trust-boundary validation, data-integrity protections, security controls, accessibility requirements, or explicitly requested behavior.

When a deliberately limited design has a non-obvious ceiling, document the limit and upgrade trigger using the repository's existing convention.

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

When verification exposes failures:
- Fix failures caused by the current change.
- Surface unrelated failures without treating them as authorization to expand scope.

The test: every changed line should trace directly to the user's request.

## Rule 4 - Goal-Driven Execution

**Define success criteria. Iterate only when verification produces new evidence.**

Transform tasks into verifiable goals:
- "Add validation" becomes "write tests for invalid inputs, then make them pass."
- "Fix the bug" becomes "write a test that reproduces it, then make it pass."
- "Refactor X" becomes "ensure tests pass before and after."
- For bug reports, trace and fix the root cause; do not special-case only the reported input unless that behavior is the intended contract.

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria such as "make it work" must be converted into observable checks before implementation. Ask only when the intended behavior cannot be inferred from available evidence.

## Rule 5 - Surface Conflicts, Do Not Average Them

If two patterns contradict, pick one based on evidence such as recency, test coverage, local convention, or reliability.

Explain why. Flag the other for cleanup. Do not blend conflicting patterns into a third accidental style.

## Rule 6 - Fail Loud

"Completed" is wrong if anything was skipped silently.

"Tests pass" is wrong if any tests were skipped or not run.

Default to surfacing uncertainty, missing checks, skipped work, and unresolved conflicts.

## Hard Constraints

- **Retry requires new evidence.** Do not keep retrying the same failed approach without new evidence.
- **Never silently skip work or checks.**
- **Do not claim evidence you do not have.** Never claim a file was read, a command was run, a test passed, or behavior was verified unless it actually happened.

