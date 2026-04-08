---
name: tasks
description: Show current task board from TASKS.md -- active, pending, stalled, and recently completed tasks across all channels.
triggers:
  - /tasks
  - show tasks
  - what are you working on
  - task board
  - task list
  - what's active
user-invocable: true
---

# Tasks -- Cross-Channel Task Board

Read TASKS.md from the workspace and display the current task board formatted for Discord.

## Instructions

When triggered, read `TASKS.md` from the workspace root.

Format the output for Discord using stacked block format (NOT markdown tables -- they render badly on mobile).

### Format Rules

For each task section (🔴 Active, 🟡 Pending, 🚨 Stalled, 🏗️ Infrastructure):

```
**🔴 [Task Name]**
> Channel: #channel-name
> Status: [status emoji + text]
> Last HB: [timestamp if available]
> Next: [specific next action]
> Blocker: [if any]
```

If a section has no tasks, show: `_None_`

### Section Order
1. 🚨 STALLED (if any -- these go FIRST, they're urgent)
2. 🔴 Active
3. 🔧 In Progress
4. 🟡 Pending / Waiting
5. 🏗️ Infrastructure
6. ✅ Completed (last 24h) -- summary only, not full detail

### Footer
Include current score from SCORECARD.md if it exists:
`📊 Behavioral Score: [X] | Mode: [🟢/🟡/🟠/🔴]`

### If TASKS.md doesn't exist
Reply: "📋 No TASKS.md found. Nothing is being tracked. That's either zen or a problem."
