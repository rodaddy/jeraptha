# Decision 005: Modular Extraction (v3.0)

**Date:** 2026-05-20
**Status:** Accepted
**Supersedes:** 004-plugin-over-managed-hooks.md (partially — plugin system stays, monolithic index.js doesn't)

## Context

Jeraptha v2.5.3 has 19 behavioral enforcement hooks in a single 906-line `plugin/index.js`. The v1 managed-hook system (`hooks/*/handler.ts`) is dead code — `before_tool_call` events only fire through the typed plugin system (`api.on()`).

This worked for rapid iteration but blocks three goals:
1. **Testability** — can't unit test individual gates when they're inline closures sharing module-scoped variables
2. **Public release** — 900 lines of interleaved state, constants, and logic is unacceptable for a public repo
3. **New gates** — two new gates (contradiction-check, praise-without-review) need LLM calls and complex state; bolting more onto the monolith makes it worse

## Decision

Extract all 19 gates from `index.js` into individual module files. Each gate exports a factory function that receives shared state, config, and logger. `index.js` becomes a thin registration layer (~80 lines) that imports all gates and registers them with `api.on()`.

### Directory Structure

```
plugin/
├── index.js              ← thin registration (~80 lines)
├── shared/               ← constants, state, helpers, paths
├── gates/                ← before_tool_call handlers
├── injections/           ← before_prompt_build handlers
└── events/               ← message_received, message_sending handlers
```

### Gate Factory Pattern

```javascript
export function createGateName(state, config, log) {
  return async (event, ctx) => { /* ... */ };
}
```

State is created once in `index.js` and passed to all factories, preserving the shared-state singleton pattern from v2.5.

### File Naming Convention

Files are named by what they DO, not what they ARE:
- `block-without-ob-search.js` not `handler.ts` or `ob-gate.js`
- `score-and-inject-user-sentiment.js` not `sentiment-tracker.js`
- `reset-per-turn-state.js` not `state-reset.js`

The verb tells you the gate's action. The rest tells you the condition.

## Alternatives Considered

### Keep monolith, add tests via export
Could export individual handler functions from index.js. Rejected: still untestable (closures capture module-scoped state), naming problem unsolved, grows worse with new gates.

### Bundler (esbuild/rollup) back to single file
Write modules, bundle for deploy. Rejected: adds build step, harder to debug production (source maps), install.sh becomes more complex. ESM imports within the plugin directory work fine in OpenClaw.

### Separate npm packages per gate
Over-engineered for 19 small files that share state. Rejected.

## Consequences

- `install.sh` must copy the full `plugin/` directory, not just `index.js`
- All gates are individually testable with `bun test`
- Adding new gates = create file + register in index.js
- Legacy `hooks/*/handler.ts` files are removed (dead code since v2.0)
- Version bumped to 3.0.0 (breaking: directory structure change)
