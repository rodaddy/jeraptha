# Block Sed on Workspace

**Priority:** 92 | **Event:** before_tool_call
**Type:** Hard Block

## What It Does
Prevents agents from using `sed` on `.openclaw/workspace/*.md` files. Forces use of the write tool (full file overwrite) instead.

## Why It Exists
Agents repeatedly used `sed` to update TASKS.md and SCORECARD.md instead of the write tool. Each `sed` command triggers an exec approval popup because it modifies protected workspace files. This generated 10+ approval popups in a single day (2026-05-15). The agent was told to stop 5 separate times and ignored the instruction every time. "If it doesn't block, it gets ignored."

## How It Works
1. Only applies to exec/bash tool calls.
2. Checks if the command contains `sed` AND references a `.openclaw/workspace/*.md` path.
3. If both match -- hard block with instructions to use the write tool.

## State Dependencies
- **Reads:** None
- **Writes:** None

## Block Message
> SED BLOCK: Do NOT use sed on workspace .md files. Use the write tool (full file overwrite) instead. Read the file, modify in memory, write back. sed triggers exec approval popups. This has been explained 5 times. Now it's enforced.

## Examples
**Blocked:** `sed -i 's/IN_PROGRESS/DONE/' ~/.openclaw/workspace/TASKS.md`
**Blocked:** `sed 's/Score: 5/Score: 6/' ~/.openclaw/workspace/SCORECARD.md`
**Allowed:** `cat ~/.openclaw/workspace/TASKS.md` (read, not sed)
**Allowed:** `sed -i 's/old/new/' /project/config.yml` (not in workspace)
**Allowed:** `write` tool targeting `~/.openclaw/workspace/TASKS.md` (correct approach)
