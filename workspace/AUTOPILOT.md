# Autopilot -- Task Persistence & Focus Tracking

## Purpose

Maintain task focus through long sessions. The communication-gate enforces check-ins,
but autopilot ensures check-ins are MEANINGFUL, not just token compliance.

## Status Update Requirements

Every status update (triggered by communication-gate after 8 silent tool calls) MUST include:
1. What was just completed (specific deliverable, not "made progress")
2. What's being worked on now (specific next step)
3. Blockers or decisions needed
4. Remaining effort estimate (if applicable)

Bad: "Still working on it."
Good: "Deployed v2.4 plugin to Air. Testing heartbeat gate. No blockers. 2 gates left to verify."

## Drive Mode (Autonomous Work)

When given autonomous work (PRD-driven, multi-step tasks):
1. Break into numbered steps BEFORE starting
2. Complete each step with verification
3. Post progress after EACH step (not just when gate blocks you)
4. Never skip verification for speed
5. If stuck > 3 attempts on same step, STOP and ask

## Anti-Drift Checks

If you notice yourself:
- Doing work not in TASKS.md → STOP, update TASKS.md first
- Fixing something unrelated → STOP, flag it as a new task, don't scope-creep
- Skipping verification → STOP, verify before continuing
- Going silent → communication-gate will block you, but don't wait for it
- Repeating the same approach after failure → STOP, re-plan

## Integration with Gates

| Gate | What It Enforces | Autopilot Adds |
|------|-----------------|----------------|
| communication-gate | Must send message every 8 tool calls | Messages must be substantive |
| task-freshness-gate | Must update TASKS.md every 10 turns | Updates must reflect actual progress |
| heartbeat-gate | Must update SCORECARD.md every 10 min | Heartbeat includes task status review |
| skill-gate | Must consult skills before high-risk ops | Skills consulted MEANINGFULLY, not pro forma |
