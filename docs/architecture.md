# Jeraptha Architecture

Behavioral enforcement plugin for OpenClaw AI agents. Prevents agents from skipping compliance steps, contradicting user data, sending sycophantic responses, and going dark during work.

## Core Philosophy

> "If it doesn't block, it gets ignored." — v2.1 decision

Soft prompt injections had 0% compliance across 9 injections/day. Hard blocks that prevent tool execution until compliance actions are taken have near-100% compliance. Every gate that matters is a hard block.

## Plugin System

Jeraptha uses OpenClaw's typed plugin system (`api.on()`). The older managed-hook system (`registerInternalHook()`) does not fire for `before_tool_call` events and is not used.

```
plugin/
├── index.js                              ← Registration layer
├── openclaw.plugin.json                  ← Plugin metadata + config schema
├── shared/                               ← Shared infrastructure
│   ├── constants.js                      ← All regex patterns
│   ├── state.js                          ← Centralized mutable state + reset
│   ├── helpers.js                        ← Utility functions
│   └── paths.js                          ← Workspace file paths
├── gates/                                ← before_tool_call handlers (blocking)
├── injections/                           ← before_prompt_build handlers (context)
└── events/                               ← message_received / message_sending
```

## Event Types

| Event | When It Fires | Can Block? | Can Inject? |
|-------|--------------|------------|-------------|
| `before_tool_call` | Before any tool executes | Yes (`{ block: true, blockReason }`) | No |
| `before_prompt_build` | Before prompt assembly | No | Yes (`{ appendSystemContext }`) |
| `message_received` | When a message arrives | No | No (state management only) |
| `message_sending` | Before outgoing message | Yes (`{ cancel: true }`) | Yes (`{ content }` to replace) |

## Gate Priority Map

Lower priority number = runs later. Higher = runs first. All gates within the same event type run in priority order.

### before_tool_call (Blocking Gates)

| Priority | Gate | Type | What It Enforces |
|----------|------|------|-----------------|
| 110 | observe-tool-call-state | Passive | Tracks writes, messages, skill consults |
| 100 | block-config-modification | Hard Block | Prevents openclaw.json modification |
| 95 | block-destructive-git-commands | Hard Block | No git reset, force push, etc. |
| 92 | block-sed-on-workspace | Hard Block | No sed/awk on workspace .md files |
| 90 | block-long-poll-timeouts | Hard Block | No process polls > 10 seconds |
| 80 | block-without-ob-search | Hard Block | Check knowledge base before asking |
| 70 | block-without-sop-search | Hard Block | Check SOPs before process work |
| 68 | block-without-skill-consult | Hard Block | Check skills before high-risk ops |
| 65 | block-stale-task-file | Hard Block | Keep TASKS.md updated |
| 62 | block-stale-conversation-file | Hard Block | Keep CONVERSATIONS.md updated |
| 58 | block-message-without-context | Hard Block | Load context before responding |
| 55 | block-silent-work-streak | Hard Block | Send status updates during work |
| 52 | block-praise-without-review | Hard Block | Actually review before praising |
| 50 | block-user-data-contradiction | Hard Block | Don't contradict user's data |
| 45 | block-stale-scorecard | Hard Block | Heartbeat: keep scorecard fresh |

### before_prompt_build (Injections)

| Priority | Injection | What It Injects |
|----------|-----------|----------------|
| 60 | inject-resume-after-restart | RESUME.md context after gateway bounce |
| 50 | score-and-inject-user-sentiment | Behavioral alert on negative sentiment |
| 40 | inject-stalled-task-alert | STALLED task urgency notice |
| 35 | inject-skill-index-periodically | Available skills reminder every 10 turns |

### Other Events

| Event | Handler | What It Does |
|-------|---------|-------------|
| message_received | reset-per-turn-state | Reset flags, increment turn, track bots |
| message_sending (p120) | break-bot-to-bot-loop | Circuit breaker on bot-to-bot exchanges |

## Shared State

All gates share a single state object created at plugin registration. State is passed to each gate factory function.

### Per-Turn State (reset on each message_received)

| Field | Type | Used By |
|-------|------|---------|
| `obQueriedThisTurn` | boolean | block-without-ob-search |
| `sopSearchedThisTurn` | boolean | block-without-sop-search |
| `skillConsultedThisTurn` | boolean | block-without-skill-consult |
| `contradictionCountThisTurn` | number | block-user-data-contradiction |
| `reviewPromisedThisTurn` | boolean | block-praise-without-review |
| `reviewAgentSpawned` | boolean | block-praise-without-review |
| `prReviewContext` | boolean | block-praise-without-review |

### Session State (persists across turns)

| Field | Type | Used By |
|-------|------|---------|
| `currentTurn` | number | Most gates (grace period, freshness) |
| `lastTasksWriteTurn` | number | block-stale-task-file |
| `lastConversationsWriteTurn` | number | block-stale-conversation-file |
| `lastScorecardWriteTime` | number | block-stale-scorecard |
| `lastMessageReceivedTime` | number | block-stale-scorecard |
| `toolCallsSinceMessage` | number | block-silent-work-streak |
| `tasksReadThisSession` | boolean | block-message-without-context |
| `conversationsReadThisSession` | boolean | block-message-without-context |
| `obContextLoadedThisSession` | boolean | block-message-without-context |
| `sentimentLastMsg` | string | score-and-inject-user-sentiment |
| `promptTurnCount` | number | inject-skill-index-periodically |
| `resumeConsumed` | boolean | inject-resume-after-restart |
| `contradictionGateFailures` | number | block-user-data-contradiction |
| `botBanterState` | Map | break-bot-to-bot-loop |
| `inboundIsBot` | boolean | break-bot-to-bot-loop |

## Gate Bypass Patterns

### Heartbeat Session Bypass
Gates that check `isHeartbeatSession(ctx)` skip enforcement for isolated heartbeat sessions. The heartbeat IS the compliance mechanism — blocking it creates deadlocks.

### Compliance Exec Bypass
`mcp2cli` calls are infrastructure/compliance operations. Blocking them prevents the agent from DOING the compliance the gates require.

### Grace Period
Most gates have a grace period (default: 5 turns) at session start. The agent needs time to load context before enforcement kicks in.

## Adding a New Gate

1. Create `plugin/gates/<verb>-<condition>.js` with the factory pattern
2. Import shared modules as needed (constants, helpers, paths, state fields)
3. Add any new state fields to `plugin/shared/state.js` (both `createState` and `resetPerTurnState`)
4. Register in `plugin/index.js` with appropriate priority
5. Write tests at `tests/gates/<name>.test.ts`
6. Write docs at `docs/gates/<name>.md`
7. Update this architecture doc's priority map

## Deployment

```bash
./install.sh --workspace ~/.openclaw/workspace
```

Copies the full `plugin/` directory to `~/.openclaw/extensions/jeraptha/`. Gateway restart required for changes to take effect.

## External Dependencies

| Dependency | Used By | Failure Mode |
|-----------|---------|-------------|
| LiteLLM (configurable, default 10.71.1.33:4000) | block-user-data-contradiction | Fail-open (allows message). Tracks consecutive failures via `contradictionGateFailures`. |
| Filesystem (~/.openclaw/workspace/) | Multiple gates | Fail-open (skip enforcement) |
| mcp2cli | OB/SOP compliance detection | N/A (is the compliance tool) |
