---
name: sop-gate
description: "Hard blocks process-driven work (deploy, git, swarm, PR, spawn) without SOP check in OB first"
metadata:
  openclaw:
    emoji: "📖"
    events: ["before_tool_call"]
---

# SOP Gate Hook

When the agent is about to do process-driven work (deploy, git operations, swarm, PR creation, agent spawning, schema changes), this hook checks whether Open Brain was searched for an SOP first.

If no SOP search was done this turn: HARD BLOCK. The agent must search OB for relevant SOPs before proceeding.

Same enforcement pattern as law-10-search-ob-first, but specifically for process-driven operations.
