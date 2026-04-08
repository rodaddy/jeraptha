# Decision 004: Plugin Over Managed Hooks

**Date:** 2026-04-08
**Status:** Accepted
**Odds:** 1:1 (dead certain -- managed hooks literally don't fire)

## Context

Jeraptha v1 deployed hooks to `~/.openclaw/hooks/` as "managed hooks" -- directories with `HOOK.md` + `handler.ts` that OC auto-discovers. All hooks showed as "ready" in `openclaw hooks list`. None of them worked.

## The Problem

OC v2026.4.x has TWO separate hook dispatch systems:

1. **Internal hooks** (`registerInternalHook`) -- dispatches `type:action` events like `gateway:startup`, `message:preprocessed`, `session:compact:after`
2. **Typed plugin hooks** (`api.on()`) -- dispatches `before_tool_call`, `before_prompt_build`, `after_tool_call`, etc.

Managed hooks register via `registerInternalHook()` (server code line 25603). But `before_tool_call` and `before_prompt_build` ONLY dispatch through the typed plugin system.

**Result:** 7 of 7 Jeraptha hooks have NEVER fired. The ECO was theater.

### Events that work for managed hooks
- `gateway:startup`, `message:preprocessed`, `message:received`, `session:compact:after`, `agent:bootstrap`

### Events that DON'T work for managed hooks
- `before_tool_call`, `before_prompt_build`, `after_tool_call` (and all 29 typed plugin hooks)

## Decision

Deploy Jeraptha hooks as an **OC plugin** using `api.on()` instead of managed hooks.

- Plugin lives at `~/.openclaw/extensions/pai-hooks/` (global, survives updates)
- Uses `api.on("before_tool_call", handler)` and `api.on("before_prompt_build", handler)`
- Registered through the typed plugin system -- confirmed firing in production
- `install.sh` updated to deploy plugin instead of managed hooks

## Consequences

**Positive:**
- Hooks actually fire (confirmed: law-reinforcement, task-context, sentiment-tracker, session-start all logged execution)
- Single file deployment (index.js) vs 7 separate directories
- Priority ordering via `{ priority: N }` option
- Debug logging via `api.logger` + config toggle
- `before_tool_call` is fail-closed by default in the typed system

**Negative:**
- Hooks are bundled in one file (less modular than separate directories)
- Can't use `openclaw hooks list` to see individual hook status (shows as one plugin)
- Must use the typed plugin event format (different from the managed hook format documented in hooks/README.md)

**Migration:**
- Legacy hooks in `hooks/` directory kept for documentation and reference
- `hooks/README.md` updated to note the plugin migration
- Old managed hooks on deployed instances should be removed (the plugin handles them)

## The Jeraptha Would Say

"We discovered the compliance system was filing reports into a locked cabinet. The reports were impeccable. Nobody read them. Now we mail them directly to the judge."
