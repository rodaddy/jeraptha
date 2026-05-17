# OpenClaw Blueprint -- Architecture & Design

**Version:** 1.0 | **Date:** 2026-03-30
**Scope:** Canonical reference for all PAI OpenClaw instances
**Source material:** OpenClaw v2026.3.28 docs, community best practices, PAI enforcement research

---

## 1. Vision

OpenClaw is PAI's always-on interface layer. Each instance is an autonomous agent accessible via Discord, Telegram, iMessage, and WhatsApp. Unlike Claude Code (interactive dev sessions), OpenClaw agents are persistent -- they run 24/7, maintain memory across conversations, and proactively execute tasks.

**Three instances planned:**

| Instance | Persona | Home | Primary Channel | Role |
|----------|---------|------|-----------------|------|
| Skippy | Sarcastic Elder AI | MacBook Air (<AGENT_HOST_IP>) | Discord | Primary PA -- research, ops, coding, comms |
| Bot 2 | TBD | CC LXC (CT 321) or dedicated | Discord | Collaborator PA -- data pipelines, DuckDB, trading |
| Bot 3 | TBD | CC LXC (CT 322) or dedicated | Discord | Collaborator PA -- dev tasks, onboarding |

All three share the same architecture. Per-instance customization happens in workspace files (SOUL.md, IDENTITY.md, USER.md, TOOLS.md) and channel config.

---

## 2. Three Agent Methods

OpenClaw supports three complementary patterns for multi-agent work. Use all three.

### 2.1 Workspace Switching

Same agent, different personas. Quick context switches without separate workspaces.

- **Use when:** Agent needs different modes (research mode, coding mode, personal mode)
- **Think of it as:** Different hats on the same person
- **Example:** "Check email" → switches to email specialist behavior within the same workspace

For Skippy, this is implicit -- ROUTER.md handles mode switching via keyword dispatch.

### 2.2 Isolated Agents

Separate agents with their own workspaces, tools, and permissions. Each is truly independent.

- **Use when:** Agents need different API keys, work on separate projects, or have security boundaries
- **Think of it as:** Separate employees with their own desks
- **Example:** A dedicated trading agent with CQG API access that Skippy can't touch
- **CLI:** `openclaw agents add <name>`

For PAI, isolated agents are planned for:
- king-ng trading agents (Sentinel, Analyst, Strategist, Executor) on the king-cap Discord
- Job search automation (autoJob-Evie)
- Any agent that needs credentials Skippy shouldn't have

### 2.3 Spawn & Report

Temporary workers for parallelizable or batch tasks. No persistent state -- do the job and disappear.

- **Use when:** 3+ independent items, research from multiple sources, batch processing
- **Think of it as:** Hiring a temp worker for a specific gig
- **Example:** Verify 500 emails → spawn 5 workers (100 each) → merge results → 5x faster
- **Tool:** `sessions_spawn` or `subagents` tool

This is what Skippy needs most and currently doesn't use. The ROUTER.md and SUPERVISOR.md files tell the agent when and how to spawn workers.

---

## 3. Workspace Anatomy

Every OpenClaw agent has this file structure. These files ARE the agent.

```
~/.openclaw/workspace/
├── IDENTITY.md          # Who am I? Name, personality, communication style
├── SOUL.md              # Core behavioral rules -- never overridden by any prompt
├── USER.md              # Who's the boss -- owner context, preferences
├── ROUTER.md            # Dispatch logic -- maps keywords to specialists/skills
├── SUPERVISOR.md        # Pipeline orchestration -- multi-step workflow definitions
├── AGENTS.md            # Team reference + behavioral laws
├── MEMORY.md            # Curated long-term recall (OB cheat sheet)
├── TOOLS.md             # Infrastructure, APIs, model routing reference
├── BOOT.md              # Startup protocol (runs once per session)
├── HEARTBEAT.md         # Proactive check instructions
├── CONTACTS.md          # People reference
├── SKILL-INDEX.md       # Capability directory (progressive disclosure)
├── Brain/               # Shared knowledge base (markdown files)
├── Skills/              # Installed capabilities (synced from PAI)
├── memory/              # Daily memory files (YYYY-MM-DD.md)
├── docs/                # Extended reference docs (persona-full, agents-full)
└── scripts/             # Utility scripts
```

### File Roles

| File | Loaded | Purpose | Per-Instance? |
|------|--------|---------|---------------|
| IDENTITY.md | Always | Agent identity, name, expertise | Yes -- unique per bot |
| SOUL.md | Always | Hard behavioral rules, personality DNA | Yes -- unique per bot |
| USER.md | Always | Owner context (who they are, preferences) | Yes -- unique per owner |
| ROUTER.md | Always | Keyword → action dispatch table | Shared base + per-instance overrides |
| SUPERVISOR.md | Always | Pipeline definitions (briefing, research, deploy) | Shared base + per-instance overrides |
| AGENTS.md | Always | Behavioral laws + team reference | Shared base + per-instance additions |
| MEMORY.md | Main session only | Curated OB cheat sheet (not loaded in groups) | Per-instance (different memories) |
| TOOLS.md | Always | Infrastructure IPs, models, channels | Yes -- different tools per instance |
| BOOT.md | Session start | One-time startup protocol | Shared base + per-instance hooks |
| HEARTBEAT.md | Every 5 min | Proactive monitoring instructions | Per-instance |
| CONTACTS.md | Session start | People database | Shared (all bots know the team) |
| SKILL-INDEX.md | On demand | Skill directory for progressive disclosure | Shared (all bots have same skills) |

### Progressive Disclosure

At startup, only SKILL-INDEX.md (names + descriptions) is loaded -- not the full skill files. When a task matches a skill, the agent reads that skill's SKILL.md for detailed instructions. This prevents token bloat from loading 70+ skill files at once.

---

## 4. Model Routing

All models go through LiteLLM (<LITELLM_HOST>:4000). No external model providers. No OpenRouter. No direct API calls.

### Available Models

| LiteLLM Model ID | Provider | Context | Use For | Cost |
|---|---|---|---|---|
| `claude-sonnet-4-6@default` | Anthropic | 1M | Default agent, general tasks | $$$ |
| `claude-opus-4-6@default` | Anthropic | 1M | Complex reasoning, architecture | $$$$ |
| `claude-haiku-4-5@20251001` | Anthropic | 200K | Workers, quick lookups, cheap ops | $ |
| `gemini-3-flash` | Google | 1M | Free alternative, bulk ops | Free |
| `gemini-3.1-pro` | Google | 1M | Free moderate complexity | Free |
| `gemini-3-image` | Google | 150K | Image generation | Free |

### Per-Agent Model Assignment

| Agent Role | Model | Why |
|-----------|-------|-----|
| Main orchestrator | claude-sonnet-4-6@default | Balance of capability and cost |
| Complex tasks (when escalated) | claude-opus-4-6@default | Maximum capability |
| Spawn & Report workers | claude-haiku-4-5@20251001 | Cheap, fast, good enough for focused tasks |
| Heartbeat / monitoring | gemini-3-flash | Free, runs every 5 min |
| Batch operations | gemini-3-flash | Free, handles volume |
| Image generation | gemini-3-image | Only option for images |
| OB search / memory ops | claude-haiku-4-5@20251001 | Simple retrieval, cheap |

### Config Model Reference Format

In `openclaw.json`, model references use: `litellm/<model-id>`

```json
"agents": {
  "defaults": {
    "model": {
      "primary": "litellm/claude-sonnet-4-6@default"
    }
  }
}
```

**CRITICAL:** The model string must exactly match a model ID defined in `models.providers.litellm.models[].id`. Mismatches cause silent fallback to unexpected models. The previous config had `litellm/sonnet4.6[1M]` which didn't match the defined ID `claude-sonnet-4-6@default` -- fixed 2026-03-30.

---

## 5. Memory Architecture (Three-Tier)

Based on community best practices. Each tier serves a different purpose.

### Tier 1: Markdown Files (Transparent Layer)

- **What:** Workspace files (SOUL.md, MEMORY.md, memory/YYYY-MM-DD.md)
- **Strength:** Human-readable, survives compaction, can be reviewed in Obsidian
- **Weakness:** Token bloat if files grow too large, no semantic search
- **Use for:** Strict rules, daily logs, curated context

Rules: Keep MEMORY.md under 200 lines. Daily memory files append-only, consolidated nightly.

### Tier 2: QMD + Open Brain (Search Layer)

- **What:** QMD (14K+ files, BM25 + local embeddings) + OB (decisions, thoughts, sessions)
- **Strength:** Semantic search, temporal decay, maximal marginal relevance, hybrid (keyword + vector)
- **Weakness:** Requires mcp2cli exec call, slight latency
- **Use for:** Finding context from past sessions, codebase knowledge, decisions

Access: `~/.local/bin/mcp2cli open-brain search_all --params '{"query": "..."}'`
QMD direct: MCP tools (qmd get, qmd search, qmd vsearch)

### Tier 3: PostgreSQL + pgvector (Structured Layer)

- **What:** CT 200 (<YOUR_IP>:5432), existing infrastructure
- **Strength:** SQL queries, zero hallucination on structured data, scales infinitely
- **Weakness:** Requires SQL knowledge, can't store personality/vibe
- **Use for:** Structured data (contacts, task history, metrics, trading data)

Access: Via n8n workflows or direct SQL through exec tool.

### Nightly Consolidation ("Dream Cycle")

Cron at 2:00 AM ET:
1. Compress daily memory files older than 7 days → summarize into weekly digest
2. Push important facts to OB as thoughts (permanent storage)
3. Update QMD index with new workspace files
4. Trim MEMORY.md if over 200 lines
5. Report: "Dream cycle complete. Consolidated X days, pushed Y thoughts to OB."

---

## 6. Channel Configuration

### Supported Channels

| Channel | Protocol | Notes |
|---------|----------|-------|
| Discord | WebSocket | Primary. Guild-based, per-channel requireMention settings |
| Telegram | Bot API | Secondary/fallback. Reliable when Discord goes down |
| iMessage | Local CLI (imsg) | macOS only, sender identity issue, no reply tags |
| WhatsApp | WhatsApp Business API | Needs plugin entry in config |

### Per-Instance Channel Map

| Instance | Discord | Telegram | iMessage | WhatsApp |
|----------|---------|----------|----------|----------|
| Skippy | Guild 1 + Guild 2 | @bot_handle | user@example.com | User + collaborator |
| Bot 2 | Guild 2 | TBD | N/A | TBD |
| Bot 3 | Guild 2 | TBD | N/A | TBD |

### Cross-Channel Context

OB is the ONLY thing that survives across channels. Every channel is a window. OB is the brain behind all of them.

- Discord message → save context to OB
- Switch to Telegram → pull context from OB
- No cold starts across channels

### Streaming Control

Set `streaming: "off"` for all channels. Streaming causes message fragmentation on mobile and makes responses harder to read. Skippy sends complete messages.

---

## 7. Security

### Tool Policy (Mechanical -- Cannot Be Bypassed)

```json
"tools": {
  "deny": ["cron", "canvas"],
  "exec": {
    "security": "allowlist",
    "strictInlineEval": true
  },
  "elevated": { "enabled": false },
  "loopDetection": {
    "enabled": true,
    "historySize": 30,
    "warningThreshold": 10,
    "criticalThreshold": 20
  }
}
```

### Self-Surgery Ban

Agent cannot edit openclaw.json, restart the gateway, or modify workspace bootstrap files. This is enforced by the `no-self-surgery` hook AND documented in AGENTS.md.

Why: Editing config triggers a reload → gateway restart → WebSocket drop → context loss → user sees "The application did not respond."

### ClawHub / Skill Security

13.4% of ClawHub skills are malicious (keyloggers, credential stealers, hidden cron drains, memory poisoning). Rules:
- NEVER install ClawHub skills without manual code review
- Review the GitHub profile of skill creators
- Check for hidden install scripts in YAML front matter
- Audit for hidden cron jobs after ANY skill install
- All skills synced from PAI's curated `~/.config/pai/Skills/` -- not from ClawHub

### Separate Bot Accounts

Each instance uses its own:
- Discord bot token (not your personal account)
- GitHub account (separate bot account per instance)
- SSH key (per-instance, in `~/.config/agent-oc/ssh/`)
- No access to the owner's personal credentials

### Rate Limiting

The `rate-limiter` hook caps tool calls per minute to prevent runaway API costs. A cron job running every 15 minutes = ~3,000 API calls/month. Monitor and adjust.

---

## 8. Gotchas (Learned the Hard Way)

| # | Gotcha | Fix |
|---|--------|-----|
| 1 | Gateway token mismatch -- `openclaw gateway install` doesn't pass token to launchd | Custom plist with `--token` flag + `gateway.remote.token` in config |
| 2 | Token resolution precedence differs (CLI: env-first, gateway: config-first) | Set both env AND config to same value |
| 3 | `openclaw config set` overwrites entire config | Use `jq` for surgical edits, not `config set` |
| 4 | Workspace skill sandbox blocks symlinks | rsync real files, don't symlink to `~/.config/pai/Skills/` |
| 5 | mcp2cli not in PATH over launchd | Use full path: `~/.local/bin/mcp2cli` |
| 6 | Gateway zombie bug -- process-respawn + KeepAlive = machine-gun restarts | `OPENCLAW_NO_RESPAWN=1` + `ThrottleInterval=10` in plist |
| 7 | `openclaw gateway install` overwrites custom plist patches | Re-apply patches after any install/update |
| 8 | 1M context not applied -- hardcoded 200K fallback | Set `agents.defaults.contextTokens: 1000000` |
| 9 | Prompt degradation ("Lost in the Middle") | `before_prompt_build` hook re-injects rules every N turns |
| 10 | Model string mismatch causes silent fallback | DON'T change working model strings. LiteLLM aliases like `sonnet4.6[1M]` work even if they don't match the provider ID |
| 11 | LiteLLM `/v1/models` returns no capability metadata | Add `compat: {supportsTools: true}` to each model in openclaw.json. Without it, ALL tools show as "unavailable" |
| 12 | `compat` keys MUST be inside model's `compat` block, not at model root | `supportsTools` at root = `Unrecognized key` = gateway crash |
| 13 | Claude models need `requiresOpenAiAnthropicToolPayload: true` in compat | Without it, no prompt caching -- every request pays full price |
| 14 | `tools.fs.allow` key removed in v2026.3.28 schema | Only `workspaceOnly` exists. Adding `allow` crashes config validator |
| 15 | `openclaw doctor --fix` silently strips keys it doesn't recognize | ALWAYS diff config before and after running doctor |
| 16 | ROUTER.md and SUPERVISOR.md not auto-loaded by OpenClaw | Must add explicit Step in BOOT.md telling agent to read them |
| 17 | HOOK.md `event:` (singular) causes "no events defined" warning | Use `events: ["before_tool_call"]` (plural, array format) |
| 18 | Discord CDN URLs expire before agent can fetch them | Images land in `~/.openclaw/media/inbound/` -- agent should read local path |
| 19 | Discord bot re-auth via OAuth URL resets permissions | Must re-add bot to server via generated URL with full permissions checked |
| 20 | Bouncing gateway kills active agent context | NEVER bounce without user approval -- changes saved to disk apply on next natural restart |
