# Decision 002: Verbal Wagers Over Numeric Scores

*"The Intelligence Community within the Jeraptha government makes use of a crowdsourced wagering system in order to convey the legitimacy of information."*

**Date:** 2026-04-07
**Status:** Accepted
**Odds: 6-1, no points. Shockingly confident.**

## Problem
Numeric scores (+1, -2) don't give the agent enough information to change behavior. "Score: -2" tells it nothing about what to fix.

## Decision
Hybrid scoring: numeric scores for thresholds (trigger enforcement mode changes) + verbose verbal feedback for behavioral change.

### Bad (numeric only):
> Score: -2 (criticism)

### Good (verbal + numeric):
> Score: -2 (criticism) -- User said "shit show" because agent dropped 3 tasks across channels. Pattern: starts tasks in one channel, gets distracted in another, never returns. The Jeraptha equivalent: placing a wager, walking away from the table, and never checking the outcome.

## Research Basis
- **Reflexion** (2023): Verbal reward signals work better than numeric for LLMs because the model can reason about WHY it failed
- **OPTAGENT** (2025): Evaluating quality of interactions matters, not just outcomes
- **MetaClaw** (2026): Failure trajectory analysis → synthesize new behavioral rules
- **The Jeraptha gambling system**: Odds aren't just numbers -- they convey confidence and context. "60-1 odds, no points" means something very different from "2-1, 500 points."

## Consequences
- SCORECARD.md is more verbose (more context)
- But feedback is actionable -- agent knows exactly what to fix
- Sentiment detection reduces user burden (natural reactions become structured intel)
- Like crowdsourced wagering -- the signal conveys legitimacy, not just magnitude
