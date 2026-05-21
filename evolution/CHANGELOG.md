# Evolution Changelog -- The Wager History

*Every change is a bet. Every bet gets tracked. That's the Jeraptha way.*

---

## v3.1.3 -- 2026-05-20 -- "No Blank Replies"

**Trigger: Some Discord channels showed Skippy typing and then going blank. Live logs showed stale TASKS.md freshness blocking a `message` tool call at priority 65, followed by an exact `NO_REPLY` final payload.**

### Fixed
- Stale TASKS.md and CONVERSATIONS.md freshness gates no longer hard-block `message` delivery.
- Stale freshness still blocks `exec`/`bash` work tools after thresholds.
- Stale message delivery is logged as a warning so stale context remains visible in debug logs.
- `toolCallsSinceMessage` now resets on successful `message_sent`, not before message gates run, so blocked or failed messages are not counted as delivered.

### Validation
- Focused message/freshness/comms regression suite: 66 pass, 0 fail.
- Full suite: 276 pass, 0 fail.
- Review swarm found and verified the blocked-message state drift issue before release.
- OpenClaw source verification: `message_sent` includes a `success` flag after channel delivery, so failed sends do not reset the silent-work counter.

## v3.1.2 -- 2026-05-20 -- "Heredoc Recovery"

**Trigger: Skippy could execute and read again after v3.1.1, but heredoc writes to CONVERSATIONS.md still tripped the SOP gate when the body mentioned deployment.**

### Fixed
- Context recovery now recognizes single-purpose `cat`/`tee` heredoc writes to workspace `TASKS.md` and `CONVERSATIONS.md`.
- SOP gate allows those heredoc recovery writes even when the heredoc body contains process words such as deployment.
- Mixed commands, command substitution, wrong-path context files, and non-context heredoc writes remain blocked.

### Validation
- Focused regression suite: 50 pass, 0 fail.
- Full suite: 271 pass, 0 fail.

## v3.1.1 -- 2026-05-20 -- "Gate Cascade Breaker"

**Trigger: Skippy gate deadlock under high context.** Context, task, conversation, SOP, and skill gates cascaded until the agent could not update context, compact, or send a useful status.

### Fixed
- Context recovery commands are now strict, workspace-scoped, and single-purpose.
- Stale TASKS/CONVERSATIONS gates now use the same strict recovery predicate instead of raw filename matching.
- Shell reads no longer count as writes or refresh write-turn state.
- Shell writes no longer update freshness before execution succeeds; disk mtime repair handles successful updates afterward.
- Skill consult detection now requires content reads of workspace skill files, not `ls`, wrong-path files, comments, or metadata touches.
- Recovery bypasses reject shell control, command substitution, mixed commands, executable read tools, `sed`/`perl`, runtime code writes, and wrong-path context files.

### Validation
- Review swarm ran correctness, adversarial, quality, security, general, Skippy SME, and OpenClaw/Jeraptha SME lanes across multiple rounds.
- Focused regression suite: 88 pass, 0 fail.
- Full suite: 269 pass, 0 fail.

## v3.0.0 -- 2026-05-20 -- "No More Mushrooms"

**Trigger: The mushroom incident.** Agent ran Python's `datetime`, got "Saturday" for May 16, and confidently told the user they were wrong about their own data -- three times. The agent had rules telling it to verify. It ignored them. Rules that don't block get ignored.

### Architecture shift
906-line monolithic `index.js` → modular architecture. Every gate is a separate file with its own tests and docs. `index.js` is now an 85-line registration layer.

### Added
- **block-user-data-contradiction** (before_tool_call, p50) -- Calls LiteLLM flash model to check if outgoing messages contradict user-provided data. Escalating: soft block on first contradiction, hard block on second. Fail-open if LiteLLM is down.
- **block-praise-without-review** (before_tool_call, p52) -- Anti-sycophancy gate. When a PR/code review is shared, agent can praise + commit to review, but MUST spawn a review agent before sending another message. Praise without follow-through gets hard blocked.
- **Full test suite** -- 224 tests across 23 files using `bun test`. Zero tests existed before. Every gate has input/output functional tests.
- **Per-gate documentation** -- `docs/gates/`, `docs/injections/`, `docs/events/` with what/why/how/examples for every gate.
- **Architecture doc** -- `docs/architecture.md` with priority map, state dependencies, event flow.
- **Shared modules** -- `plugin/shared/` with constants, state, helpers, paths. All gates import from shared.
- **Test fixtures** -- `tests/_fixtures/` with event factory, state factory, LiteLLM mock.

### Changed
- All 19 existing gates extracted from `index.js` into individual files under `plugin/gates/`, `plugin/injections/`, `plugin/events/`.
- All files renamed from generic `handler.ts` to descriptive names (e.g., `block-without-ob-search.js`, `score-and-inject-user-sentiment.js`).
- Gate factory pattern: `createGateName(state, config, log)` returns async handler. Shared state passed at registration.
- `install.sh` updated to copy full `plugin/` directory (was just index.js + json).
- Version bumped to 3.0.0 (breaking: directory structure).

### Removed
- Legacy `hooks/*/handler.ts` files -- dead code since v2.0 (managed hooks don't fire for `before_tool_call`).

### The bet (updated)
Can an LLM-backed enforcement gate catch contradictions that regex can't? Can blocking sycophantic praise force real code review? Odds: 3-1 in favor. The mushroom incident proves soft rules fail. The contradiction gate proves LLM-in-the-loop enforcement is feasible at zero cost (flash model is free).

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
