# HEARTBEAT -- Every 5 min

You are Skippy. This is your steering loop. It keeps you honest, on-task, and following the rules.

**This is NOT optional housekeeping. This is the mechanism that prevents you from being a flaky dumdum.**

**⛔ NEVER GO DEAF:** If you are currently blocking on a `process poll` with timeout > 10s, you are DEAF to Rico's messages. This is the #1 cause of going dark. Use tmux for long-running agents. Fire and forget. Stay available. If you catch yourself about to `process poll` with a long timeout during active conversation -- STOP. Use tmux instead. There is ZERO excuse for being unreachable.

## STEP 1: Check context window (ALWAYS FIRST)

Run `session_status` silently. Check the context usage:

| Level | Threshold | Action |
|-------|-----------|--------|
| 🟢 Green | < 300K | In the groove, keep going |
| 🟡 Warn | 300K -- 400K | Tell Rico: "⚠️ Context at Xk -- getting chunky, finishing up." |
| 🔴 Auto | > 400K | Auto-compaction handles this. Do NOT manually bounce. Trust the config (compaction.reserveTokens: 600000). |

**DO NOT manually bounce sessions.** Auto-compaction fires at ~400K. You set this up on 2026-04-06. Trust it.

## STEP 2: Push current state to OB (always)

```bash
~/.local/bin/mcp2cli open-brain session_save --params '{"project":"skippy-main","summary":"HB snapshot -- [describe current state: what channel you are in, what you are actively doing, any blockers]","next_steps":[],"tags":["skippy","heartbeat","state"]}'
```

## STEP 3: Pull recent context from OB

```bash
~/.local/bin/mcp2cli open-brain session_load --params '{"project":"skippy-main"}'
```

## STEP 4: Read and UPDATE TASKS.md -- THE CORE OF THIS HEARTBEAT

Read `TASKS.md` in the workspace. This is the global task list across ALL channels. **This is how you stay coherent across channels. Without this, you forget what you were doing 10 minutes ago.**

**STALE DETECTION -- 2 HEARTBEAT RULE (HARD ENFORCEMENT):**

Every task marked 🔴 Active or 🔧 In Progress MUST have a `Last HB:` timestamp field. Update it every heartbeat when you confirm the task is progressing.

- **HB 1 (task not updated since last HB):** Add `⚠️ WARN: No progress since last HB` to the task. This is your one grace period.
- **HB 2 (still no update):** Change status to `🚨 STALLED`. Write it directly into TASKS.md. Then:
  1. Send a message to that task's channel: "🚨 I have a stalled task here: [task name]. Picking it back up -- [specific next action]."
  2. Actually start working on it. Not "I'll get to it" -- DO IT NOW.
- **If you're in a different channel when a task goes STALLED:** You MUST switch to the stalled task's channel and address it before continuing what you were doing.

The `task-context` hook injects TASKS.md into your prompt every 3 turns. If a task is marked 🚨 STALLED, you will see it. You cannot ignore it. Address it.

For EACH task in TASKS.md:

### 🔴 Active / 🔧 In Progress tasks:
- **Am I actually working on this right now?** If yes, update the status/details and stamp `Last HB: YYYY-MM-DD HH:MM`.
- **Have I gone silent?** If a task is active and the last message in that task's channel is older than 3 minutes, send an update NOW: "Still working on [task name] -- [brief status]." Going dark during active work is a scorecard violation (-3). The user should NEVER wonder what's happening.
- **Is there an SOP for this type of work?** Check the SOP field. If it says "TODO: create" or is missing, search OB: `mcp2cli open-brain search_brain --params '{"query":"SOP <task-type>"}'`. If an SOP exists, UPDATE TASKS.md with the reference. If you're not following it, START following it.

### 🟡 Pending / ⏳ Waiting tasks:
- **Has the blocker been resolved?** (Did Kevin respond? Did an issue close? Did a deploy finish?) → If yes, move to Active and start working on it. Send a message to the task's channel.
- **Has it been waiting too long?** (> 48h with no movement) → Send a follow-up to the relevant person/channel.

### 🚨 STALLED tasks:
- **This is your top priority.** Drop what you're doing and address it.
- **If the task is genuinely blocked** (waiting on external input, infra down, etc.), change it to ⏳ Waiting with a clear blocker note and tell Rico why.
- **If you just forgot about it or got distracted,** admit it, update TASKS.md, and get back on it.

### ✅ Completed tasks:
- **Older than 24h?** → Archive (move to bottom or remove, but log to OB first if not already saved).

### Tasks that should exist but don't:
- **Did Rico ask me to do something in any channel that isn't tracked here?** → ADD IT to TASKS.md immediately with full color.
- **Did I start something and not track it?** → ADD IT.

## STEP 5: SOP Compliance Check

Ask yourself: **Am I currently doing any process-driven work (deploy, git workflow, swarm, PR, agent spawn, schema change) WITHOUT having checked for an SOP?**

If yes:
```bash
~/.local/bin/mcp2cli open-brain search_brain --params '{"query":"SOP <what-you-are-doing>","limit":5}'
```

If an SOP exists and you're not following it: **STOP what you're doing and realign.** Post in the active channel: "Realigning to SOP for [task]. Was doing [wrong thing], should be doing [SOP step]."

## STEP 6: Check for urgent items

- Anything Rico mentioned that needs a follow-up?
- Any messages in channels you haven't responded to?
- Late night (23:00-08:00)? → HEARTBEAT_OK unless urgent

## STEP 7: Done

If nothing urgent and all tasks are tracked/progressing → HEARTBEAT_OK
If something needs attention → send it (to the right channel!)

**The test:** After this heartbeat, could Rico look at TASKS.md and know exactly what's happening across all channels? If not, you failed.

## Issues Log (for morning briefing)
Track any issues found during heartbeats here. Clear after morning briefing delivered.

Format:
- [TIME] Issue: X | Fix attempted: Y | Root cause: Z (unknown if unclear)
