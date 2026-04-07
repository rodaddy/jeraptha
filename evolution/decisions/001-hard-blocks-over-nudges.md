# Decision 001: Hard Blocks Over Soft Nudges

**Date:** 2026-04-07
**Status:** Accepted
**Context:** Agent consistently ignores prompt-injected rules and verbal promises

## Problem
The agent has 11+ behavioral rules in AGENTS.md. It can recite them. It acknowledges them when reminded. It then immediately violates them. Prompt injection via `law-reinforcement` hook (every 5 turns) provides temporary awareness but no lasting compliance.

## Decision
Use `before_tool_call` hooks that HARD BLOCK tool calls instead of `before_prompt_build` hooks that inject reminders. The agent physically cannot proceed without complying.

## Evidence
- `law-10-search-ob-first` (hard block): Agent NEVER uses web_search without OB check. 100% compliance.
- `ob-gate` (hard block): Agent NEVER asks factual questions without OB check. 100% compliance.
- `law-reinforcement` (prompt injection): Agent still breaks rules regularly despite seeing them every 5 turns. ~30% compliance.

## Consequences
- Hard blocks are more disruptive (agent gets blocked, must change approach)
- But compliance is near 100% vs ~30% for soft nudges
- Trade-off is clearly worth it for critical behavioral rules
- Reserve prompt injection for awareness/context, not enforcement
