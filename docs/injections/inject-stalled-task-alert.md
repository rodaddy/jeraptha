# inject-stalled-task-alert

**Priority:** 40
**Event:** `before_prompt_build`
**Type:** Injection (recurring)

## What

Reads TASKS.md every prompt build, extracts any sections marked STALLED, and injects them with DROP EVERYTHING urgency.

## Why

Tasks marked STALLED in TASKS.md represent blocked work that needs immediate attention. Without this injection, the agent continues working on lower-priority items while stalled tasks rot. The injection makes stalled tasks impossible to ignore.

## How

1. Reads TASKS.md from the workspace.
2. If the content does not contain "STALLED", returns empty.
3. Scans line by line, capturing lines from any line containing "STALLED" until an empty line or a new `### ` heading.
4. Returns `appendSystemContext` with the extracted stalled sections and urgency framing.

Note: `promptTurnCount` is incremented by `reset-per-turn-state`, not by this injection.

## Injection Message

```
STALLED TASK ALERT -- DROP EVERYTHING
[extracted STALLED sections from TASKS.md]

Address this IMMEDIATELY. Update TASKS.md with current status.
```

## Examples

**Injected:** TASKS.md contains `### Deploy API\nStatus: STALLED -- waiting on DNS`. The stalled section is extracted and injected.

**Skipped:** TASKS.md has no tasks with STALLED status.

**Skipped:** TASKS.md does not exist or cannot be read.
