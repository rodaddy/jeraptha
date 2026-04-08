# OpenClaw Ecosystem Integration Map

Research date: 2026-03-16

## Overview

OpenClaw is the always-on interface layer connecting PAI's shipped infrastructure. This document maps how each project feeds into the OpenClaw vision and what integration work remains.

## Project Status

| Project | Version | Status | Location |
|---------|---------|--------|----------|
| OpenClaw runtime | v2026.3.13-1 (latest) | NOT INSTALLED (v2026.1.24 deleted) | Needs fresh install |
| Open Brain | v1.1 | SHIPPED (22/22 requirements) | LXC 208 (10.71.20.15:3100) |
| mcp2cli | v1.3 | SHIPPED (43/43 requirements, 678 tests) | CLI tool, saves ~11K tokens/session |
| skippy-agentspace | v1.2 | SHIPPED (16 skills, 11 abilities) | /Volumes/ThunderBolt/Development/skippy-agentspace/ |
| skippy-matrix | extracted | PARTIAL (scripts missing, launchd running) | /Volumes/ThunderBolt/Development/skippy-matrix/ |
| clawdbot-mcp | v1.0 | READY (webhook URLs need fixing) | /Volumes/ThunderBolt/Development/clawdbot-mcp/ |
| ai-second-brain | mature | OPERATIONAL (1,810 entries, 21 n8n workflows) | /Volumes/ThunderBolt/Development/ai-second-brain/ |
| king-ng | deployed | OPERATIONAL (CT 302 prod, CT 303 UAT) | /Volumes/ThunderBolt/Development/king-ng/ |

## Integration Architecture

```
                    ┌─────────────────────────────┐
                    │        Discord Channels       │
                    │   Skippy PA  │  king-cap PA   │
                    └──────┬───────┴───────┬────────┘
                           │               │
                    ┌──────┴───────────────┴────────┐
                    │     OpenClaw Gateway (v2026.3.x) │
                    │     MacBook Air (local)           │
                    │     Port 18789                    │
                    └──────┬───────────────────────────┘
                           │
              ┌────────────┼────────────────────┐
              │            │                    │
       ┌──────┴──────┐ ┌──┴───────────┐ ┌─────┴──────────┐
       │   LiteLLM    │ │  clawdbot-mcp │ │  mcp2cli       │
       │  10.71.1.33   │ │  capture +    │ │  CLI bridge    │
       │  :4000        │ │  recall       │ │  to all MCPs   │
       │              │ │              │ │                │
       │ openclaw/*   │ │ n8n webhooks │ │ open-brain     │
       │ aliases with │ │ :5678        │ │ vaultwarden    │
       │ guardrails   │ │              │ │ n8n, homekit   │
       └──────────────┘ └──────────────┘ └────────────────┘
              │                                  │
       ┌──────┴──────┐                    ┌─────┴──────────┐
       │ Vertex AI    │                    │  Open Brain     │
       │ Claude/Gemini│                    │  LXC 208        │
       └─────────────┘                    │  :3100          │
                                          │  6+4 MCP tools  │
                                          └────────────────┘
                                                 │
                                          ┌──────┴──────────┐
                                          │  PostgreSQL      │
                                          │  LXC 200         │
                                          │  + pgvector      │
                                          │  1,810 entries   │
                                          └─────────────────┘

       ┌──────────────────────────────────────────────────┐
       │              king-ng (CT 302)                     │
       │  Sentinel -> Analyst -> Strategist -> Executor    │
       │                    │                              │
       │             Agent run data                        │
       │                    │                              │
       │         king-cap Discord channels                 │
       │  #sentinel-feed  #analyst-reports  #strategy-desk │
       │                                                   │
       │         Strategy-finder OpenClaw instance          │
       │  Cron: pull runs -> analyze patterns -> propose   │
       │  Human review gate before capital deployment      │
       └──────────────────────────────────────────────────┘
```

## Integration Points

### 1. OpenClaw <-> LiteLLM (model routing)
- **Status:** Config only -- needs OpenClaw-specific aliases and restricted API key
- **Work:** Add `openclaw/sonnet`, `openclaw/haiku`, `openclaw/flash` aliases with prompt injection guardrail callback
- **Idea file:** `~/.claude_ideas/someday/openclaw-prompt-injection-guardrail.md`

### 2. OpenClaw <-> Open Brain (knowledge)
- **Status:** Open Brain v1.1 shipped, mcp2cli registered
- **Work:** OpenClaw skills call `mcp2cli open-brain search_brain/log_thought/session_save`
- **Idea file:** `~/.claude_ideas/active/ob-skippy-integration-next-steps.md`

### 3. OpenClaw <-> clawdbot-mcp (capture/recall)
- **Status:** MCP bridge exists, webhook URLs are placeholder
- **Work:** Fix hardcoded `n8n.your-domain.example` -> actual n8n URL
- **Blocker:** None -- 10 minute fix

### 4. OpenClaw <-> n8n (automation)
- **Status:** n8n running, 21 workflows, webhooks available
- **Work:** Wire OpenClaw events -> n8n webhooks (capture, recall, health check, briefing)
- **Cron schedule defined in setup-guide.md**

### 5. OpenClaw <-> skippy-agentspace (skills)
- **Status:** 16 skills shipped, v2.0 curation engine planned
- **Work:** Port relevant skills as OpenClaw skills or invoke via mcp2cli
- **Idea file:** `~/.claude_ideas/active/skippy-agentspace-context-optimization.md`

### 6. OpenClaw <-> king-ng (trading)
- **Status:** king-ng operational on CT 302, no OpenClaw integration yet
- **Work:** Create king-cap Discord, build strategy-finder skills, wire agent run data
- **Prerequisite:** OpenClaw running locally first (learn the platform)

### 7. OpenClaw <-> skippy-matrix (hot cache)
- **Status:** Extracted but incomplete (scripts missing)
- **Work:** Complete extraction, wire sync to OpenClaw for fast offline access to high-weight knowledge

## Dependency Order

```
1. Install OpenClaw v2026.3.x locally (MacBook Air)
2. Configure LiteLLM provider (10.71.1.33:4000)
3. Port Skippy persona (SOUL file)
4. Wire Discord channel (bot tokens exist)
   └── Skippy PA is functional at this point
5. Fix clawdbot-mcp webhook URLs
6. Wire n8n webhooks (capture, recall)
7. Add Open Brain integration via mcp2cli
   └── Full knowledge pipeline functional
8. Create LiteLLM guardrail aliases (requires direct Vertex session -- LAW 15)
9. Set up king-cap Discord server
10. Build king-ng strategy-finder skills
11. Deploy strategy-finder OpenClaw instance (LXC)
    └── Trading integration functional
```

## Related Ideas Index

| Idea | File | Priority | Status |
|------|------|----------|--------|
| OpenClaw local setup | `active/openclaw-local-setup.md` | medium | Ready to start |
| Prompt injection guardrail | `someday/openclaw-prompt-injection-guardrail.md` | medium | Proposed |
| LiteLLM centralized MCP | `active/litellm-centralized-mcp-agents.md` | high | Partial |
| Open Brain + Skippy integration | `active/ob-skippy-integration-next-steps.md` | high | OB shipped, skippy-side pending |
| Credential rotation | `active/credential-rotation-post-varlock.md` | high | Prerequisite for exposure |
| Context output virtualization | `active/context-output-virtualization-hook.md` | medium | Depends on OB Phase 2 |
| LangChain + LiteLLM | `active/langchain-litellm-integration.md` | low | Usage pattern documented |
| JSON skill registry | `active/json-skill-registry.md` | medium | Option B shipped, Option C pending |

## Shipped Projects (Can Be Completed/Archived)

These idea files describe work that has been fully shipped:

| Idea File | Project | Ship Date | Action |
|-----------|---------|-----------|--------|
| `active/mcp2cli-context-liberation.md` | mcp2cli v1.3 | 2026-03-09 | Move to `completed/` |

Note: `open-brain-unified-postgres.md` stays active -- v1.1 shipped but Phase 6 (PAI Integration) is pending.
