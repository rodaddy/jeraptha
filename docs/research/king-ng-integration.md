# king-ng OpenClaw Integration Plan

Created: 2026-03-16

## Overview

Connect king-ng's 4-agent trading system (Sentinel, Analyst, Strategist, Executor) to OpenClaw via a dedicated "king-cap" Discord server. Each agent gets a feed channel, each team member gets a PA, and a strategy-finder OpenClaw instance autonomously analyzes agent run data to propose new trading strategies.

## Prerequisites

- OpenClaw running locally on Rico's MacBook Air (Phase 0 -- learn the platform first)
- king-ng operational on CT 302 (prod) and CT 303 (UAT) -- already done
- LiteLLM proxy accessible at 10.71.1.33:4000 -- already done
- n8n running on CT 202 (10.71.20.51:5678) -- already done

---

## 1. LXC Containers

### Container Plan

| CT | Hostname | Purpose | Node | Cores | RAM | Disk | VLAN |
|----|----------|---------|------|-------|-----|------|------|
| 310 | oc-rico | Rico's Skippy PA (if not running locally) | px01 | 2 | 2GB | 8GB | 20 |
| 311 | oc-kevin | Kevin's PA | px01 or px02 | 2 | 2GB | 8GB | 20 |
| 312 | oc-strategist | Strategy-finder (autonomous) | px02 | 4 | 4GB | 16GB | 20 |

**Notes:**
- CT 310 (Rico PA) may not be needed if Rico runs OpenClaw locally on MacBook Air. Keep as a fallback or for always-on availability when the laptop is closed.
- CT 312 (Strategy-finder) gets more resources because it will run analysis workloads -- querying king-ng DB, processing agent run data, generating strategy proposals.
- All containers are unprivileged LXC on VLAN 20 (container network).
- IPs assigned from the 10.71.20.x range per existing convention.

### Per-Container Setup

Each OpenClaw LXC needs:

```bash
# Base packages
apt update && apt install -y curl git

# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

# OpenClaw
npm install -g openclaw@latest
openclaw onboard --install-daemon

# Create service user
useradd -m -s /bin/bash openclaw
su - openclaw -c "openclaw onboard --install-daemon"
```

### Systemd Service (per container)

```ini
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/home/openclaw
ExecStart=/usr/bin/openclaw gateway
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Network Requirements

| From | To | Port | Purpose |
|------|----|------|---------|
| CT 310-312 | 10.71.1.33 | 4000 | LiteLLM proxy (model routing) |
| CT 310-312 | 10.71.20.51 | 5678 | n8n webhooks |
| CT 310-312 | 10.71.20.15 | 3100 | Open Brain MCP server |
| CT 312 | 10.71.20.62 | 5432 | king-ng PostgreSQL (strategy-finder reads agent data) |
| CT 310-312 | discord.com | 443 | Discord API (bot connections) |

### Deployment

Use `/deploy-service` skill for each container. Template the OpenClaw config via Ansible:
- `infrastructure/projects/openclaw/ansible/templates/openclaw.json.j2`
- Secrets from Vaultwarden (`openclaw` profile)
- Per-container variables: hostname, Discord bot token, model alias, persona SOUL file

---

## 2. Discord Server: king-cap

### Server Structure

```
king-cap (Discord Server)
├── INFORMATION
│   ├── #welcome          -- Server rules, bot descriptions
│   └── #announcements    -- Human-written updates
│
├── AGENT FEEDS (read-only for humans, bots post here)
│   ├── #sentinel-feed    -- Market monitoring alerts, anomaly detection
│   ├── #analyst-reports  -- Data analysis findings, correlation reports
│   ├── #strategy-desk    -- Strategy proposals (HUMAN APPROVAL REQUIRED)
│   └── #exec-log         -- Execution records, trade logs, P&L
│
├── TEAM
│   ├── #general          -- Human team chat
│   ├── #claw-rico        -- Rico's PA channel (Skippy persona)
│   ├── #claw-kevin       -- Kevin's PA channel
│   └── #war-room         -- High-priority discussions, incident response
│
├── STRATEGY FINDER
│   ├── #discoveries      -- Autonomous strategy proposals posted here
│   ├── #backtests        -- Backtest results for proposed strategies
│   └── #approved         -- Strategies that passed human review
│
└── OPS
    ├── #health           -- Service health checks, infrastructure alerts
    ├── #logs             -- System logs, error aggregation
    └── #costs            -- LLM API cost tracking per agent
```

### Bot Accounts Needed

| Bot Name | Purpose | Model Alias | Container |
|----------|---------|-------------|-----------|
| KingCap Sentinel | Posts sentinel alerts to #sentinel-feed | openclaw/haiku | CT 302 (webhook) |
| KingCap Analyst | Posts analysis to #analyst-reports | openclaw/haiku | CT 302 (webhook) |
| KingCap Strategist | Posts strategies to #strategy-desk | openclaw/sonnet | CT 302 (webhook) |
| KingCap Executor | Posts execution logs to #exec-log | openclaw/haiku | CT 302 (webhook) |
| Skippy (Rico PA) | Rico's personal assistant | openclaw/sonnet | CT 310 or MacBook Air |
| Kevin PA | Kevin's personal assistant | openclaw/sonnet | CT 311 |
| Strategy Finder | Autonomous analysis bot | openclaw/sonnet | CT 312 |

**Note on agent feeds vs OpenClaw bots:**
- Agent feed channels (#sentinel-feed, #analyst-reports, etc.) can use simple Discord webhooks from king-ng -- no OpenClaw instance needed. king-ng already has the agent run data; it just needs to POST to Discord webhook URLs.
- The PA bots (Skippy, Kevin PA) and Strategy Finder are full OpenClaw instances that can receive and respond to messages.

### Discord Bot Setup

1. Go to https://discord.com/developers/applications
2. Create application "king-cap" (or reuse existing if appropriate)
3. Create bot accounts for each OpenClaw instance
4. Enable: Message Content Intent, Server Members Intent
5. Generate invite link with permissions: Send Messages, Embed Links, Read Message History, Add Reactions, Use Slash Commands
6. Store tokens in Vaultwarden under `king-cap-discord-*` naming convention

### Permissions Matrix

| Role | Agent Feeds | Team Channels | Strategy Finder | Ops |
|------|-------------|---------------|-----------------|-----|
| Rico | Read + React | Read + Write | Read + Approve | Full |
| Kevin | Read + React | Read + Write | Read + Approve | Read |
| Bots (agents) | Write only | None | Write only | Write only |
| PA Bots | None | Read + Write (own channel) | Read | Read |
| Strategy Finder | Read (all feeds) | None | Write | Write |

---

## 3. n8n Workflows

### Existing Workflows (CT 202) -- Reuse

These ai-second-brain workflows can be adapted for king-cap:

| Workflow | Current Use | king-cap Adaptation |
|----------|-------------|---------------------|
| Universal capture | `/webhook/capture` | Capture strategy proposals to Open Brain |
| Recall | `/webhook/recall` | Search past strategies and agent findings |
| Daily digest | 7 AM PST | Morning briefing of overnight agent activity |
| Weekly review | Sunday 6 PM PST | Weekly strategy performance review |

### New Workflows Needed

#### W1: Agent Run Router
- **Trigger:** king-ng API call or cron polling king-ng database
- **Logic:** Query `agent_runs` table for new completed runs since last check
- **Output:** Format run data into Discord embeds, POST to appropriate channel webhook
- **Schedule:** Every 5 minutes during market hours, every 30 minutes off-hours

```
[Cron Trigger] -> [Query king-ng DB] -> [Filter by agent type] -> [Format Discord embed] -> [POST to channel webhook]
                                                                      │
                                                                      ├── Sentinel -> #sentinel-feed
                                                                      ├── Analyst  -> #analyst-reports
                                                                      ├── Strategist -> #strategy-desk
                                                                      └── Executor -> #exec-log
```

#### W2: Strategy Finder Trigger
- **Trigger:** Cron (every 4 hours during market hours) or manual via Discord command
- **Logic:** Aggregate recent agent runs, feed to Strategy Finder OpenClaw instance via API
- **Output:** Strategy Finder posts proposals to #discoveries
- **Guard:** All proposals require human reaction (thumbs up/down) before proceeding

```
[Cron 4h] -> [Aggregate agent runs from king-ng DB] -> [Call Strategy Finder OpenClaw API] -> [Post to #discoveries]
                                                                                                     │
                                                                                          [Human reacts with ✅]
                                                                                                     │
                                                                                          [W3: Backtest trigger]
```

#### W3: Backtest Pipeline
- **Trigger:** Human approves strategy in #discoveries (Discord reaction)
- **Logic:** Extract strategy parameters, run backtest against historical data
- **Output:** Post results to #backtests with P&L projections, drawdown metrics
- **Guard:** Backtest must show positive expectancy before moving to #approved

```
[Discord reaction ✅ on #discoveries] -> [Extract strategy params] -> [Run backtest] -> [Post to #backtests]
                                                                                              │
                                                                                    [If positive expectancy]
                                                                                              │
                                                                                    [Move to #approved + notify team]
```

#### W4: Cost Tracker
- **Trigger:** Cron (daily at midnight)
- **Logic:** Query LiteLLM `/spend/logs` API for king-cap related keys
- **Output:** Post daily cost summary to #costs
- **Fields:** Per-model breakdown, per-agent breakdown, 7-day trend

```
[Cron daily] -> [Query LiteLLM spend API] -> [Aggregate by model + agent] -> [Format embed] -> [POST to #costs]
```

#### W5: Health Monitor
- **Trigger:** Cron (every 15 minutes)
- **Logic:** Check all OpenClaw gateways (CT 310-312), LiteLLM, king-ng, Open Brain
- **Output:** Only post to #health on failure or recovery
- **Alert:** Mention @Rico on critical failures

```
[Cron 15m] -> [Check endpoints] -> [Compare to last state] -> [If changed: POST to #health]
                  │
                  ├── CT 310 gateway :18789 (Rico PA)
                  ├── CT 311 gateway :18789 (Kevin PA)
                  ├── CT 312 gateway :18789 (Strategy Finder)
                  ├── LiteLLM 10.71.1.33:4000
                  ├── king-ng 10.71.20.62:3100
                  └── Open Brain 10.71.20.15:3100
```

#### W6: PA Context Loader
- **Trigger:** On OpenClaw PA startup or daily refresh
- **Logic:** Pull relevant context for each team member from Open Brain
- **Output:** Inject as system context into the PA's OpenClaw session
- **Rico:** Recent decisions, active projects, blockers, king-ng status
- **Kevin:** DuckDB pipeline status, data quality metrics, commodity prices

### n8n Credential Requirements

| Credential | Type | For |
|------------|------|-----|
| king-ng PostgreSQL | Postgres | W1, W2 -- read agent_runs table |
| Discord Webhook (per channel) | Webhook URL | W1 -- post to agent feed channels |
| LiteLLM API | HTTP Header Auth | W4 -- spend tracking |
| Open Brain | HTTP Header Auth | W6 -- context loading |
| Discord Bot Token | OAuth2 | W3 -- reaction monitoring |

Store all in n8n's credential manager. Reference IDs go in `openclaw/.planning/agent-reference.md` once created.

---

## 4. Strategy Finder Architecture

### What It Does

The strategy-finder is NOT a black box that generates trading strategies. It's an analysis assistant that:

1. **Aggregates** -- Pulls completed agent run data from king-ng PostgreSQL
2. **Correlates** -- Looks for patterns across multiple runs, commodities, timeframes
3. **Hypothesizes** -- Generates strategy hypotheses with supporting evidence
4. **Proposes** -- Posts proposals to #discoveries with clear rationale
5. **Waits** -- Does NOTHING until a human approves

### What It Does NOT Do

- Execute trades
- Allocate capital
- Bypass human review
- Modify king-ng configuration
- Access external APIs beyond king-ng DB and LiteLLM

### Data Flow

```
king-ng PostgreSQL (CT 302)
    │
    │  Read-only queries via n8n (W2)
    │
    ├── agent_runs table
    ├── agent_run_logs table
    ├── commodity_prices table
    ├── features table (recomputed signals)
    │
    v
Strategy Finder OpenClaw (CT 312)
    │
    │  LLM analysis via openclaw/sonnet
    │
    ├── Pattern detection across runs
    ├── Cross-commodity correlation
    ├── Anomaly identification
    ├── Historical pattern matching
    │
    v
#discoveries (Discord)
    │
    │  Human review (Rico/Kevin react)
    │
    ├── ✅ Approved -> W3 backtest
    ├── ❌ Rejected -> logged, not pursued
    └── 🤔 Needs discussion -> #war-room thread
```

### Database Access (Read-Only)

The strategy finder needs a READ-ONLY PostgreSQL role on king-ng's database:

```sql
-- On CT 302 as postgres superuser
CREATE ROLE king_reader LOGIN PASSWORD '<from-vaultwarden>';
GRANT CONNECT ON DATABASE king_ng TO king_reader;
GRANT USAGE ON SCHEMA public TO king_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO king_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO king_reader;
```

Store the credentials in Vaultwarden under `king-ng-reader`.

### OpenClaw Skills for Strategy Finder

Custom skills to build for the strategy finder's OpenClaw instance:

| Skill | Purpose | Implementation |
|-------|---------|----------------|
| `query-runs` | Fetch recent agent runs by type/commodity/date range | SQL query via n8n webhook |
| `analyze-patterns` | LLM-powered pattern detection across run data | System prompt + structured output |
| `cross-correlate` | Compare signals across commodities | SQL aggregation + LLM analysis |
| `propose-strategy` | Format and post a strategy proposal | Discord embed + structured JSON |
| `check-backtest` | Query backtest results for a proposal | SQL query + formatting |

### Safety Controls

1. **Read-only DB access** -- strategy finder cannot modify king-ng data
2. **No execution capability** -- cannot trigger trades
3. **Human gate** -- all proposals require explicit Discord reaction approval
4. **Rate limiting** -- max 3 proposals per 4-hour cycle
5. **Cost cap** -- LiteLLM per-key spend limit for strategy finder key
6. **Audit trail** -- all proposals logged to Open Brain via `log_decision`

---

## 5. Implementation Order

| Step | Task | Depends On | Effort |
|------|------|------------|--------|
| 1 | Rico learns OpenClaw locally (MacBook Air) | Nothing | 1 session |
| 2 | Create king-cap Discord server + channels | Nothing | 30 min manual |
| 3 | Create Discord bot accounts + store tokens | Step 2 | 30 min manual |
| 4 | Create Discord webhooks for agent feed channels | Step 2 | 15 min manual |
| 5 | Build W1 (Agent Run Router) in n8n | Steps 3-4 | 1 session |
| 6 | Build W4 (Cost Tracker) in n8n | Step 3 | 30 min |
| 7 | Build W5 (Health Monitor) in n8n | Step 3 | 30 min |
| 8 | Deploy CT 311 (Kevin PA) via /deploy-service | Step 3 | 1 session |
| 9 | Deploy CT 312 (Strategy Finder) via /deploy-service | Step 3 | 1 session |
| 10 | Create king_reader DB role on CT 302 | Nothing | 10 min |
| 11 | Build strategy finder OpenClaw skills | Steps 9-10 | 2-3 sessions |
| 12 | Build W2 (Strategy Finder Trigger) in n8n | Steps 9-11 | 1 session |
| 13 | Build W3 (Backtest Pipeline) in n8n | Step 12 | 2-3 sessions |
| 14 | Build W6 (PA Context Loader) in n8n | Steps 8, Open Brain | 1 session |

**Critical path:** Steps 1 -> 2 -> 3 -> 4 -> 5 (agent feeds working) and 9 -> 10 -> 11 -> 12 (strategy finder working)

---

## 6. Open Questions

1. **Rico PA: local vs LXC?** If MacBook Air is always-on (docked), local is fine. If Rico needs PA when laptop is closed, CT 310 is needed.
2. **How many strategies per cycle?** Cap at 3 proposals per 4-hour window to avoid noise.
3. **Backtest infrastructure?** Where does the backtest run? king-ng itself? Separate service? DuckDB?
4. **Kevin PA persona?** Which PAI persona for Kevin's PA? Or a custom one?
5. **Agent feed granularity?** Every agent run, or only runs with notable findings?
6. **Historical depth?** How far back should the strategy finder look? Last 7 days? 30 days? All time?
