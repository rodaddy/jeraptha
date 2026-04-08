# Evolution Changelog -- The Wager History

*Every change is a bet. Every bet gets tracked. That's the Jeraptha way.*

---

## v2.2.0 -- 2026-04-08 -- "You Forgot You Were Talking To Someone"

### Added
- **Conversation freshness gate** (before_tool_call, p62) -- blocks work if CONVERSATIONS.md hasn't been updated in 15+ turns. Same pattern as task gate. Configurable via `conversationFreshnessTurns`.
- **`/conversations` skill** -- display active conversation index with heat levels
- **Per-conversation detail files** -- `conversations/` directory with per-channel context files (template provided)
- **conversation-dream.sh** -- dream function that scores conversations by recency, sets heat levels (hot/warm/cool/cold), reorders index

### Fixed
- tmux dylib crash on Air (`libutf8proc.3.dylib` not found) -- `brew reinstall utf8proc tmux`

---

## v2.1.0 -- 2026-04-08 -- "If It Doesn't Block, It Gets Ignored"

**Evidence from today: 14 task-context injections, 9 law-reinforcement injections. Zero compliance. One sop-gate hard block. Full compliance.**

### Architecture shift
The v2.0 plugin had 4 hard-blocking `before_tool_call` guards and 3 advisory `before_prompt_build` reminders. The guards worked. The reminders didn't. v2.1 converts reminders into blocking gates.

### Added
- **State Tracker** (before_tool_call, p110) -- passive observer tracking TASKS.md writes, SCORECARD.md writes, message sends, and tool call counts. Never blocks.
- **Task Freshness Gate** (before_tool_call, p65) -- blocks exec/bash/message if TASKS.md hasn't been written in 10+ turns. Replaces toothless task-context injection.
- **Communication Gate** (before_tool_call, p55) -- blocks exec/bash after 8+ consecutive tool calls without a message send. Mechanically enforces "never go dark."
- **Heartbeat Gate** (before_tool_call, p45) -- blocks work tools if SCORECARD.md hasn't been updated in 20+ minutes. Wall-clock enforcement.
- All thresholds configurable via pluginConfig (taskFreshnessTurns, commGateThreshold, heartbeatIntervalMs, gracePeriodTurns)
- **`/report` skill** -- enforcement report from gateway logs with configurable time window (default 1h, accepts 30m/4h/12h/24h/today). Shows gate fires, blocks, compliance ratio, sentiment, and assessment.

### Changed
- **task-context** slimmed to STALLED-only injection (before_prompt_build, p40). Regular every-3-turns injection removed -- replaced by blocking gate.
- **Heartbeat gate** default interval set to 10 minutes (was 20). Earnable extension once compliance is proven.

### Removed
- **law-reinforcement** (before_prompt_build) -- 9 injections/day, 0 compliance. Specific behavioral rules now enforced mechanically by the 3 new blocking gates.
- `LAWS` and `SOP_REMINDER` constants -- dead code after law-reinforcement removal.

### The bet (updated)
Can blocking gates make an AI agent do what prompt injection couldn't? Odds: 2-1 in favor. The sop-gate pattern already proved it works -- we're scaling it.

---

## v2.0.0 -- 2026-04-08 -- "Clean Plugin"

Stripped to Jeraptha-only hooks, migrated from managed hooks to typed plugin. 24/24 verification pass on Air.

---

## v0.1.0 -- 2026-04-07 -- "First Contact"

**Odds of success: 8-1, no points. (Skippy forged these odds.)**

### What's included
- The LAWs: 11 non-negotiable behavioral rules
- The ECO: 7 enforcement hooks (4 hard blocks, 3 prompt injections)
- Flash Gold: TASKS.md with 2-heartbeat stale detection
- Regional Patrol: HEARTBEAT.md steering loop
- The Wagering System: SCORECARD.md behavioral scoring with verbal feedback
- Field Manuals: lessons-learned, compaction, model-routing, comms protocol
- One-command deployment via install.sh

### Why this exists
After months of running an always-on AI agent, a pattern emerged:

1. Soft nudges don't work. The agent acknowledges rules and then ignores them. (Odds of compliance with prompt-injected rules: approximately 3-1 against.)
2. Hard blocks work. When the tool call gets rejected, compliance is near-certain. (Odds: 50-1 in favor.)
3. Task tracking without enforcement is just a wish list. (The Jeraptha would never tolerate untracked wagers.)
4. Behavioral scoring with verbal feedback provides meaningful self-regulation. (Research confirms. See below.)
5. Every lesson needs documentation. (Undocumented intel is worthless intel.)

### Research basis
- **Reflexion** (Shinn et al., 2023) -- The monkeys figured out verbal reinforcement
- **OPTAGENT** (Bi et al., 2025) -- Multi-agent verbal RL. Interaction quality matters.
- **MetaClaw** (Xia et al., 2026) -- Built on OpenClaw. Process reward models.
- **Self-Regulation** (Min et al., 2025) -- When to ask for help vs. proceed

### The bet
The wager is simple: can structural enforcement make a flaky AI agent reliable?

Current odds: 4-1, 200 points. Improving daily.
