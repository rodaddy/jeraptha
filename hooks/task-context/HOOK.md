---
name: task-context
description: "Injects active TASKS.md content into every prompt to prevent cross-channel task amnesia"
metadata:
  openclaw:
    emoji: "📋"
    events: ["before_prompt_build"]
---

# Task Context Injection Hook

Every N turns, reads TASKS.md from the workspace and injects the active/pending tasks into the prompt. This ensures the agent ALWAYS knows what tasks are active across all channels, even between heartbeats.

Also injects SOP compliance reminders for process-driven work.

Prevents the #1 failure mode: "I forgot I was doing something in another channel."
