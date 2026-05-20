# block-stale-scorecard

**Priority:** 45
**Event:** `before_tool_call`
**Type:** Gate (blocking)

## What

Heartbeat gate -- blocks exec/bash commands when SCORECARD.md has not been updated within the configured interval. Also writes a RESUME.md breadcrumb so the agent can pick back up after the heartbeat.

## Why

The heartbeat cycle (read TASKS.md, update SCORECARD.md, save to Open Brain) is the agent's operational pulse. Without it, task status goes stale, the scorecard drifts, and the operator loses visibility. This gate enforces the heartbeat on a time basis rather than a turn basis.

## How

1. Only triggers on `exec` or `bash` tool calls.
2. Skips heartbeat sessions (they ARE the compliance mechanism), compliance calls, grace period, and active conversations (message received within 5 minutes).
3. Checks `lastScorecardWriteTime` and SCORECARD.md file mtime, takes the more recent.
4. If elapsed time exceeds `heartbeatIntervalMs`, writes a RESUME.md breadcrumb with what the agent was about to do, then blocks.

## State Dependencies

| State Field | Purpose |
|---|---|
| `currentTurn` | Grace period check |
| `lastScorecardWriteTime` | Plugin-tracked timestamp of last scorecard write |
| `lastMessageReceivedTime` | Active conversation detection |

## Config

| Key | Default | Description |
|---|---|---|
| `gracePeriodTurns` | 5 | Turns before gate activates |
| `heartbeatIntervalMs` | 600000 (10 min) | Max time between scorecard updates |
| `activeConversationMs` | 300000 (5 min) | Skip heartbeat if user message within this window |

## Block Message

```
HEARTBEAT GATE: No heartbeat activity in N minutes.
1) Run heartbeat: read TASKS.md, update SCORECARD.md, session_save to OB.
2) Read RESUME.md and IMMEDIATELY resume what you were doing.
```

## Side Effects

Writes `RESUME.md` to the workspace directory with:
- Timestamp of interruption
- What command the agent was about to run
- Current turn number

## Examples

**Blocked:** Agent has been working for 15 minutes without updating SCORECARD.md. Next exec is blocked with a heartbeat reminder.

**Allowed:** SCORECARD.md was updated 3 minutes ago.

**Allowed:** User sent a message 2 minutes ago (active conversation, heartbeat deferred).

**Allowed:** Running inside a heartbeat-isolated session (would create a deadlock).
