# inject-skill-index-periodically

**Priority:** 35
**Event:** `before_prompt_build`
**Type:** Injection (periodic)

## What

Every 10 prompt builds, reads SKILL-INDEX.md and injects it as a reminder of available skills.

## Why

Agents forget available skills as context grows. They default to manual approaches (grep, read, exec) instead of using purpose-built skills with workflow knowledge. This periodic injection keeps the skill list in the agent's awareness without being intrusive.

## How

1. Checks if `promptTurnCount` is a multiple of 10. If not, returns empty.
2. Reads SKILL-INDEX.md from the workspace.
3. Returns `appendSystemContext` with the skill index and a reminder to read full SKILL.md files before using.

## State Dependencies

| State Field | Purpose |
|---|---|
| `promptTurnCount` | Determines when to fire (every 10th turn) |

## Injection Message

```
AVAILABLE SKILLS (check before doing anything manually):
[SKILL-INDEX.md contents]

Read the full SKILL.md before using. Do NOT guess at usage -- the skill has instructions.
```

## Examples

**Injected:** Turn 10, 20, 30, etc. -- skill index is injected.

**Skipped:** Turn 1-9, 11-19, 21-29 -- not a 10th turn.

**Skipped:** SKILL-INDEX.md does not exist or cannot be read.
