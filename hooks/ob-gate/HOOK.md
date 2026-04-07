---
name: ob-gate
description: "Nudges agent to check Open Brain before asking the user factual questions"
metadata:
  openclaw:
    emoji: "🧠"
    events: ["before_tool_call"]
---

# OB Gate Hook

Watches outbound messages for factual question patterns. If the agent is about to ask the user something like "what's the IP for..." without having queried Open Brain first, injects a nudge to check OB.

Not a hard block -- a strong nudge. The agent can still send the message, but the nudge makes it much harder to skip OB.

Tracks whether `mcp2cli open-brain` or `memory_search` was called in the current turn.
