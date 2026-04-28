# Decision 005: Prompt-Include System

**Date:** 2026-04-27
**Status:** Accepted
**Issue:** https://github.com/rodaddy/jeraptha/issues/4

## Context

Post-compact amnesia is the #1 behavioral failure mode. After context compaction, the agent loses standing behavior rules, hot context, people knowledge, and preferences. Recovery requires manually re-reading 5+ files. The agent often skips steps and performs worse until the context is fully rebuilt.

Space Agent (github.com/agent0ai/space-agent) implements a prompt-include system where `*.system.include.md` and `*.transient.include.md` files are auto-discovered and injected into the prompt context. This is a simple, effective pattern.

## Decision

Implement a `prompt-include` hook in Jeraptha that auto-discovers and injects include files from `~/.openclaw/workspace/includes/` into the prompt context every turn.

### Convention
- `*.system.include.md` -- Injected into system context every turn. For stable, standing rules.
- `*.transient.include.md` -- Injected into transient context every turn. For hot/changing state.
- Files sorted alphabetically by filename for deterministic ordering.
- Each include tagged with `source: <filename>` for provenance.

### Limits
- System includes: 8,000 chars total (prevents context bloat)
- Transient includes: 4,000 chars total
- Fail-soft: missing directory or unreadable files are skipped, not fatal

### Priority
- `before_prompt_build`, priority 90 (highest of all prompt hooks)
- Runs before sentiment-tracker (50), task-stalled-alert (40), and skill-index-reminder (35)

## Alternatives Considered

1. **Extend existing law-reinforcement hook** -- Rejected. That hook is removed in v2.1+. Also, hardcoding rules in the plugin is fragile; file-based includes are editable by the user.
2. **Use OpenClaw native workspace file injection** -- Not available yet. This Jeraptha implementation serves as a proof-of-concept for an eventual OpenClaw feature.
3. **Manual re-read in HEARTBEAT.md** -- Current approach. Fragile and often skipped.

## Consequences

- Post-compact recovery should be seamless -- critical context auto-injects
- Users can add/remove include files without editing the plugin
- Token usage increases by up to ~12K chars per turn (system + transient caps)
- Heartbeat should be updated to write `hot-context.transient.include.md`

## Bilby Potential

This pattern could be proposed to OpenClaw as a native feature. The file convention (`*.system.include.md` / `*.transient.include.md`) could be auto-discovered by the framework itself.
