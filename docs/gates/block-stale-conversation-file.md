# Gate: block-stale-conversation-file

**Priority:** 62
**File:** `plugin/gates/block-stale-conversation-file.js`
**Factory:** `createBlockStaleConversationFile(state, config, log)`

## What

Blocks work if the conversation tracking file (CONVERSATIONS.md) has not been updated within a configurable number of turns. Ensures agents maintain awareness of active conversation threads and topics.

## Why

CONVERSATIONS.md tracks what the agent is discussing, topic heat, and conversation context. When agents stop updating it, they lose track of conversation threads and their responses become disconnected from ongoing topics. This gate enforces periodic updates with a longer threshold than the task gate since conversation context changes less frequently than task status.

## How

1. **Early exits:** Skip if heartbeat session, compliance exec, within grace period, or tool type is not `exec`/`bash`/`message`.
2. **Turn check:** Calculate `currentTurn - lastConversationsWriteTurn`. If within the threshold (default 15), allow.
3. **File mtime fallback:** If the turn counter says stale, check the actual file mtime. If modified within the last 120 seconds (2 minutes), allow.
4. **Block:** If both turn counter and mtime say stale, block with a message that includes what the agent was about to do so it can resume after updating.

## Config

| Key | Default | Purpose |
|---|---|---|
| `conversationFreshnessTurns` | 15 | Turns allowed between CONVERSATIONS.md updates |
| `gracePeriodTurns` | 5 | Initial turns where the gate does not fire |

## State Dependencies

| State Field | Read/Write | Purpose |
|---|---|---|
| `currentTurn` | Read | Current turn number |
| `lastConversationsWriteTurn` | Read | Last turn when CONVERSATIONS.md was written |

## Block Message

> CONVERSATIONS GATE: CONVERSATIONS.md hasn't been updated in {N} turns. 1) Write to {CONVERSATIONS_PATH} -- update topics, heat, what's current. 2) Then IMMEDIATELY resume what you were doing (you were about to: {blocked action}). Do NOT stop after updating -- the update is a pit stop, not the destination.

## Examples

**Blocked:** Agent is on turn 25, last CONVERSATIONS.md write was turn 5 (20 turns stale, threshold is 15).

**Allowed:** Agent is on turn 20, last CONVERSATIONS.md write was turn 15 (5 turns stale, within 15 threshold).

**Allowed:** Agent is on turn 4 -- within grace period.

**Allowed:** Agent runs `mcp2cli open-brain search_all` -- compliance exec, never blocked.

**Allowed:** CONVERSATIONS.md was modified 90 seconds ago (mtime fallback, threshold is 120s).
