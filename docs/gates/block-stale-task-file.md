# Gate: block-stale-task-file

**Priority:** 65
**File:** `plugin/gates/block-stale-task-file.js`
**Factory:** `createBlockStaleTaskFile(state, config, log)`

## What

Blocks work if the task tracking file (TASKS.md) has not been updated within a configurable number of turns. Ensures agents maintain visible, up-to-date task status as they work.

## Why

Agents get absorbed in implementation and stop updating their task file. This makes it impossible for observers (humans, heartbeat checks, dashboards) to know what the agent is doing or whether it is stuck. The gate forces periodic task file updates without derailing the agent's work -- the block message explicitly tells the agent to update and then immediately resume.

## How

1. **Early exits:** Skip if heartbeat session, compliance exec, within grace period, or tool type is not `exec`/`bash`/`message`.
2. **Turn check:** Calculate `currentTurn - lastTasksWriteTurn`. If within the threshold (default 10), allow.
3. **File mtime fallback:** If the turn counter says stale, check the actual file mtime. If modified within the last 60 seconds, allow (handles cases where the file was updated outside the tracked state).
4. **Block:** If both turn counter and mtime say stale, block with a message that includes what the agent was about to do so it can resume after updating.

## Config

| Key | Default | Purpose |
|---|---|---|
| `taskFreshnessTurns` | 10 | Turns allowed between TASKS.md updates |
| `gracePeriodTurns` | 5 | Initial turns where the gate does not fire |

## State Dependencies

| State Field | Read/Write | Purpose |
|---|---|---|
| `currentTurn` | Read | Current turn number |
| `lastTasksWriteTurn` | Read | Last turn when TASKS.md was written |

## Block Message

> TASK GATE: TASKS.md hasn't been updated in {N} turns. 1) Write to {TASKS_PATH} now -- update Last HB timestamps, status, what you're doing. 2) Then IMMEDIATELY resume what you were doing (you were about to: {blocked action}). Do NOT stop after updating -- the update is a pit stop, not the destination.

## Examples

**Blocked:** Agent is on turn 20, last TASKS.md write was turn 5 (15 turns stale, threshold is 10).

**Allowed:** Agent is on turn 12, last TASKS.md write was turn 8 (4 turns stale, within 10 threshold).

**Allowed:** Agent is on turn 3 -- within grace period.

**Allowed:** Agent runs `mcp2cli open-brain search_all` -- compliance exec, never blocked.

**Allowed:** TASKS.md was modified 30 seconds ago (mtime fallback).
