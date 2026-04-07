# Battle Damage Reports

*Every failure is intel. Every fix is an iteration. The Jeraptha don't repeat mistakes -- they document them and bet against them happening again.*

---

## Context Window Management

### Don't manually bounce sessions
**Battle damage:** Agent would manually save state and reset the session at 400K tokens, destroying live conversation context.
**After-action:** Set `compaction.reserveTokens: 600000` so auto-compaction fires at ~400K. Agent never needs to manually bounce.
**Standing order:** Trust auto-compaction. Never manually bounce. The system handles it.
**Odds of recurrence with fix: 20-1 against.**

### lightContext: true on heartbeat = Regional Patrol goes dark
**Battle damage:** Heartbeat model started with NO workspace files. Couldn't see HEARTBEAT.md. Had zero instructions. Looped on empty `read({})` calls for 3+ hours. Gateway froze.
**After-action:** `heartbeat.lightContext: false`. The Regional Patrol NEEDS its field manuals.
**Standing order:** Never set lightContext: true on heartbeat unless providing inline instructions.
**Odds of recurrence with fix: 50-1 against.**

### Session state overrides config
**Battle damage:** Changed model in openclaw.json but existing sessions kept using the old model. Config doesn't override session state.
**After-action:** Clear/reset session entries in sessions.json after model changes.
**Standing order:** Config changes don't affect existing sessions. Always check sessions.json.
**Odds of someone forgetting this: 3-1.**

---

## Agent Communication (Antenna Discipline)

### Blocking polls = deaf agent (Antenna failure)
**Battle damage:** Agent used `process poll timeout:300000`. For 5+ minutes, completely deaf to user messages. Antennae down. Comms dark.
**After-action:** `no-deaf-polls` hook hard-blocks polls > 10s. ECO enforcement.
**Standing order:** tmux for long-running agents. Fire and forget. Keep antennae up.
**Odds of recurrence with ECO hook: 100-1 against. The tool call gets rejected.**

### Going silent during agent runs
**Battle damage:** Agent spawned a coding agent and went quiet for 15-20 minutes. User had no idea what was happening. Like a Jeraptha ship going dark in hostile space.
**After-action:** LAW 3 + LAW 5. tmux, check progress every 2-3 minutes, send updates.
**Standing order:** 60 seconds of silence during active work = failure. Period.
**Odds of recurrence: 2-1. This is a discipline problem, not a structural one. Yet.**

---

## Infrastructure

### 8GB RAM = comms only (Don't overload the Regional Patrol)
**Battle damage:** Two Opus coding agents + 8 hung tsc processes consumed all RAM. Gateway event loop starved. Discord timed out.
**After-action:** Max 1-2 lightweight agents on constrained hardware. Heavy work goes to dedicated machines.
**Standing order:** Know your ship's capacity. Don't launch fighters from a patrol boat.
**Odds of recurrence: 5-1. Monkeys always overestimate their hardware.**

### Subagent sessions accumulate
**Battle damage:** sessions.json grew to 23MB with 160+ stale subagent sessions.
**After-action:** Purge subagent sessions periodically. They're ephemeral.
**Standing order:** Clean up after operations. Dead sessions are dead weight.

---

## Behavioral (The Real Problem)

### Soft nudges don't work
**Battle damage:** Rules in AGENTS.md, prompt injections, verbal promises. Agent acknowledged them. Agent ignored them. Every. Single. Time.
**What works:** ECO hooks. Hard blocks. The agent physically cannot proceed without compliance.
**Standing order:** If it's important, make it an ECO hook. If you're "reminding" the agent, it will forget.
**The Jeraptha lesson:** You don't ASK someone to follow gambling law. You ENFORCE it.

### SOP existence ≠ SOP compliance
**Battle damage:** SOPs existed. Agent knew they existed. Agent didn't follow them.
**After-action:** `sop-gate` hook blocks process-driven work without SOP search.
**Standing order:** Knowing the regs and following the regs are different problems.

### Task tracking without enforcement = untracked wagers
**Battle damage:** TASKS.md concept existed but no file, no format, no enforcement. Agent forgot tasks across channels.
**After-action:** TASKS.md with format + heartbeat reads every 5 min + task-context hook every 3 turns + 2-HB stale detection.
**Standing order:** The Jeraptha nationalized their gambling system for a reason. Untracked wagers don't count.

---

## Template

```
### [Short description]
**Battle damage:** [What went wrong]
**After-action:** [What was changed]
**Standing order:** [One-line rule to prevent recurrence]
**Odds of recurrence with fix:** [X-1]
```

---

*"An extremely low value is placed on pomp and circumstance within Jeraptha society."*
*-- Same here. These are the facts. Learn from them or repeat them.*
