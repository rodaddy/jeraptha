# block-user-data-contradiction

**Hook type:** `before_tool_call`
**Priority:** 50
**Event:** message sends only
**Fail mode:** Fail-open (LiteLLM errors do not block)

## Why It Exists

**The Mushroom Incident (2026-05):** A user posted a data table showing `May 16 | Fri | STILL MISSING`. The agent ran Python's `datetime`, got "Saturday", and confidently told the user they were wrong -- three times. The agent never once cross-checked against the user's actual data. It treated its own computation as ground truth and dismissed the user's firsthand data.

This gate prevents an agent from contradicting facts the user explicitly provided. The agent's job is to work with the user's data, not override it with a single computation.

## How It Works

1. Intercepts outgoing `message` tool calls
2. Extracts up to the **last 5 user messages** (not just the most recent) and the bot's outgoing text
3. Sends both to LiteLLM (configurable model, temperature 0) with a fact-checking prompt, using a **5-second fetch timeout**
4. Parses the response using **3-tier JSON extraction**: direct parse, markdown-fence stripping, outermost-brace extraction
5. If LiteLLM finds a factual contradiction, the gate blocks

### Escalating Enforcement

- **1st contradiction:** Soft block. Tells the agent to verify from 2+ independent sources before responding.
- **2nd contradiction (same turn):** Hard block. Demands the agent re-read the user's message, list the facts stated, and verify each independently.

### What Counts as a Contradiction

Only **factual** contradictions: dates, numbers, data points, specific claims the user made. Opinions, preferences, and subjective judgments are ignored.

### What Gets Skipped

- Non-message tool calls (exec, read, write, etc.)
- Bot messages under 10 characters
- User messages under 10 characters
- Turns with no user message in the history

## State

- `state.contradictionCountThisTurn` -- incremented on each detected contradiction, reset per turn
- `state.contradictionGateFailures` -- consecutive LiteLLM failures; warns in logs after 5

## Configuration

- `config.litellmUrl` -- LiteLLM endpoint (default: `http://10.71.1.33:4000/v1/chat/completions`)
- `config.litellmModel` -- model alias (default: `flash`)
- `config._fetch` -- override for `globalThis.fetch` (used in testing)

## Security

- User message and bot response are truncated to 2000 chars each in the prompt (template literals, no user-controlled format strings)
- `result.detail` is sanitized: truncated to 150 chars, angle brackets/braces stripped

## Dependencies

- LiteLLM (URL and model configurable via config)
- `getToolName`, `getMessageText`, `getMessages` from `shared/helpers.js`
