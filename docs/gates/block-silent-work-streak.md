# block-silent-work-streak

**Priority:** 55
**Event:** `before_tool_call`
**Type:** Gate (blocking)

## What

Blocks exec/bash commands when the agent has made too many tool calls without sending a status message to the user.

## Why

Agents go dark for long stretches -- running dozens of commands without posting any update. Users have no idea what's happening, whether progress is being made, or if the agent is stuck in a loop. This gate forces periodic status updates during work sessions.

## How

1. Only triggers on `exec` or `bash` tool calls (not writes, edits, or messages).
2. Skips compliance calls (mcp2cli), grace period turns, and heartbeat sessions.
3. Compares `toolCallsSinceMessage` against the configured threshold.
4. If over threshold, blocks the command and tells the agent to post a status update, then resume.

## State Dependencies

| State Field | Purpose |
|---|---|
| `currentTurn` | Grace period check |
| `toolCallsSinceMessage` | Counter reset on each message send, incremented on each exec/bash |

## Config

| Key | Default | Description |
|---|---|---|
| `gracePeriodTurns` | 5 | Turns before gate activates |
| `commGateThreshold` | 8 | Max tool calls before requiring a status message |

## Block Message

```
COMMS GATE: You've made N tool calls without sending a status update.
1) Post a progress message to the active channel NOW.
2) Then IMMEDIATELY resume what you were doing.
```

The block message includes what the agent was about to run, so it can resume after posting.

## Examples

**Blocked:** Agent runs 9 exec calls in a row without posting a message. The 10th exec is blocked.

**Allowed:** Agent runs 5 exec calls, posts a status message (counter resets), then runs 5 more.

**Allowed:** Agent runs `mcp2cli open-brain search` (compliance call, exempt).

**Allowed:** Agent is on turn 3 (grace period).
