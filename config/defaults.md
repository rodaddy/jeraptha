# Recommended Default Configuration

These are the openclaw.json settings we've validated through production use. Each has a WHY.

## Context & Compaction

```json
{
  "agents": {
    "defaults": {
      "contextTokens": 1000000
    }
  },
  "compaction": {
    "reserveTokens": 600000,
    "reserveTokensFloor": 600000
  }
}
```

**Why:** Without explicit contextTokens, OpenClaw defaults to 200K even for 1M models. The reserve tokens ensure compaction fires at ~400K, not ~984K.

## Heartbeat

```json
{
  "heartbeat": {
    "model": "your-sonnet-tier-model",
    "session": "isolated",
    "lightContext": false,
    "suppressToolErrorWarnings": false
  }
}
```

**Why:**
- `lightContext: false` -- heartbeat NEEDS workspace files (HEARTBEAT.md, TASKS.md) to function. Without them it loops on empty read() calls.
- `suppressToolErrorWarnings: false` -- heartbeat needs error feedback to stop retrying broken calls.
- `session: isolated` -- heartbeat runs in its own session, doesn't pollute main conversation.
- Model must be at least sonnet-tier. Flash-lite is too dumb to follow the protocol.

## Agent Timeout

```json
{
  "compaction": {
    "timeoutSeconds": 600
  }
}
```

**Why:** Default timeout is too short for complex multi-tool turns. 600s (10 min) gives the agent enough time for heavy operations.

## Anti-patterns (DO NOT SET)

```json
{
  "heartbeat": {
    "lightContext": true,
    "suppressToolErrorWarnings": true
  }
}
```

These caused a 3+ hour gateway freeze. See config-changelog.md for the full incident report.
