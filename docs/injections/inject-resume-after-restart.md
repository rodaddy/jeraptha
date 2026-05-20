# inject-resume-after-restart

**Priority:** 60
**Event:** `before_prompt_build`
**Type:** Injection (one-shot)

## What

On plugin reload (gateway restart), checks for a RESUME.md file and injects its contents as system context. Fires exactly once, then deletes the file.

## Why

When the gateway bounces mid-session, the agent loses all context about what it was doing. The heartbeat gate writes RESUME.md before blocking, and this injection reads it back after restart. Together they form a context recovery bridge across gateway restarts.

## How

1. Checks the `resumeConsumed` flag -- if already fired, returns empty.
2. Sets `resumeConsumed = true` (one-shot guarantee).
3. Checks if RESUME.md exists and has content.
4. Reads the file, deletes it, and returns `appendSystemContext` with the resume content wrapped in a POST-BOUNCE CONTEXT RECOVERY header.

## State Dependencies

| State Field | Purpose |
|---|---|
| `resumeConsumed` | One-shot flag, prevents re-injection |

## Injection Message

```
POST-BOUNCE CONTEXT RECOVERY
The gateway was restarted mid-session. Here is what was happening before the bounce:

[RESUME.md contents]

Resume this work. Do NOT pretend you don't know what happened -- this IS your context.
```

## Side Effects

- Deletes RESUME.md after reading it.

## Examples

**Injected:** Gateway restarted, RESUME.md exists with content about an interrupted build command. Agent receives context about what it was doing.

**Skipped:** No RESUME.md file exists (clean start, no prior interruption).

**Skipped:** Already fired once this session (resumeConsumed = true).
