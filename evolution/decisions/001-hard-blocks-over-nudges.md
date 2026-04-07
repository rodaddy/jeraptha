# Decision 001: ECO Enforcement Over Intel Briefings

*"The Ethics and Compliance Office focused on ensuring established law is obeyed."*

**Date:** 2026-04-07
**Status:** Accepted
**Odds of this being the right call: 50-1, 500 points.**

## Problem
Agent consistently ignores prompt-injected rules and verbal promises. It can recite every LAW. It acknowledges them when reminded. It then violates them. The intel briefings (prompt injections) provide awareness but not compliance.

## Decision
Use ECO hooks (`before_tool_call`, hard block) instead of intel briefing hooks (`before_prompt_build`, injection). The agent physically cannot proceed without compliance.

## Evidence (The Wager Results)
- `ob-gate` (ECO enforcement): Agent NEVER asks factual questions without knowledge base check. ~100% compliance.
- `law-reinforcement` (intel briefing): Agent still breaks rules despite seeing them every 5 turns. ~30% compliance.

**Odds with ECO: 50-1 in favor.**
**Odds with intel briefing: 3-1 against.**

The bet is obvious.

## Consequences
- ECO hooks are more disruptive (agent gets blocked, must change approach)
- But compliance is near-certain vs ~30% for soft nudges
- Reserve intel briefings for awareness/context, not enforcement
- The Jeraptha don't ASK you to follow gambling law. They enforce it. Same principle.
