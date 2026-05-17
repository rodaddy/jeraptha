# OpenClaw Platform Research

Research date: 2026-02-21

## Overview

- **Repo**: https://github.com/openclaw/openclaw
- **Stars**: 215k+ (Feb 2026)
- **Version**: v2026.2.21 (current)
- **Stack**: Node.js >=22.12.0, TypeScript, pnpm
- **Creator**: Peter Steinberger (now at OpenAI)
- **Governance**: Transitioning to OpenClaw Foundation (OpenAI backing)

## Deployment Options

### macOS (MacBook Air)
- Apple Silicon natively supported (ARM64)
- macOS 13 (Ventura) or later
- RAM: 4GB min, 8GB+ recommended
- Disk: 500MB install + 5GB free
- Install: `curl -fsSL https://openclaw.ai/install.sh | bash` or `npm i -g openclaw`

### Docker
- Official Docker Compose available
- `docker-setup.sh` handles build + config wizard
- Runs as non-root `node` user
- Dashboard: http://127.0.0.1:18789/
- Pre-built n8n stack: https://github.com/caprihan/openclaw-n8n-stack

### Proxmox LXC
- Ubuntu 24.04 container
- Docker Compose inside LXC
- Connect to existing LiteLLM, n8n, PostgreSQL

## LiteLLM Integration

- **Docs**: https://docs.openclaw.ai/providers/litellm
- **Protocol**: OpenAI-compatible endpoint (`/v1/chat/completions`)
- **Config**: JSON5 file with `api: "openai-completions"`
- **Required fields**: baseUrl, apiKey, models array (id, name, contextWindow, maxTokens)

```json5
{
  api: "openai-completions",
  baseUrl: "http://<LITELLM_HOST>:4000",
  apiKey: "sk-litellm-local",
  models: [
    { id: "main", name: "Claude Sonnet", contextWindow: 200000, maxTokens: 8192 },
    { id: "fast", name: "Claude Haiku", contextWindow: 200000, maxTokens: 8192 },
    { id: "quality", name: "Claude Opus", contextWindow: 200000, maxTokens: 8192 }
  ]
}
```

## Channel Support (13+ Platforms)

WhatsApp, Telegram, Slack, Discord, Signal, iMessage (BlueBubbles), Microsoft Teams, Matrix, Google Chat, Zalo, WebChat, macOS/iOS/Android companion apps, Voice Wake + Talk Mode (ElevenLabs), Discord voice channels (v2026.2.21)

## n8n Integration

- Pre-built Docker stack: https://github.com/caprihan/openclaw-n8n-stack
- n8n workflow automation skill via ClawHub
- Communication via webhooks (OpenClaw -> n8n)
- 60-80% of agent tasks can offload to n8n workflows
- Reduces LLM API calls for deterministic tasks

## Extension System (ClawHub)

- 4,000+ community skills at https://clawhub.ai/
- Vector (semantic) search for skill discovery
- Install via GUI, CLI, or manual placement in `<workspace>/skills`
- Workspace skills take precedence over bundled/global

## Security Status (CRITICAL)

### CVEs (All Patched in Latest)

| CVE | Severity | Fixed In |
|-----|----------|----------|
| CVE-2026-25253 | CVSS 8.8 (One-click RCE) | v2026.1.29 |
| CVE-2026-24763 | Docker sandbox bypass | v2026.1.30 |
| CVE-2026-25593 | - | v2026.1.30 |
| CVE-2026-25475 | - | v2026.1.30 |
| CVE-2026-27001 | Unsanitized workspace path | v2026.2.15 |
| 40+ vulnerabilities | Various | v2026.2.12 |

### Ecosystem Threats

- 341+ malicious skills in ClawHub (~20% of registry)
- Skills delivering Atomic macOS Stealer (AMOS)
- 42,665 exposed instances identified (Jan 2026)
- 93.4% with authentication bypass conditions

### Recommendations

- Use v2026.2.21+ only (all known CVEs patched)
- Never expose to public internet
- Tailscale/WireGuard only
- No ClawHub skills without manual code review
- Consider `ComposioHQ/secure-openclaw` fork
- Monitor CVE feeds actively

## Alternatives

- ComposioHQ/secure-openclaw (hardened fork)
- Self-built MCP + Claude Desktop + n8n stack
- Continue with current LiteLLM + n8n + Clawdbot (more secure, less features)
