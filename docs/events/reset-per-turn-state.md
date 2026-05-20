# reset-per-turn-state

**Hook type:** `message_received`
**Priority:** N/A (event handler, runs on every incoming message)

## What It Does

Resets all per-turn flags and manages the bot-banter circuit breaker tracking. Runs on every `message_received` event before any gates evaluate the new turn.

## Responsibilities

### 1. Per-Turn State Reset

Calls `resetPerTurnState(state)` which clears:
- `obQueriedThisTurn`
- `sopSearchedThisTurn`
- `skillConsultedThisTurn`
- `contradictionCountThisTurn`
- `reviewPromisedThisTurn`
- `reviewAgentSpawned`
- `prReviewContext`

### 2. Turn Counter

Increments `state.currentTurn` and `state.promptTurnCount`, and updates `state.lastMessageReceivedTime`.

### 3. Bot-Banter Tracking

Detects whether the inbound message is from a bot (checks `metadata.bot`, `metadata.author.bot`, `metadata.isBot`, `metadata.sender.bot`).

**Bot message:**
- Sets `state.inboundIsBot = true`
- Increments the per-channel banter counter
- If the rolling window (30 min) has expired, resets the counter

**Human message:**
- Clears all banter counters across all channels
- Sets `state.inboundIsBot = false`

The banter data is stored in `state.botBanterState` (a `Map<string, { count, windowStart, hostileSent }>`). Channel key falls back from `channelId` to `conversationId` to `"global"`.

## Dependencies

- `resetPerTurnState` from `shared/state.js`
- `BOT_BANTER_WINDOW_MS` from `shared/constants.js`
