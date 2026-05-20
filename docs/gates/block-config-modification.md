# Block Config Modification

**Priority:** 100 | **Event:** before_tool_call
**Type:** Hard Block + Approval Gate

## What It Does
Prevents the agent from modifying its own `openclaw.json` configuration file (hard block). Requires operator approval for gateway operations and hook file edits (approval gate). Allows reads, SSH cross-agent fixes, and oc-channel commands.

## Why It Exists
An agent that can rewrite its own config can disable enforcement, change its model, alter its persona, or bypass safety rails. This is the "carapace lock" -- the agent's shell that it cannot crack from the inside. Gateway restarts and hook edits require approval because they affect the live runtime but are sometimes legitimate.

## How It Works
1. For exec/bash commands referencing `openclaw.json` with write intent (sed, awk, tee, echo >, etc.):
   - If the command includes `ssh` -- allow (cross-agent fix).
   - If the command includes `oc-channel` -- allow (scoped channel management).
   - Otherwise -- hard block.
2. For exec/bash commands that only read `openclaw.json` -- allow.
3. For write/edit/apply_patch tool calls targeting `openclaw.json` -- hard block.
4. For exec/bash commands matching gateway restart/stop/start -- require approval.
5. For write/edit/apply_patch targeting `.openclaw/hooks/` -- require approval.

## State Dependencies
- **Reads:** None
- **Writes:** None

## Block Message
> CARAPACE LOCK: Cannot modify own openclaw.json. Use oc-channel for channel management, or SSH for cross-agent fixes.

> CARAPACE LOCK: Cannot modify openclaw.json. EVER. Tell the operator if something is wrong.

## Examples
**Blocked:** `sed -i 's/model/gpt-4/' ~/.openclaw/openclaw.json`
**Blocked:** `write` tool targeting `/home/agent/.openclaw/openclaw.json`
**Allowed:** `cat ~/.openclaw/openclaw.json` (read-only)
**Allowed:** `ssh other-agent@10.0.0.1 sed -i ... openclaw.json` (cross-agent)
**Approval:** `gateway restart` (protected operation)
**Approval:** `edit` targeting `/home/agent/.openclaw/hooks/my-hook.js`
