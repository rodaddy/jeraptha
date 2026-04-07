---
name: no-self-surgery
description: "Blocks agent from modifying its own config, restarting gateway, or editing bootstrap files"
metadata:
  openclaw:
    emoji: "🔒"
    events: ["before_tool_call"]
---

Prevents the agent from performing self-surgery -- editing openclaw.json,
restarting the gateway, modifying BOOT.md/SOUL.md/AGENTS.md, or running
commands that affect the OpenClaw runtime.
