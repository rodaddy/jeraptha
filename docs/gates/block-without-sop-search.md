# Gate: block-without-sop-search

**Priority:** 70
**File:** `plugin/gates/block-without-sop-search.js`
**Factory:** `createBlockWithoutSopSearch(state, config, log)`

## What

Enforces Standard Operating Procedure (SOP) consultation before process-driven operations. Blocks agent spawns, deployments, git pushes, PR creation, migrations, schema changes, and code swarms unless an SOP search has been performed first.

## Why

SOPs encode hard-won operational knowledge -- deployment sequences, rollback procedures, migration checklists. Agents skip these and improvise, leading to incidents. This gate ensures the agent at least checks whether an SOP exists before executing process-heavy operations.

## How

The gate tracks whether an SOP search has occurred this turn via `state.sopSearchedThisTurn`.

1. **Track SOP searches:** If an `exec`/`bash` call contains `mcp2cli open-brain` and matches `SOP_SEARCH_PATTERNS` (contains "sop" or "standard operating procedure"), mark `sopSearchedThisTurn = true`. Same for `memory_search` with matching query text.
2. **Block agent spawn:** If the tool is `sessions_spawn` and no SOP search has happened, block.
3. **Block process commands:** If the tool is `exec`/`bash` and the command matches `PROCESS_PATTERNS` (git push/merge, gh pr create, deploy, migrate, schema change, drizzle, swarm), and no SOP search has happened, block. The block message includes a specific task type label (e.g., "deployment", "git workflow", "PR creation").

Compliance execs (`mcp2cli` calls) are never blocked. Heartbeat sessions bypass entirely.

## State Dependencies

| State Field | Read/Write | Purpose |
|---|---|---|
| `sopSearchedThisTurn` | Read + Write | Tracks whether SOP was searched this turn |

## Block Message

**Agent spawn:**
> SOP GATE: Spawning agent without checking for an SOP first. Run: ~/.local/bin/mcp2cli open-brain search_brain --params '{"query":"SOP agent spawn","limit":5}' BEFORE spawning. If no SOP exists, note it and proceed.

**Process command (example: deployment):**
> SOP GATE: About to do deployment without checking for an SOP. Run: ~/.local/bin/mcp2cli open-brain search_brain --params '{"query":"SOP deployment","limit":5}' BEFORE proceeding. If an SOP exists, FOLLOW IT.

## Examples

**Blocked:** Agent runs `git push origin main` without searching for a git workflow SOP.

**Blocked:** Agent spawns a sub-agent without checking for an agent spawn SOP.

**Blocked:** Agent runs `deploy-service my-app` without searching for a deployment SOP.

**Allowed:** Agent searches OB for "SOP deployment", then runs `deploy-service my-app`.

**Allowed:** Agent runs `ls -la src/` -- not a process command, no SOP needed.

**Allowed:** Agent runs `mcp2cli some-service check-status` -- compliance exec, never blocked.
