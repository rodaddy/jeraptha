# Block Destructive Git Commands

**Priority:** 95 | **Event:** before_tool_call
**Type:** Hard Block

## What It Does
Prevents the agent from running destructive git commands (`reset`, `clean -f`, `checkout .`, `restore .`, `branch -D`, `push --force`, `stash drop`, `stash clear`). Also blocks `cd+git` chains and heredoc file writes (except git commit message heredocs).

## Why It Exists
Agents running destructive git commands can silently lose uncommitted work, force-push over team commits, or delete branches. These operations are irreversible and should only be run by a human who understands the consequences. The `cd+git` chain block exists because chaining `cd` with `git` breaks permission matching in the execution layer. Heredoc file writes corrupt configs because shell expansion and quoting issues are invisible in heredocs.

## How It Works
1. Skip entirely for heartbeat sessions (they need git access for compliance checks).
2. Only applies to exec/bash tool calls.
3. Check the command against the destructive git pattern list -- hard block on match.
4. Check for `cd <path> && git` or `cd <path> ; git` chains -- hard block.
5. Check for heredoc writes (`<<EOF` with `cat >`, `tee`, or `>>`) -- hard block, unless it is a git commit message heredoc pattern.

## State Dependencies
- **Reads:** None (uses context for heartbeat check)
- **Writes:** None

## Block Message
> DESTRUCTIVE GIT BLOCK: "[command]" can NEVER be run by an agent. This is a hard block with no override. Copy the command and run it yourself if needed.

> CHAIN BLOCK: Do not chain cd with git. Use "git -C /path command" or separate exec calls.

> HEREDOC BLOCK: Heredocs that write to files are blocked -- they corrupt configs. Use Write/Edit tools.

## Examples
**Blocked:** `git reset --hard HEAD~1`
**Blocked:** `git push origin main --force`
**Blocked:** `cd /project && git push origin main`
**Blocked:** `cat > /etc/config <<EOF ... EOF`
**Allowed:** `git commit -m "$(cat <<EOF ... EOF)"` (commit message heredoc)
**Allowed:** `git status`, `git log`, `git push origin feature-branch`
**Allowed (heartbeat):** Any git command in a heartbeat/isolated session
