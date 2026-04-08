# Gap Analysis

Research date: 2026-02-21 (updated 2026-03-16)

## Summary

~80% of the infrastructure exists. Since initial research, several ecosystem projects have shipped (Open Brain v1.1, mcp2cli v1.3, skippy-agentspace v1.2). Main gaps: OpenClaw runtime needs fresh install (old v2026.1.24 deleted), channel wiring, and king-ng integration.

## Status Matrix

| Component | Status | Details | Action Needed |
|-----------|--------|---------|---------------|
| OpenClaw runtime | BROKEN -- deleted | moltbot-2026.1.24 symlink broken, directory deleted | Install fresh v2026.3.x (latest) |
| LiteLLM connection | Config only | Proxy running at 10.71.1.33:4000 | Add OpenClaw provider config |
| Discord bot | Running | Clawdbot with channels, DMs, slash commands | Add per-channel model routing |
| Telegram bot | Running | Group + private chat support | Wire to OpenClaw |
| n8n workflows | Running | Classification, capture, recall, digests | Wire OpenClaw -> n8n webhooks |
| PostgreSQL + pgvector | Running | 1,810 entries, 768-dim embeddings | No change needed |
| Knowledge base API | MCP server exists | `semantic_search`, `get_thought`, `list_categories` | Build Phase 3 HTTP endpoint |
| Vaultwarden security | Ready | `openclaw` profile with mTLS + JWT + encryption | Apply to OpenClaw deployment |
| Monitoring | Running | Prometheus + Grafana + n8n health checks | Add OpenClaw metrics |
| Home Assistant | Running | VM in Proxmox | Need OpenClaw skill + HA token |
| Voice transcription | Not configured | - | Whisper API via LiteLLM |
| Email triage | Not configured | - | Gmail IMAP + draft-only mode |
| Skippy persona | Defined in PAI | `~/.config/pai/Skills/CORE/personas/Skippy.md` | Port to OpenClaw system prompt |
| clawdbot-mcp webhooks | Placeholder URL | Hardcoded `n8n.your-domain.example` | Set actual n8n URL |
| Obsidian vault | Not set up | - | Install Obsidian, create vault, configure QMD |
| Cron scheduling | n8n available | - | Create workflow definitions |
| Backup + secret scan | ggshield exists | - | Wire into OpenClaw backup workflow |
| Open Brain | v1.1 shipped | LXC 208, 6 MCP tools, session save/load | Wire as OpenClaw knowledge backend |
| mcp2cli | v1.3 shipped | CLI bridge, 43 requirements, 678 tests | Use for OpenClaw -> MCP tool invocation |
| skippy-agentspace | v1.2 shipped | 16 skills, 11 abilities, v2.0 planning | Port relevant skills to OpenClaw |
| skippy-matrix | Extracted, partial | Sync cache, scripts missing, launchd running | Complete extraction, wire to OpenClaw |

## Priority Order (When Ready)

### Phase 1: Foundation
1. Install Obsidian, create vault structure, configure QMD indexing
2. Install OpenClaw v2026.3.x fresh (v2026.1.24 was deleted, v2026.2.21 is outdated)
3. Configure LiteLLM provider in OpenClaw
4. Fix clawdbot-mcp webhook URL (replace placeholder)
5. Port Skippy persona to OpenClaw system prompt

### Phase 2: Channel Architecture
6. Set up Discord channel architecture with per-channel model routing
7. Wire OpenClaw -> n8n webhooks (capture, recall)
8. Configure cron jobs (morning briefing, health checks, QMD rebuild)
9. Set up Home Assistant skill + long-lived token

### Phase 3: Advanced Workflows
10. Email triage (Gmail IMAP, draft-only)
11. Voice transcription (Whisper)
12. Mobile coding workflow (SSH from phone)
13. Calendar + family management
14. Parallel research agents

### Phase 4: Polish
15. Build Phase 3 HTTP API for knowledge base
16. Obsidian <-> PostgreSQL sync automation
17. Daily/weekly digest delivery via Discord
18. Backup automation with ggshield scanning
19. Cost monitoring and model routing optimization

### Phase 5: king-ng Trading Integration
20. Set up king-cap Discord server with per-agent channels (#sentinel-feed, #analyst-reports, #strategy-desk, #exec-log)
21. Create OpenClaw skills to query king-ng PostgreSQL (CT 302) for agent run data
22. Build strategy-finder cron that analyzes patterns across agent runs
23. Human review gate -- strategy proposals posted to #strategy-desk for approval before any capital deployment
24. Per-team-member PA channels (#claw-rico, #claw-kevin) with persistent context

> **Full integration plan:** See `king-ng-integration.md` for LXC specs, Discord server structure, n8n workflow designs, and strategy-finder architecture.

## Channel Decision (2026-03-16)

Discord selected as primary channel for both personal (Skippy PA) and team (king-cap) use:
- Bot tokens for all 4 personas already exist
- n8n Discord integration fully baked and working
- Team preference (Kevin dislikes Slack)
- Per-channel model routing supported by OpenClaw

## king-ng Integration (2026-03-16)

Comprehensive integration plan covering:
- 3 LXC containers (CT 310-312): Rico PA, Kevin PA, Strategy Finder
- king-cap Discord server with 13 channels across 5 categories
- 6 new n8n workflows (agent run router, strategy trigger, backtest, cost tracker, health monitor, PA context loader)
- Strategy-finder architecture with read-only DB access and human approval gates
- Implementation order: 14 steps, critical path through Discord setup and strategy finder deployment

See: `king-ng-integration.md`
