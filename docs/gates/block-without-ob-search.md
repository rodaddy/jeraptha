# Gate: block-without-ob-search

**Priority:** 80
**File:** `plugin/gates/block-without-ob-search.js`
**Factory:** `createBlockWithoutObSearch(state, config, log)`

## What

Enforces knowledge base consultation before factual questions or file searches. Prevents agents from asking questions or grepping codebases when the answer likely exists in the knowledge base already.

Also catches degenerate knowledge base queries (wildcard `*` or empty strings) that return garbage results.

## Why

Agents default to grepping files or asking the user for information that has already been captured in the knowledge base. This wastes time and creates the impression the agent has no memory. Forcing a knowledge base search first ensures institutional knowledge is used before falling back to exploration.

Wildcard/empty queries are blocked because vector similarity on `*` returns random entries, not all entries. Agents learn this pattern from training data and it never works.

## How

The gate tracks whether the knowledge base has been queried this turn via `state.obQueriedThisTurn`.

1. **Track queries:** If the tool call is `exec`/`bash` containing `open-brain`, or `memory_search`, mark `obQueriedThisTurn = true`.
2. **Block bad queries:** If the `exec`/`bash` contains `open-brain` with a wildcard (`*`) or empty query, block immediately.
3. **Block factual questions:** If the tool is `message` and the text matches `QUESTION_PATTERNS` but not `EXEMPT_QUESTIONS`, and no OB query has happened this turn, block.
4. **Block grep/find:** If the tool is `exec`/`bash` with `grep`, `rg`, `find`, or `fd` (excluding exempt paths like `TASKS.md`, `SCORECARD`, etc.), and no OB query has happened this turn, block.

Compliance execs (`mcp2cli` calls) are never blocked. Heartbeat sessions bypass entirely.

## State Dependencies

| State Field | Read/Write | Purpose |
|---|---|---|
| `obQueriedThisTurn` | Read + Write | Tracks whether OB was queried this turn |

## Block Message

**Factual question:**
> OB GATE: You are asking a factual question without checking Open Brain first. Run: ~/.local/bin/mcp2cli open-brain search_all --params '{"query": "your question"}' FIRST. If OB doesn't have the answer, THEN ask the user and mention you checked.

**Bad query:**
> OB GATE: Do NOT use "*" or empty queries with OB. Wildcard does vector similarity on the literal asterisk -- it returns random garbage, not all entries. Use a real natural language query like "jeraptha hooks" or "king capital deploy". Use search_all (not search_brain) for broad searches. Use tags for filtering.

**Grep without OB:**
> OB GATE: Searching project files without checking Open Brain first. Run: mcp2cli open-brain search_all --params '{"query": "what you need"}' BEFORE grepping.

## Examples

**Blocked:** Agent sends message "What is the IP of the database server?" without querying OB first.

**Blocked:** Agent runs `grep -r 'port' config/` without querying OB first.

**Blocked:** Agent runs `mcp2cli open-brain search_all --params '{"query": "*"}'` (wildcard query).

**Allowed:** Agent queries OB, then asks "What is the IP of the database server?" -- OB was checked first.

**Allowed:** Agent sends "Should I proceed with this approach?" -- exempt question pattern.

**Allowed:** Agent runs `grep 'status' TASKS.md` -- exempt path.
