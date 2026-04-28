---
name: prompt-include
description: "Auto-discovers and injects *.system.include.md and *.transient.include.md files from workspace/includes/ into prompt context every turn. Solves post-compact amnesia."
metadata:
  openclaw:
    emoji: "📎"
    events: ["before_prompt_build"]
---

# Prompt-Include Hook

Auto-discovers readable include files from `~/.openclaw/workspace/includes/` and injects them into the prompt context every turn.

Inspired by Space Agent's prompt-include system. Adapted for Jeraptha/OpenClaw.

## File Convention

| Pattern | Injection | Use For |
|---------|-----------|---------|
| `*.system.include.md` | System context (every turn) | Standing behavior rules, people database, stable facts |
| `*.transient.include.md` | Transient context (every turn) | Hot working context, current task state, ephemeral info |

Files are sorted alphabetically by filename. Each include is tagged with `source: <filename>` for provenance.

## Token Management

- System includes: capped at 8,000 chars total (configurable in handler)
- Transient includes: capped at 4,000 chars total (configurable in handler)
- Files exceeding the cap are truncated with a notice
- Empty files are skipped

## Fail-Soft Behavior

- Missing `includes/` directory: no error, no injection
- Unreadable files: logged warning, skipped
- Empty files: silently skipped
- Non-matching filenames: ignored

## Starter Templates

The `workspace/includes/` directory ships with templates:

- `behavior.system.include.md` -- Standing behavior rules extracted from LAWs
- `people.system.include.md` -- People database for key contacts
- `hot-context.transient.include.md` -- Current work context (heartbeat-updated)

## Integration with Heartbeat

The heartbeat should update `hot-context.transient.include.md` with current state:
- What channel/task is active
- Current progress
- Key decisions since last heartbeat

This ensures that even after compaction, the agent knows what it was doing.

## Why This Matters

Without this hook, post-compact recovery requires the agent to manually re-read 5+ files (HEARTBEAT.md, SCORECARD.md, TASKS.md, memory files, etc.) and often skips steps. With prompt-include, critical context is automatically injected before the agent even starts thinking, making recovery seamless.
