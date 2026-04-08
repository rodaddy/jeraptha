# OpenClaw Setup Guide

> ~80% of infrastructure exists. This guide covers wiring, hardening, and channel architecture.

## Prerequisites

Running services required before starting:

| CT | Service | Address | Role |
|----|---------|---------|------|
| 200 | PostgreSQL + pgvector | 10.71.20.49:5432 | 1,810 entries, 768-dim HNSW |
| 202 | n8n | 10.71.20.51:5678 | Workflow orchestration |
| 203 | SiYuan | 10.71.20.52:6806 | Knowledge base UI |
| 204 | LiteLLM + Clawdbot | 10.71.1.33:4000 / :18789 | Model routing + Discord |
| 214 | Vaultwarden | Internal | Secrets (`openclaw` profile) |

**Local codebases** (symlinked into `openclaw/`):
- `moltbot/` -- OpenClaw v2026.1.24 (383k LOC, compiled)
- `clawdbot-mcp/` -- MCP bridge (`second_brain_capture`, `second_brain_recall`)
- `ai-second-brain/` -- Knowledge backend + n8n workflow definitions

**Tools**: Node.js >=22.12.0, pnpm, bun, Tailscale/WireGuard active

---

## Phase 0: Local MacBook Air Setup (Skippy PA)

Fastest path to a working local Skippy assistant on Discord.

### 0.1 Prerequisites
- Node.js >= 22 (24 recommended): `brew install node@24` or use nvm
- Discord bot token (exists in Vaultwarden -- "Discord Bot Token")
- LiteLLM proxy reachable at 10.71.1.33:4000

### 0.2 Install & Configure
```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

### 0.3 Wire LiteLLM
Edit `~/.openclaw/openclaw.json`:
```json
{
  "ai": {
    "baseUrl": "http://10.71.1.33:4000",
    "apiKey": "<from vaultwarden 'LiteLLM Local'>",
    "model": "main"
  }
}
```

### 0.4 Port Skippy Persona
Create SOUL file from `~/.config/pai/Skills/CORE/personas/Skippy.md` traits.

### 0.5 Connect Discord
Configure Discord channel in OpenClaw onboarding or edit config directly with bot token.

### 0.6 Verify
Send a message to Skippy on Discord. Should respond with sass.

---

## Phase 1: Foundation

### 1.1 Install OpenClaw (Fresh)

The old v2026.1.24 (moltbot) has been deleted. Install latest directly:

```bash
# Install globally
npm install -g openclaw@latest

# Run onboarding wizard (sets up config, daemon, channel connections)
openclaw onboard --install-daemon

# Verify
openclaw --version  # Should show v2026.3.x
```

OpenClaw config lives at `~/.openclaw/openclaw.json`. The gateway binds to `ws://127.0.0.1:18789`.

**Important:** v2026.1.24 had multiple CVEs including a CVSS 8.8 one-click RCE. v2026.2.21+ patched these. Always use latest.

### 1.2 Configure LiteLLM Provider

Point OpenClaw at LiteLLM (10.71.1.33). In OpenClaw config (`config.yaml` or env):

```yaml
ai:
  baseUrl: http://10.71.1.33:4000
  apiKey: sk-litellm-local   # vaultwarden "LiteLLM Local"
  model: main                # -> claude-sonnet-4-6
```

### 1.3 Fix clawdbot-mcp Webhook URL

Replace hardcoded placeholder `https://n8n.your-domain.example` with `http://10.71.20.51:5678` in clawdbot-mcp source. Webhook paths: `/webhook/capture` (dedup capture), `/webhook/recall` (hybrid search).

### 1.4 Port Skippy Persona

Copy `~/.config/pai/Skills/CORE/personas/Skippy.md` traits into OpenClaw's system prompt config.

---

## Phase 2: Security

> Full proposal: `.claude_ideas/active/openclaw-prompt-injection-guardrail.md`

OpenClaw sends external data (webhooks, email) into AI context -- real injection surface. Normal Claude Code sessions must have zero overhead.

### 2.1 Create OpenClaw Model Aliases

**LiteLLM config changes require a direct Vertex session (LAW 15)** -- cannot modify while routed through it.

SSH to LXC 204 (10.71.1.33), edit `/home/litellm/litellm-config.yaml`, add alongside existing aliases:

```yaml
- model_name: openclaw/sonnet
  litellm_params: { model: vertex_ai/claude-sonnet-4-6 }
- model_name: openclaw/haiku
  litellm_params: { model: vertex_ai/claude-haiku-4-5@20251001 }
- model_name: openclaw/flash
  litellm_params: { model: vertex_ai/gemini-3-flash-preview }
```

### 2.2 Generate Restricted API Key

```bash
curl -X POST http://10.71.1.33:4000/key/generate \
  -H "Authorization: Bearer sk-litellm-master-key" \
  -d '{"models": ["openclaw/sonnet","openclaw/haiku","openclaw/flash"], "key_alias": "openclaw-prod"}'
```

Store returned key in Vaultwarden `openclaw` profile. Then update OpenClaw config to use the restricted key and `openclaw/sonnet` as default model.

### 2.3 Guardrail Callback

Create a `CustomGuardrail` subclass on LXC 204:
- **Layer 1**: Regex patterns (near-zero latency) -- `ignore previous instructions`, `system:`, `<|im_start|>`
- **Layer 2**: Optional Haiku classifier for ambiguous cases (~200-500ms)
- **Tiers**: `standard` (regex only) for monitoring, `strict` (regex + classifier) for email/webhooks

Register in litellm-config.yaml: `callbacks: ["custom_guardrail.OpenClawGuardrail"]`

---

## Phase 3: Channel Architecture

Per-channel model routing for cost optimization (80% reduction per reference gist). Each channel gets isolated context -- no conversation bleed.

| Channel | Model Alias | Use Case | Guardrail |
|---------|-------------|----------|-----------|
| `#general` | `openclaw/sonnet` | Daily assistant | standard |
| `#briefing` | `openclaw/sonnet` | Morning summaries | standard |
| `#monitoring` | `openclaw/haiku` | Health checks, alerts | standard |
| `#deep-research` | `openclaw/sonnet` | Complex analysis (invoke /opus manually) | standard |
| `#inbox` | `openclaw/sonnet` | Bookmark processing | strict |
| `#youtube-stats` | `openclaw/haiku` | Data retrieval | standard |

Configure in `configs/channels.yaml` with `context_isolation: true` per channel.

### 3.1 Wire n8n Webhooks

| Trigger | n8n Webhook | Channel |
|---------|-------------|---------|
| Bookmark saved | `http://10.71.20.51:5678/webhook/capture` | `#inbox` |
| Knowledge query | `http://10.71.20.51:5678/webhook/recall` | Any |
| Health check alert | n8n cron -> Discord webhook | `#monitoring` |
| Morning briefing | n8n cron (7 AM PST) | `#briefing` |

### 3.2 Cron Schedule

Batch heavy work 3-7 AM, lightweight monitoring during waking hours.

| Time | Task | Channel |
|------|------|---------|
| 3:00 AM | QMD semantic index rebuild | Background |
| 4:00 AM | Auto-update OpenClaw + plugins | `#monitoring` |
| 4:30 AM | Backup to GitHub (ggshield scan) | `#monitoring` |
| 7:00 AM | Morning briefing | `#briefing` |
| Every 30 min (7 AM-11 PM) | Service health checks | `#monitoring` |

Scheduled tasks follow the skippy-agentspace pattern -- reconcile, update, and cleanup commands provide reusable templates for OpenClaw's cron jobs.

---

## Phase 4: Knowledge Integration

### 4.1 Obsidian Vault

Create vault: `Daily/`, `Projects/`, `Research/`, `Bookmarks/` (with frontmatter), `Diagrams/`. Exclude `Templates/`, `.obsidian/`, `.trash/` from indexing.

### 4.2 QMD Indexing

Add vault as a new QMD collection. Existing setup (14,857 files, 64,210 vectors, 38 collections) absorbs it. Nightly rebuild at 3:00 AM via cron.

### 4.3 pgvector Pipeline

Already running on CT 200 with `text-embedding-004` (768-dim). The `semantic_search()` function provides hybrid search. Pipeline: Obsidian save -> n8n webhook -> classify -> embed -> pgvector + SiYuan.

---

## Quick Reference

**Infrastructure:**

| Resource | Address |
|----------|---------|
| LiteLLM proxy | `http://10.71.1.33:4000` |
| LiteLLM config | `/home/litellm/litellm-config.yaml` (LXC 204) |
| n8n | `http://10.71.20.51:5678` |
| PostgreSQL | `10.71.20.49:5432` |
| SiYuan | `http://10.71.20.52:6806` |
| Clawdbot gateway | `http://10.71.1.33:18789` |
| OpenClaw source | `/Volumes/ThunderBolt/Development/openclaw/moltbot/` |
| MCP bridge | `/Volumes/ThunderBolt/Development/openclaw/clawdbot-mcp/` |
| Knowledge backend | `/Volumes/ThunderBolt/Development/openclaw/ai-second-brain/` |

**Model Aliases:**

| Alias | Model | Scope |
|-------|-------|-------|
| sonnet / main | claude-sonnet-4-6 | General (no guardrail) |
| opus / quality | claude-opus-4-6 | General |
| haiku / fast | claude-haiku-4-5@20251001 | General |
| flash | gemini-3-flash-preview | General |
| pro | gemini-3-pro-preview | General |
| openclaw/sonnet | claude-sonnet-4-6 | OpenClaw (with guardrail) |
| openclaw/haiku | claude-haiku-4-5@20251001 | OpenClaw (with guardrail) |
| openclaw/flash | gemini-3-flash-preview | OpenClaw (with guardrail) |
