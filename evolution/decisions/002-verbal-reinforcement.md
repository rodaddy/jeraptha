# Decision 002: Verbal Reinforcement Over Numeric Scoring

**Date:** 2026-04-07
**Status:** Accepted
**Context:** Need behavioral scoring that actually changes agent behavior

## Problem
Numeric scores (+1, -2) don't give the agent enough information to change behavior. The agent sees "score dropped by 2" but doesn't know WHY or what specifically to do differently.

## Decision
Use hybrid scoring: numeric scores for thresholds (trigger enforcement mode changes) + verbose verbal feedback for actual behavioral change.

Example:
- ❌ "Score: -2 (criticism)"
- ✅ "Score: -2 (criticism) -- Rico said 'shit show' because you dropped 3 tasks across channels today. Pattern: you start tasks in one channel, get asked something in another channel, and never come back. The fix: TASKS.md + heartbeat stale detection should catch this, but you also need to update TASKS.md BEFORE switching channels."

## Research Basis
- Reflexion (2023): "verbal reward signals" work better than numeric for LLMs because the model can reason about the feedback
- OPTAGENT (2025): evaluating quality of interactions, not just outcomes
- MetaClaw (2026): failure trajectory analysis → synthesize new behavioral rules

## Consequences
- SCORECARD.md is more verbose (more context usage)
- But feedback is actionable -- agent knows exactly what to fix
- Sentiment detection from natural user reactions reduces user burden
