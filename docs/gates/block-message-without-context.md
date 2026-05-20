# block-message-without-context

**Priority:** 58
**Event:** `before_tool_call`
**Type:** Gate (blocking)

## What

Prevents message sends until the agent has loaded session context: TASKS.md, CONVERSATIONS.md, and Open Brain context.

## Why

Agents respond to user messages without knowing what tasks are active, what conversations are ongoing, or what the knowledge base says. This produces uninformed, contradictory, or redundant responses. The gate forces context loading before the agent opens its mouth.

## How

1. Checks if the tool being called is `message`.
2. Skips if within the grace period (first N turns) or if the agent has been working silently long enough to warrant a status update (toolCallsSinceMessage > commGateThreshold).
3. Checks three session-level flags: `tasksReadThisSession`, `conversationsReadThisSession`, `obContextLoadedThisSession`.
4. If any flag is false, blocks the message and reports which context sources are missing.

## State Dependencies

| State Field | Purpose |
|---|---|
| `currentTurn` | Grace period check |
| `toolCallsSinceMessage` | Skip gate when agent has been working (needs to communicate) |
| `tasksReadThisSession` | Whether TASKS.md was read this session |
| `conversationsReadThisSession` | Whether CONVERSATIONS.md was read this session |
| `obContextLoadedThisSession` | Whether Open Brain session_load/search was run |

## Config

| Key | Default | Description |
|---|---|---|
| `gracePeriodTurns` | 5 | Turns before gate activates |
| `commGateThreshold` | 8 | Tool calls before communication override |

## Block Message

```
CONTEXT GATE: Load context before responding. Missing: [list].
Read TASKS.md + CONVERSATIONS.md + run mcp2cli open-brain session_load BEFORE sending messages.
```

## Examples

**Blocked:** Agent tries to reply on turn 8 without having read TASKS.md or CONVERSATIONS.md.

**Allowed:** Agent loaded all three context sources, then sends a message.

**Allowed:** Agent is on turn 2 (within grace period), sends a message without context.

**Allowed:** Agent made 10 tool calls without messaging (communication gate would fire instead, so this gate defers).
