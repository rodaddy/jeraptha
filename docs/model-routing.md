# Model Routing

## Recommended Setup

| Role | Model Tier | Examples | Use For |
|------|-----------|---------|---------|
| Main agent | High | claude-opus-4, claude-sonnet-4 | Conversation, orchestration, complex tasks |
| Heartbeat | Medium | claude-sonnet-4, gemini-pro | Lightweight monitoring, task checking |
| Coding agents | High | claude-opus-4 | Deep coding, complex reasoning |
| Quick lookups | Low | gemini-flash, haiku | Monitoring, cheap ops, batch processing |
| Sub-agent workers | Medium | claude-sonnet-4, gemini-pro | Parallel task execution |

## Rules

1. **Heartbeat model must be capable enough to follow HEARTBEAT.md protocol.** Flash-lite models are too dumb. Use at least sonnet-tier.
2. **Session state overrides config.** Changing model in config does NOT change existing sessions. Must also clear session entries.
3. **Context window matters.** 1M context + 600K reserve tokens = compaction at ~400K. Don't use models with < 200K context for main agent.
4. **LiteLLM proxy recommended.** Single endpoint for all models, unified auth, fallbacks.

## Anti-patterns

- Using flash-lite for heartbeat (too dumb to follow protocol)
- Spawning Opus coding agents on 8GB machines (OOM)
- Not clearing session model overrides after config change
- Using models without tool support for agent sessions
