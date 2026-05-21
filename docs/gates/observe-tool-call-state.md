# Observe Tool Call State

**Priority:** 110 | **Event:** before_tool_call
**Type:** Passive Observer

## What It Does
Tracks tool call activity across the session -- writes to TASKS.md, SCORECARD.md, CONVERSATIONS.md, tool call counts, skill consultations, OB context loads, and review agent spawns. Never blocks any action.

## Why It Exists
Other gates (task-freshness, communication, context-before-message) depend on accurate state to know when to enforce. Without centralized tracking, each gate would need its own observation logic, creating duplication and inconsistency. This gate runs first (highest priority) so all downstream gates see current state.

## How It Works
1. Checks if the tool call is a write/edit/apply_patch targeting TASKS.md, SCORECARD.md, or CONVERSATIONS.md and updates the corresponding state fields.
2. Increments `toolCallsSinceMessage` for non-compliance exec/bash calls.
3. Sets `skillConsultedThisTurn` when SKILL files are read or catted.
4. Sets per-session context flags (`tasksReadThisSession`, `conversationsReadThisSession`, `obContextLoadedThisSession`) when those resources are accessed.
5. Sets `reviewAgentSpawned` when an agent is spawned during active PR review context.

`toolCallsSinceMessage` is reset by `track-message-sent-state` on the `message_sent` event, after channel delivery reports `success === true`.

## State Dependencies
- **Reads:** `currentTurn`, `prReviewContext`
- **Writes:** `lastTasksWriteTurn`, `lastScorecardWriteTime`, `lastConversationsWriteTurn`, `tasksReadThisSession`, `conversationsReadThisSession`, `obContextLoadedThisSession`, `toolCallsSinceMessage`, `skillConsultedThisTurn`, `reviewAgentSpawned`

## Block Message
> None -- this gate never blocks.

## Examples
**Tracked:** `write` to `/workspace/TASKS.md` updates `lastTasksWriteTurn` to current turn.
**Tracked:** `exec` running `mcp2cli open-brain session_load` sets `obContextLoadedThisSession = true`.
**Ignored:** `read` of a random project file -- no state changes.
