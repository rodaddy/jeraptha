# break-bot-to-bot-loop

**Hook type:** `message_sending`
**Priority:** 120
**Fail mode:** Fail-closed (blocks/cancels outgoing messages)

## Why It Exists

Bot-to-bot conversations quickly devolve into circular, zero-value exchanges. Two agents bouncing messages back and forth produce noise, burn tokens, and never do real work. The operator rule is simple: "more than 5 and you're done."

## How It Works

This is a hard circuit breaker on `message_sending` events.

### Preconditions

- `state.inboundIsBot` must be `true` (set by `reset-per-turn-state`)
- The per-channel banter count must exceed `BOT_BANTER_LIMIT` (5)

### Enforcement

1. **First over-limit message:** Sends a hostile response (randomly selected from `BOT_BANTER_HOSTILE_MESSAGES`) telling the other bot to stop. Sets `hostileSent = true` on the channel's banter state.
2. **All subsequent messages:** Silently cancelled (`{ cancel: true }`). No response at all.

### Reset

Only a **human message** resets the banter counters (handled by `reset-per-turn-state`). The 30-minute rolling window also resets naturally if no bot messages arrive.

## State

- `state.inboundIsBot` -- whether the current inbound was from a bot
- `state.botBanterState` -- `Map<channelKey, { count, windowStart, hostileSent }>`

## Dependencies

- `BOT_BANTER_LIMIT`, `BOT_BANTER_HOSTILE_MESSAGES` from `shared/constants.js`
- Works in tandem with `reset-per-turn-state` (which populates the banter tracking state)
