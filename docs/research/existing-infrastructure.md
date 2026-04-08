# Existing Infrastructure Inventory

Research date: 2026-02-21 (updated 2026-03-16)

## Local Codebases

### moltbot-2026.1.24 (OpenClaw v2026.1.24-0)

**STATUS: DELETED** -- This directory no longer exists on disk. The symlink `openclaw/moltbot` is broken. A fresh install of OpenClaw v2026.3.x is required. Latest release as of 2026-03-16 is v2026.3.13-1 (daily calendar versioning).

- **Location**: `/Volumes/ThunderBolt/Development/moltbot-2026.1.24`
- **Stack**: TypeScript/Node.js monorepo, pnpm workspaces, 383k LOC
- **Status**: Fully compiled in `dist/`, production-ready
- **Node requirement**: >=22.12.0

**25 Extensions:**
- Channels: Discord, Slack, Telegram, Signal, iMessage, WhatsApp, BlueBubbles, Matrix, Teams, Mattermost, Nextcloud Talk, Nostr, Zalo
- Auth: google-antigravity-auth, google-gemini-cli-auth, qwen-portal-auth, copilot-proxy
- Memory: memory-core, memory-lancedb
- Other: diagnostics-otel, llm-task, lobster, open-prose, voice-call

**Native Apps:**
- macOS: Swabble (Swift 6.2 wake-word daemon) + menu bar companion
- iOS: SwiftUI with canvas, voice, camera
- Android: Kotlin/Jetpack with talk mode

**Deployment Configs:**
- `docker-compose.yml`: Gateway (18789/18790) + CLI
- `fly.toml`: Fly.io PaaS config
- `docker-setup.sh`: Build + config wizard

**35+ bundled skills** in `/skills/`

### clawdbot-mcp

- **Location**: `/Volumes/ThunderBolt/Development/clawdbot-mcp`
- **Stack**: Bun + TypeScript, 166 lines
- **Status**: Extracted from ai-second-brain on Feb 4, 2026 (2 commits)
- **Tools**: `second_brain_capture`, `second_brain_recall`
- **Integration**: stdio MCP -> HTTPS POST -> n8n webhooks
- **Gap**: Webhook URL hardcoded as placeholder (`https://n8n.your-domain.example`)

### ai-second-brain

- **Location**: `/Volumes/ThunderBolt/Development/ai-second-brain`
- **Stack**: Bun + TypeScript, PostgreSQL + pgvector
- **Status**: Classification pipeline designed, integration tests passing

**Database Schema (PostgreSQL):**
- `thoughts` table: content, category, confidence, reasoning, embedding(768-dim), source_channel, status
- `audit_log` table: Immutable append-only (1-year retention)
- HNSW index for cosine similarity search
- `semantic_search()` function for hybrid search

**n8n Workflows:**
- Classification pipeline: Message -> Claude -> Category -> SiYuan + pgvector
- Universal capture: `/webhook/capture` with deduplication
- Recall: `/webhook/recall` hybrid search
- Daily digest: 7 AM PST
- Weekly review: Sunday 6 PM PST

**MCP Server** (`mcp-server/src/index.ts`):
- `semantic_search`: Natural language -> pgvector cosine similarity
- `get_thought`: Fetch by UUID
- `list_categories`: Count by category

**Extracted Sub-Projects:**
- skippy-matrix: Hot-tier markdown <-> PostgreSQL sync
- skippy-dashboard: Web dashboard (Hono + HTMX)
- discord-bridge: Discord webhook bridge
- pai-infra: Terraform + Ansible IaC
- pai-sync: Knowledge sync scripts

---

## Deployed Infrastructure (Proxmox Cluster)

### Cluster

| Node | Hardware | RAM | Storage |
|------|----------|-----|---------|
| proxmox01 | Ryzen 7 6800H | 31GB DDR5 | 2x 954GB NVMe |
| proxmox02 | i5-12450H | 32GB DDR4 | 1.8TB dual NVMe |
| proxmox03 | N95 | 8GB | 238GB SSD |

### Containers

| CT | Hostname | Purpose | Cores | RAM | Port(s) |
|----|----------|---------|-------|-----|---------|
| 100 | caddy | Public reverse proxy | - | - | 80/443 |
| 200 | postgres | PostgreSQL + pgvector | 2 | 2GB | 5432 |
| 201 | monitoring | Prometheus + Grafana | 2 | 2GB | 9090/3000 |
| 202 | n8n | Workflow orchestration | 4 | 4GB | 5678 |
| 203 | siyuan | SiYuan knowledge base | 2 | 2GB | 6806 |
| 204 | clawdbot | LiteLLM + Discord bridge | 4 | 4GB | 4000/18789 |
| 205 | reverse_proxy | Internal nginx proxy | 2 | 1GB | 80/443 |
| 206 | pihole | Pi-hole v6 DNS | 1 | 1GB | 53/80 |
| 208 | open-brain | Open Brain MCP server | 2 | 2GB | 3100 |
| 214 | vaultwarden | Vaultwarden secrets | - | - | - |
| 302 | king-ng | AI trading system | 4 | 4GB | 3100 |
| 303 | king-ng-uat | king-ng UAT environment | 4 | 4GB | 3100 |
| VM | - | Home Assistant | - | - | - |

### Storage

- TrueNAS (10.71.1.11): 15.4TB backups, 20.1TB media, 1.84TB LXC NVMe
- PBS 4.1.2 for Proxmox backups

### Networking

- VLANs: 1 (management), 20 (containers), 21 (VPN)
- 10G backbone: Gateway <-> Switch <-> TrueNAS
- Gateway: UniFi UDM Pro with WireGuard/OpenVPN/L2TP
- DNS: Pi-hole split-horizon (*.rodaddy.live -> internal)

---

## Security Infrastructure

### Vaultwarden `openclaw` Profile

- mTLS: Certificate fingerprint validation via nginx
- JWT: Bearer token with scopes (mTLS + JWT both required)
- Response encryption: ECDH P-256 + AES-256-GCM
- Rate limiting: 30 req/min
- IP restriction: 127.0.0.1/32 only
- Audit logging: Forensic level
- Cert generation: `vaultwarden-secrets/deploy/generate-certs.sh`

### Credential Management

- All secrets in Vaultwarden (never hardcoded)
- SSH keys: `~/.ssh/infra-root` (all containers), `~/.ssh/homelab/` (service users)
- API tokens: `.env` files (gitignored) or vaultwarden MCP
- ggshield hooks enforce no secrets in git

---

## LiteLLM Proxy (CT 204, port 4000)

| Alias | Model | Tier |
|-------|-------|------|
| `main` | claude-sonnet-4-6 | Work-paid (Vertex AI) |
| `fast` | claude-haiku-4-5@20251001 | Work-paid |
| `quality` | claude-opus-4-6 | Work-paid |
| `pro` | gemini-3-pro-preview | Free |
| `flash` | gemini-3-flash-preview | Free |
| `image` | gemini-3-pro-image-preview | Free |
| `embeddings` | text-embedding-004 (768-dim) | Free |

Access: `ANTHROPIC_BASE_URL=http://10.71.1.33:4000`
Auth: `sk-litellm-local`
OpenClaw-specific aliases planned: `openclaw/sonnet`, `openclaw/haiku`, `openclaw/flash` (with prompt injection guardrail)

---

## Messaging (Clawdbot)

- **Discord**: Full bot, channel/DM, slash commands, role-based access, mention detection
- **Telegram**: Group + private chat, topic filters, command gating
- **MCP Bridge**: `second_brain_capture` + `second_brain_recall` via stdio

---

## Knowledge Architecture (PAI Phase 3 Design)

Three-tier memory:
```
HOT:  Skippy_matrix (local markdown, 14 files, 5s sync)
WARM: PostgreSQL knowledge (1,810 entries, pgvector, weight-based ranking)
COLD: Raw sessions (~/.claude/**/*.jsonl)
```

Both Claude Code and OpenClaw read/write the same knowledge base.
Different trust levels: CC = full access, OpenClaw = sandboxed.

## Open Brain (LXC 208, port 3100)

Unified PostgreSQL + pgvector knowledge store. Shipped v1.1 (2026-03-15).

- **MCP Tools**: search_brain, log_thought, log_decision, find_person, session_save, session_load
- **Plus v1.1**: archive_entry, list_recent, update_entry, rate_entry
- **Registered with mcp2cli**: `mcp2cli open-brain <tool>`
- **Integration**: n8n Discord thought capture workflow active
- **Phase 6 (PAI Integration)**: deferred to skippy-agentspace -- skills detect Open Brain at runtime with graceful degradation

## king-ng Trading System (CT 302/303)

AI trading system with 4-agent architecture. Next.js 16 / React 19 / TypeScript 5.

- **Prod**: CT 302 (10.71.20.62), https://king-ng.rodaddy.live
- **UAT**: CT 303 (10.71.20.64)
- **Agents**: Sentinel (monitoring), Analyst (data analysis), Strategist (strategy), Executor (execution)
- **Database**: PostgreSQL on CT 302 (king_ng database, king role)
- **Future**: king-cap Discord server for agent run data + strategy discovery via OpenClaw
