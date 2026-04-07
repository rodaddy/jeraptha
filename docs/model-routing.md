# Fleet Composition -- Model Routing

*The Jeraptha Home Fleet runs capital ships. The Regional Patrol gets obsolete corvettes. Know what goes where.*

## Recommended Fleet Composition

| Role | Ship Class | Model Tier | Examples |
|------|-----------|-----------|---------|
| Main agent | Flagship | High | claude-opus-4, claude-sonnet-4 |
| Heartbeat (Regional Patrol) | Corvette | Medium | claude-sonnet-4, gemini-pro |
| Coding agents | Battlecruiser | High | claude-opus-4 |
| Quick lookups | Scout | Low | gemini-flash, haiku |
| Sub-agent workers | Frigate | Medium | claude-sonnet-4, gemini-pro |

## Standing Orders

1. **Regional Patrol needs real ships.** The heartbeat model must be capable enough to follow HEARTBEAT.md. Flash-lite is too dumb. Use at least sonnet-tier. An incompetent patrol is worse than no patrol.

2. **Session state overrides fleet orders.** Changing model in config does NOT change existing sessions. You must also clear session entries in sessions.json. (See Battle Damage Reports.)

3. **Context window = ammunition capacity.** 1M context + 600K reserve = compaction at ~400K. Don't deploy models with < 200K context for main agent operations.

4. **LiteLLM proxy = unified fleet command.** Single endpoint for all models, unified auth, automatic fallbacks.

## Anti-Patterns (Ways to Lose Ships)

- Flash-lite for heartbeat (sending a rowboat on patrol -- it sinks)
- Spawning Opus coding agents on 8GB machines (launching capital ships from a space station that can't handle the mass)
- Not clearing session model overrides after config change (your fleet roster says battlecruiser but you deployed a shuttle)
- Using models without tool support (ships without weapons systems)

---

*The Regional Patrol received limited funding and obsolete ships. But it kept the outer colonies from falling apart. Your heartbeat does the same.*
