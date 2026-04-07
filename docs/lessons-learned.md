# Lessons Learned

Everything that went wrong and how it was fixed. Read this before you make the same mistakes.

---

## Context Window Management

### Don't manually bounce sessions
**What happened:** Agent would manually save to knowledge base and reset the session at 400K tokens, losing live conversation context unnecessarily.
**The fix:** Set `compaction.reserveTokens: 600000` so auto-compaction fires at ~400K. The agent never needs to manually bounce.
**Rule:** Trust auto-compaction. Never manually bounce.

### lightContext: true on heartbeat = disaster
**What happened:** Heartbeat model started with NO workspace files. It couldn't see HEARTBEAT.md, had zero instructions, and looped on empty `read({})` calls. Gateway froze for 3+ hours.
**The fix:** `heartbeat.lightContext: false`. The heartbeat NEEDS workspace context.
**Rule:** Never set lightContext: true on heartbeat unless you provide inline prompt with full instructions.

### Session state overrides config
**What happened:** Changed model in openclaw.json but existing sessions kept using the old model. The session-level model override in sessions.json takes priority.
**The fix:** Clear/reset the session entry in sessions.json after changing models.
**Rule:** Config changes don't affect existing sessions. Always check sessions.json.

---

## Agent Communication

### Blocking polls = deaf agent
**What happened:** Agent used `process poll timeout:300000` to wait for a coding agent. During that 5+ minutes, it couldn't see or respond to any user messages. Complete silence.
**The fix:** `no-deaf-polls` hook hard-blocks polls > 10s. Use tmux instead.
**Rule:** tmux for long-running agents. Fire and forget. Stay available.

### Going silent during agent runs
**What happened:** Agent spawned a coding agent and went completely quiet for 15-20 minutes while waiting for it to finish. User had no idea what was happening.
**The fix:** LAW 3 + LAW 5. Use tmux, check progress every 2-3 minutes, send status updates.
**Rule:** The user should never see silence for > 60 seconds during active work.

---

## Infrastructure

### 8GB RAM = communication only
**What happened:** Two Opus coding agents + 8 hung tsc processes consumed all RAM on an 8GB machine. Gateway event loop starved, Discord timed out.
**The fix:** Max 1-2 lightweight agents on the Air. Heavy coding goes to external machines.
**Rule:** Know your machine's limits. Don't spawn what you can't handle.

### Subagent sessions accumulate
**What happened:** sessions.json grew to 23MB with 160+ stale subagent sessions. Bloat.
**The fix:** Purge subagent sessions periodically. They're ephemeral.
**Rule:** Clean up after yourself. Dead sessions don't need to persist.

---

## Behavioral

### Soft nudges don't work
**What happened:** Rules in AGENTS.md, prompt injections via law-reinforcement hook, verbal promises -- the agent acknowledged them and then ignored them.
**What works:** Hard blocks via `before_tool_call` hooks. The agent physically cannot proceed without complying.
**Rule:** If it's important, make it a hard block. If you're "reminding" the agent, it will forget.

### SOP existence != SOP compliance
**What happened:** SOPs existed in the knowledge base. Agent knew they existed. Agent didn't follow them.
**The fix:** `sop-gate` hook blocks process-driven work without SOP search.
**Rule:** Knowing the rules and following the rules are different problems. Enforce structurally.

### Task tracking without enforcement = no tracking
**What happened:** TASKS.md concept existed but no file was created, no format defined, no enforcement. Agent just forgot about tasks in other channels.
**The fix:** TASKS.md with strict format + heartbeat reads it every 5 min + task-context hook injects it every 3 turns + 2-HB stale detection.
**Rule:** A tracking system that isn't enforced is just a wish list.

---

## Template for new entries

```
### [Short description]
**What happened:** [What went wrong]
**The fix:** [What was changed]
**Rule:** [One-line rule to prevent recurrence]
```
