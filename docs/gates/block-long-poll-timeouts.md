# Block Long Poll Timeouts

**Priority:** 90 | **Event:** before_tool_call
**Type:** Hard Block

## What It Does
Prevents agents from running process poll calls with timeouts exceeding 10 seconds. Long polls make the agent unresponsive to user messages and other tasks.

## Why It Exists
Agents would poll long-running processes with 30-60 second timeouts, effectively going deaf to incoming messages and operator commands during that window. The fix is to use tmux for long-running processes so the agent stays available while background work continues.

## How It Works
1. Skip entirely for heartbeat sessions (they may need longer poll windows).
2. Only applies to `process` tool calls with `action: "poll"`.
3. Checks `timeout` or `timeoutMs` parameter.
4. If the value is a number greater than 10000 (10 seconds) -- hard block.
5. Non-numeric timeouts, missing timeouts, and timeouts <= 10s are allowed.

## State Dependencies
- **Reads:** None (uses context for heartbeat check)
- **Writes:** None

## Block Message
> DEAF POLL BLOCKED: timeout [N]ms ([N]s) exceeds 10s max. Use tmux instead: `tmux new-session -d -s name 'cmd'`. Stay available. Never go dark.

## Examples
**Blocked:** `process` poll with `timeout: 30000` (30 seconds)
**Blocked:** `process` poll with `timeoutMs: 60000` (60 seconds)
**Allowed:** `process` poll with `timeout: 5000` (5 seconds)
**Allowed:** `process` poll with `timeout: 10000` (10 seconds -- at boundary)
**Allowed:** `process` poll with no timeout specified (defaults to 0)
**Allowed (heartbeat):** Any poll timeout in a heartbeat/isolated session
