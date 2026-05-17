---
name: no-deaf-polls
description: "HARD BLOCKS process poll calls with timeout > 10s to prevent Skippy from going deaf"
metadata:
  openclaw:
    emoji: "🔇"
    events: ["before_tool_call"]
---

# No Deaf Polls Hook

Hard blocks `process(action=poll, timeout>10000)` calls. When Skippy blocks on a long poll, he cannot hear the operator's messages. This is the #1 cause of going dark during agent runs.

The fix: use tmux for long-running agents. Fire and forget. Stay available.

This hook makes it physically impossible to go deaf via long polls.
