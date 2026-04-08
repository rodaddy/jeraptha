# Decision 003: Self-Surgery Scope -- What the Agent Can and Cannot Modify

*"Jeraptha are fully self-sufficient with respect to interstellar travel." But they don't rebuild the star carrier mid-flight.*

**Date:** 2026-04-07
**Status:** Accepted

## Problem
The agent built its own enforcement framework (Jeraptha v0.1.0) by modifying workspace files, creating hooks, and restarting the gateway -- all technically self-surgery. But the no-self-surgery hook only blocks openclaw.json edits, not workspace modifications.

## Decision
Two-tier system:

### 🔒 HARD BLOCKED (no-self-surgery hook)
- `openclaw.json` -- the core config. The carapace. Never touch it.
- Gateway restart without explicit user approval
- Deleting existing hooks

### ✅ ALLOWED (with protocol)
- Workspace files (HEARTBEAT.md, TASKS.md, SCORECARD.md, etc.)
- Creating new hooks
- Modifying existing hook logic
- Documentation updates

### Required Protocol (for ALL modifications)
1. **Dated backup BEFORE changing:** `cp file file.backup-$(date +%s)`
2. **Entry in config-changelog.md:** What changed, why, what was before
3. **User approval for non-trivial changes** (new hooks, behavioral changes)

## Rationale
The agent needs to be able to maintain its own workspace files (TASKS.md updates, HEARTBEAT.md tweaks) without being blocked. But core config (openclaw.json) is too dangerous -- a bad config change can freeze the gateway for hours (see Battle Damage Reports).

The backup + changelog protocol provides traceability without blocking legitimate work.

## Lesson from v0.1.0
During the initial Jeraptha build, the agent rewrote HEARTBEAT.md without a dated backup. This was a protocol violation. The backup rule is non-negotiable going forward.

## Consequences
- Agent can iterate on its own behavioral system with user approval
- openclaw.json stays locked
- Every change is traceable via changelog + backups
- If something breaks, rollback is one `cp` command away
