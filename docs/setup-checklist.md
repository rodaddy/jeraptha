# OpenClaw Instance Setup Checklist

Single source of truth for standing up a new OpenClaw instance on macOS.
Derived from the Skippy Air deployment (2026-03-17) and every fix since.

**Last updated:** 2026-04-08
**Validated against:** MacBook Air (10.71.1.21), OpenClaw v2026.4.5

---

## Prerequisites

| Dependency | Version | Install |
|------------|---------|---------|
| macOS | 13+ (Ventura), Apple Silicon | -- |
| Node.js | 25.x | `brew install node` |
| Homebrew | latest | `/bin/bash -c "$(curl -fsSL ...)"` |
| mcp2cli | 0.2.0 | Manual binary install to `~/.local/bin/` |
| iMCP.app | latest | `/Applications/iMCP.app` (native Swift, 93 tools) |
| LiteLLM | accessible | Must be reachable at configured URL (e.g., 10.71.1.33:4000) |
| Open Brain | accessible | Must be reachable (e.g., 10.71.20.15:3100) |

---

## Phase 1: Install OpenClaw

```bash
npm install -g openclaw@latest
openclaw --version  # verify
```

**Run the config wizard interactively:**
```bash
openclaw onboard --install-daemon
```

> **GOTCHA:** Non-interactive onboard has race conditions. Always run interactively, then fix plist manually (Phase 4).

---

## Phase 2: Core Config (`~/.openclaw/openclaw.json`)

After the wizard generates the initial config, apply these fixes:

### 2.1 Context Window (CRITICAL)

The agent runner checks `agents.defaults.contextTokens` FIRST. Model-level `contextWindow` is ignored.

```json
"agents": {
  "defaults": {
    "contextTokens": 1000000
  }
}
```

### 2.2 Thinking / Ultrathink

```json
"agents": {
  "defaults": {
    "thinkingDefault": "high",
    "subagents": {
      "thinking": "high",
      "model": {
        "primary": "opus",
        "fallbacks": ["sonnet", "gemini-pro"]
      }
    }
  }
}
```

**Key names differ by level:**
- `thinkingDefault` at `agents.defaults`
- `thinking` at `subagents` level
- Resolution order: inline directive > session override > per-agent > global > fallback

### 2.3 Subagent Models

Use `model: {primary, fallbacks}` for failover. NOT `allowedModels` (that key only exists at `skills.entries.<name>.subagent` for per-skill restrictions).

### 2.4 YOLO / Exec Mode

```json
"tools": {
  "exec": {
    "security": "full",
    "strictInlineEval": true,
    "ask": "off"
  }
}
```

> **GOTCHA:** `security: "allowlist"` with no allowlist file = ALL exec commands time out waiting for approval. Use `security: "full"` + `ask: "off"` with hooks as the safety net.

### 2.5 Skill Loading (Token Optimization)

```json
"skills": {
  "allowBundled": [],
  "load": {
    "extraDirs": []
  }
}
```

Put `SKILL-INDEX.md` in workspace root for lazy-load lookup. Keep only `mcp-bridge` skill in `workspace/skills/`. Agent reads individual skills on demand from `~/.config/pai/Skills/`.

### 2.6 API Mode (Prompt Caching)

Set `anthropic-messages` at the provider level. All calls (primary + subagents) go through `/v1/messages` and get cache support. Add `cacheRetention: "short"` on sonnet + opus models.

### 2.7 Compaction

```json
"agents": {
  "defaults": {
    "compaction": {
      "reserveTokens": 600000,
      "reserveTokensFloor": 600000
    }
  }
}
```

**Why:** On 1M context, default 16K reserve means compaction fires at ~984K -- way too late. 600K fires at ~400K, aligned with memoryFlush.

> **GOTCHA:** There is NO top-level `compaction` key in the OC schema. Only `agents.defaults.compaction` is valid. Top-level `compaction` crashes the gateway with "Unrecognized key."

> **GOTCHA:** OC version updates can wipe custom config keys. Always verify after upgrades.

### 2.8 Heartbeat

```json
"agents": {
  "defaults": {
    "heartbeat": {
      "session": "isolated",
      "lightContext": false,
      "suppressToolErrorWarnings": false,
      "model": "litellm/sonnet4.6[1M]"
    }
  }
}
```

**Key rules:**
- `session: "isolated"` -- prevents model override bug during heartbeat cycling
- `lightContext: false` -- heartbeat NEEDS workspace files (HEARTBEAT.md, TASKS.md). `true` = read() loop crash (see config-changelog 2026-04-05)
- `suppressToolErrorWarnings: false` -- heartbeat needs error feedback to stop retrying broken calls
- Model must be at least sonnet-tier. flash-lite can't follow the protocol.
- Session state overrides config. After changing heartbeat model, also clear the heartbeat session entry in sessions.json.

### 2.8 env.shellEnv

**DO NOT add custom keys to `env.shellEnv`** -- OpenClaw validates the schema strictly. Unrecognized keys cause the gateway to crash-loop. Only `enabled: true/false` is valid here. Use LaunchAgent env vars instead (Phase 4).

---

## Phase 3: LiteLLM Model Routing

Use standard model aliases, not custom `openclaw/*` prefixed names:

| Alias | Model | Use For |
|-------|-------|---------|
| `main` / `sonnet` | claude-sonnet-4-6 | General tasks |
| `fast` / `haiku` | claude-haiku-4-5 | Monitoring, alerts |
| `quality` / `opus` | claude-opus-4-6 | Deep research |
| `pro` | gemini-3-pro-preview | Free alternative |
| `flash` | gemini-3-flash-preview | Fast free tasks |
| `embeddings` | text-embedding-004 | Vector embeddings (768-dim) |

Models are configured under `providers.litellm.models[].id` in openclaw.json, NOT in LiteLLM's DB.

---

## Phase 4: LaunchAgents

### 4.1 Gateway (`ai.openclaw.gateway`)

After `openclaw gateway install` generates the plist, apply these patches:

```xml
<key>ProgramArguments</key>
<array>
    <string>/opt/homebrew/opt/node/bin/node</string>
    <string>/opt/homebrew/lib/node_modules/openclaw/dist/index.js</string>
    <string>gateway</string>
    <string>--port</string>
    <string>18789</string>
</array>
```

**Required EnvironmentVariables (add if missing):**

| Key | Value | Why |
|-----|-------|-----|
| `OPENCLAW_NO_RESPAWN` | `1` | Disables internal fork-before-die handoff (zombie bug) |
| `MCP2CLI_DAEMON_PORT` | `9501` | Exec shells find the mcp2cli daemon |
| `NODE_EXTRA_CA_CERTS` | `/etc/ssl/cert.pem` | TLS cert validation after brew rebuilds |
| `NODE_USE_SYSTEM_CA` | `1` | Same TLS fix |
| `OPENCLAW_LOG_LEVEL` | `debug` | Enables plugin debug logging (jeraptha hook traces) |

**Required settings:**

| Key | Value | Why |
|-----|-------|-----|
| `KeepAlive` | `true` | Auto-restart on crash |
| `ThrottleInterval` | `10` | Prevents zombie storm (default 1 = machine-gun) |
| `RunAtLoad` | `true` | Start on login |

> **GOTCHA: Zombie Bug.** OpenClaw's `process-respawn.ts` spawns a detached `/bin/sh` child on SIGTERM that relaunches the gateway. Combined with launchd `KeepAlive`, this creates duplicate processes eating CPU/RAM. Fix: `OPENCLAW_NO_RESPAWN=1` + `ThrottleInterval=10`.

> **GOTCHA: `openclaw gateway install` overwrites the plist.** Re-apply all patches after running it.

> **GOTCHA: `--force` flag.** Add to ProgramArguments if stale port holders are an issue. Kills whatever holds port 18789 before binding.

### 4.2 mcp2cli Daemon (`com.mcp2cli.local-ui`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mcp2cli.local-ui</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/USER/.local/bin/mcp2cli</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>MCP2CLI_DAEMON</key>
        <string>1</string>
        <key>MCP2CLI_LISTEN_HOST</key>
        <string>127.0.0.1</string>
        <key>MCP2CLI_LISTEN_PORT</key>
        <string>9501</string>
        <key>MCP2CLI_IDLE_TIMEOUT</key>
        <string>0</string>
        <key>HOME</key>
        <string>/Users/USER</string>
        <key>PATH</key>
        <string>/Users/USER/.local/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/USER/Library/Logs/mcp2cli/local-ui.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/USER/Library/Logs/mcp2cli/local-ui.stderr.log</string>
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
```

> **CRITICAL:** Without the daemon, mcp2cli makes cold one-shot HTTP calls. `search_brain` (which triggers embedding) hangs on these. The daemon provides connection pooling and timeout management.

### 4.3 System Env Var (`com.pai.env`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pai.env</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/launchctl</string>
        <string>setenv</string>
        <string>MCP2CLI_DAEMON_PORT</string>
        <string>9501</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

Also run immediately: `launchctl setenv MCP2CLI_DAEMON_PORT 9501`

### 4.4 PAI Skills Sync (`ai.pai.sync-openclaw-skills`)

```xml
<key>ProgramArguments</key>
<array>
    <string>/Users/USER/.local/bin/sync-openclaw-skills.sh</string>
</array>
<key>WatchPaths</key>
<array>
    <string>/Users/USER/.config/pai/Skills</string>
</array>
```

Fires when skills directory changes, syncs to OC workspace.

### 4.5 Load Order

```bash
mkdir -p ~/Library/Logs/mcp2cli
launchctl load ~/Library/LaunchAgents/com.pai.env.plist
launchctl load ~/Library/LaunchAgents/com.mcp2cli.local-ui.plist
sleep 2  # let daemon start
launchctl load ~/Library/LaunchAgents/ai.pai.sync-openclaw-skills.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

---

## Phase 5: mcp2cli Setup

### 5.1 Binary

Install native arm64 binary to `~/.local/bin/mcp2cli`. NOT available via npm/brew -- manual install from the mcp2cli repo build.

### 5.2 Services (`~/.config/mcp2cli/services.json`)

Minimum for OC:

```json
{
  "services": {
    "open-brain": {
      "description": "Open Brain semantic knowledge base",
      "backend": "http",
      "url": "http://10.71.20.15:3100/mcp",
      "headers": {
        "Authorization": "Bearer AGENT_TOKEN_HERE"
      }
    },
    "vaultwarden-secrets": {
      "backend": "http",
      "url": "http://10.71.20.14:3001/mcp",
      "headers": {
        "Authorization": "Bearer AGENT_TOKEN_HERE"
      }
    },
    "apple-notes": {
      "description": "Apple Notes MCP",
      "backend": "stdio",
      "command": "mcp-apple-notes"
    },
    "imcp": {
      "description": "iMCP -- native Apple services",
      "backend": "stdio",
      "command": "/Applications/iMCP.app/Contents/MacOS/imcp-server",
      "blockTools": ["capture_take_picture", "capture_record_audio"]
    }
  }
}
```

Use the AGENT token (restricted RBAC), not admin token. Different tokens = different blast radius.

### 5.3 Tokens (`~/.config/mcp2cli/tokens.json`)

```json
{
  "tokens": [
    {"id": "USERNAME", "role": "admin", "description": "Full admin access"},
    {"id": "AGENT_NAME", "role": "agent", "description": "Agent access (tools + read, no config mutations)"},
    {"id": "test01", "role": "viewer", "description": "Read-only access"}
  ]
}
```

### 5.4 Skills

Copy `~/.config/mcp2cli/skills/` from existing install (21 skill dirs). Or regenerate: `mcp2cli generate-skills <service>` for each service.

### 5.5 Verify

```bash
echo $MCP2CLI_DAEMON_PORT  # should be 9501
lsof -iTCP:9501 -sTCP:LISTEN  # daemon listening
mcp2cli open-brain search_brain --params '{"query":"test","limit":1}'  # instant result
```

---

## Phase 6: MCP Bridge (`~/.openclaw/mcporter.json`)

OpenClaw uses mcporter for its internal MCP calls (NOT mcp2cli). The agent's exec tool uses mcp2cli.

```json
{
  "open-brain": {
    "transport": "streamable-http",
    "url": "http://10.71.20.15:3100/mcp",
    "headers": {"Authorization": "Bearer ADMIN_TOKEN"}
  },
  "vaultwarden": {
    "transport": "streamable-http",
    "url": "http://10.71.20.14:3001/mcp",
    "headers": {"Authorization": "Bearer ADMIN_TOKEN"}
  },
  "qmd": {
    "transport": "stdio",
    "command": "/Users/USER/.bun/bin/qmd",
    "args": ["mcp"]
  },
  "n8n": {
    "transport": "stdio",
    "command": "npx",
    "args": ["n8n-mcp"],
    "env": {
      "MCP_MODE": "stdio",
      "N8N_API_URL": "https://n8n.rodaddy.live",
      "N8N_API_KEY": "JWT_TOKEN"
    }
  }
}
```

> **Note:** mcporter.json may be a symlink to `~/.openclaw/workspace/.openclaw/mcporter.json`. Check and recreate if needed.

---

## Phase 7: Channels

### 7.1 Discord

- Create bot in Discord Developer Portal
- Enable: Message Content Intent, Server Members Intent
- Store token in Vaultwarden
- Configure in openclaw.json under `channels`
- `commands.useAccessGroups` must be `false` for guild slash commands
- `interactions_endpoint_url` must stay CLEARED (not routed to n8n)

### 7.2 Telegram

- Create bot via @BotFather
- Store token in Vaultwarden
- Let n8n handle webhook registration -- NEVER manually re-register

### 7.3 iMessage (BlueBubbles)

- BlueBubbles server required on a Mac with the iCloud account
- Configure BB plugin in OC
- Consider dedicated Apple ID to avoid seeing personal messages

### 7.4 WhatsApp

- **DISABLED on Air (2026-03-31)** -- 499 storm: 55+ disconnect/reconnect cycles in one day, exact 60sec intervals, ban risk
- Do NOT enable on new instances until root cause is fixed

---

## Phase 8: Jeraptha Behavioral Enforcement

> **CRITICAL (2026-04-08):** OC v2026.4.x has TWO hook dispatch systems. Managed hooks
> (`~/.openclaw/hooks/`) do NOT work for `before_tool_call` or `before_prompt_build` events.
> Only typed plugins (`api.on()`) dispatch these events. Jeraptha deploys as a typed plugin.

### 8.1 Install Jeraptha

Jeraptha repo: `/Volumes/ThunderBolt/Development/jeraptha/` (same path on Air's ThunderBolt).

```bash
cd /Volumes/ThunderBolt/Development/jeraptha
./install.sh --apply-config
# Or dry-run first: ./install.sh --dry-run
```

This installs:
- Plugin to `~/.openclaw/extensions/jeraptha/`
- Workspace files (AGENTS.md, HEARTBEAT.md, templates)
- Documentation to `~/.openclaw/workspace/docs/jeraptha/`
- Recommended config values (contextTokens, compaction, heartbeat)
- Disables legacy `pai-hooks` if present

### 8.2 Jeraptha Hooks (7 total)

| # | Hook | Event | Priority | Type |
|---|------|-------|----------|------|
| 1 | no-self-surgery | before_tool_call | 100 | Hard block (openclaw.json) / approval (workspace files) |
| 2 | no-deaf-polls | before_tool_call | 90 | Hard block (polls > 10s) |
| 3 | ob-gate | before_tool_call | 80 | Hard block (questions without OB search) |
| 4 | sop-gate | before_tool_call | 70 | Hard block (process work without SOP search) |
| 5 | task-context | before_prompt_build | 60 | Inject TASKS.md every 3 turns, STALLED every turn |
| 6 | sentiment-tracker | before_prompt_build | 50 | Score user sentiment, update SCORECARD.md |
| 7 | law-reinforcement | before_prompt_build | 40 | Re-inject rules every 5 turns |

### 8.3 Managed Hooks (internal events only)

These still work for `message:preprocessed`, `session:compact:after`, etc.:

| Hook | Event | Purpose |
|------|-------|---------|
| `evie-filter` | `message:preprocessed` | Filter iMessage from non-allowlisted senders |
| `post-compact-reload` | `session:compact:after` | Re-read workspace files after compaction |

### 8.4 Verify

```bash
grep '\[jeraptha\] registered' /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | tail -1
# Expected: "4 before_tool_call + 3 before_prompt_build + 1 message_received (7 Jeraptha hooks)"
```

Full verification: see `jeraptha/docs/verify.md` and `jeraptha/docs/verify-quick.sh`.

### 8.5 SOP for Changes

All hook/plugin/config changes follow `jeraptha/config/sop.md`:
1. Dated backup to `~/.openclaw/backups/YYYY-MM-DD-<description>/`
2. Make the change
3. Update changelog (`~/.openclaw/workspace/docs/config-changelog.md`)
4. Update backup index (`~/.openclaw/backups/index.md`)
5. Bounce and verify

---

## Phase 9: Identity & Persona

### 9.1 Workspace Files

- `SOUL.md` -- personality, communication style, traits (e.g., "Narrates everything")
- `AGENTS.md` -- LAWs, agent orchestration rules, communication-first enforcement
- `BOOT.md` -- startup sequence, briefing format, step-by-step init
- `MEMORY.md` -- pointer to Open Brain with tag conventions

### 9.2 Device Identity

`~/.openclaw/identity/device.json` -- generated during onboard. Contains device ID and Ed25519 keypair. Unique per instance.

### 9.3 Credentials

`~/.openclaw/credentials/` -- pairing files for each channel:
- `discord-pairing.json`, `telegram-pairing.json`, `imessage-pairing.json`
- `*-allowFrom.json` -- sender allowlists per channel
- `bluebubbles-pairing.json` (if using BB for iMessage)

---

## Phase 10: Shell Environment

Add to `~/.zshrc`:

```bash
export MCP2CLI_DAEMON_PORT=9501
export OPENCLAW_GATEWAY_TOKEN="<gateway-auth-token>"
```

---

## Phase 11: Verify

```bash
# Gateway running
ps aux | grep openclaw-gateway

# Channels connected
tail -20 ~/.openclaw/logs/gateway.log | grep -E 'discord|telegram|imessage'

# mcp2cli daemon
lsof -iTCP:9501 -sTCP:LISTEN

# OB reachable
mcp2cli open-brain search_brain --params '{"query":"test","limit":1}'

# Network deps
curl -s -m 5 http://10.71.1.33:4000/health    # LiteLLM
curl -s -m 5 http://10.71.20.15:3100/health    # Open Brain

# Config valid
openclaw doctor --fix
```

---

## Known Bugs & Workarounds (Chronological)

### 1. Gateway Token Mismatch (2026-03-17)
`buildServiceEnvironment()` in `src/daemon/service-env.ts` silently drops `OPENCLAW_GATEWAY_TOKEN`. Pass `--token` in ProgramArguments AND set `gateway.remote.token == gateway.auth.token` in config.

### 2. Zombie Gateway Processes (2026-03-27)
`process-respawn.ts` + `KeepAlive` = machine-gun zombie factory. Fix: `OPENCLAW_NO_RESPAWN=1`, `ThrottleInterval=10`, `--force` flag.

### 3. TLS Cert Validation After Brew Upgrade (2026-03-20)
Brew rebuilds node with different CA bundle. Gateway can't reach LiteLLM. Fix: `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem` + `NODE_USE_SYSTEM_CA=1` in plist.

### 4. 200K Context Hardcode (2026-03-27)
OC's `getEffectiveWindow()` returns 200K even for 1M models. Fix: `agents.defaults.contextTokens: 1000000`.

### 5. WhatsApp 499 Storm (2026-03-30)
55+ disconnect cycles/day, 60sec intervals, ban risk. Disabled. Root cause unknown.

### 6. YOLO Exec Timeout (2026-04-02)
`security: "allowlist"` with no allowlist = all exec blocked. Switch to `security: "full"` + `ask: "off"`.

### 7. `config set` Overwrites Entire Config (2026-03-17)
`openclaw config set` rewrites the entire file, can reset fields. Always edit JSON directly with backup: `cp openclaw.json openclaw.json.backup-$(date +%s)`.

### 8. Subagent Model Schema Mismatch (2026-04-01)
`allowedModels` does not exist at `agents.defaults.subagents`. Use `model: {primary, fallbacks}` for global failover.

### 9. Thinking Key Name Inconsistency (2026-04-01)
`thinkingDefault` at agents.defaults, `thinking` at subagents level. Different keys, same concept.

### 10. `env.shellEnv` Strict Schema (2026-04-03)
Custom keys in `env.shellEnv` crash the gateway. Only `enabled` is valid. Use LaunchAgent env vars instead.

### 11. mcp2cli Daemon Missing = search_brain Hangs (2026-04-03)
Without the daemon (port 9501), mcp2cli makes cold one-shot HTTP calls. Vector search hangs. Fix: daemon LaunchAgent + `MCP2CLI_DAEMON_PORT` env var propagated via LaunchAgent AND `launchctl setenv`.

### 12. Workspace Skill Sandbox Blocks Symlinks (2026-03-17)
OC workspace skills can't follow symlinks. Copy files, don't symlink.

### 13. mcp2cli Not in PATH Over SSH/launchd (2026-03-17)
launchd processes don't inherit `.zshrc` PATH. Set full PATH in each LaunchAgent plist.

### 14. openclaw.json Ownership (2026-04-03, observed)
File was `root:wheel` instead of `rico:staff`. Can cause permission issues on writes. Fix: `chown rico:staff ~/.openclaw/openclaw.json`.

### 15. Discord Slash Commands Silently Denied (2026-04-01)
`commands.useAccessGroups` defaults to `true`. With no access groups or `allowFrom` configured, ALL slash commands return "Application did not respond" in guild channels. Fix: `commands.useAccessGroups: false`. If you need access control, configure `commands.allowFrom` with user IDs keyed by provider.

### 16. Discord `interactions_endpoint_url` Kill Switch (2026-04-01)
When set in Discord Developer Portal, ALL interactions (DM and guild) route via HTTP POST to that URL. The bot's WebSocket gateway never receives `INTERACTION_CREATE` events. Cannot mix WebSocket and HTTP interaction handling. Fix: clear the URL entirely if using OC's built-in slash commands. If n8n needs buttons, create a separate Discord app.

### 17. Custom Model Namespace Breaks Prompt Caching (2026-03-19)
Custom-namespaced model names (e.g., `openclaw/sonnet`) return null `model_map_value` in LiteLLM, preventing `cache_control` injection. Standard names (`sonnet`, `opus`, `haiku`) are recognized and get prompt caching automatically. Strip custom prefixes.

### 18. Models Must Be in Config, Not LiteLLM DB (2026-03-19)
Move model definitions to `openclaw.json` under `providers.litellm.models[]`, not in LiteLLM's database. Config-based models enable prompt caching; DB-based models don't get `cache_control` injected.

### 19. Persona Bleed-Through on New Agent Deploy (2026-03-30)
Copying config templates from one agent (e.g., Skippy) to another (e.g., Bob) leaks personality traits. Always diff `SOUL.md`, `BOOT.md`, `IDENTITY.md` against the source agent's files before first run. new-agent-playbook.md includes a persona cleanup checklist as Step 3.

### 20. `jq file > file` Redirect Clobbers Config (2026-03-31)
Shell truncates the output file before jq reads it. `jq '.foo = "bar"' file.json > file.json` = 0 bytes. ALWAYS: `cp file file.backup-$(date +%s)` then write to a temp file and `mv`.

### 21. Config Backup to GitHub (2026-03-22)
Private repo `Skippy-the-Magnificent-one/skippy-config` holds all configs, SOUL, AGENTS, BOOT, HEARTBEAT, TOOLCONFIG. Push after significant config changes.

---

## Behavioral Config Lessons

These aren't bugs -- they're config patterns learned from getting Skippy to behave correctly.

### Communication-First Enforcement (2026-04-02)
Root cause: `law-reinforcement` hook injected "NEVER narrate" every 5 turns, overriding AGENTS.md's "announce every step." Three files changed:
1. **SOUL.md** -- added "Narrates everything" as personality trait
2. **AGENTS.md** -- LAW 3 renamed "COMMUNICATE FIRST" with agent orchestration specifics
3. **hooks/law-reinforcement/handler.ts** -- flipped rules 3 & 5 from "shut up" to "narrate everything", added "COMMUNICATION DURING AGENT WORK" section

### Skill Loading Optimization (2026-03-18)
Bulk-loading 76+ skills into every system prompt wastes massive tokens. Pattern: `allowBundled=[]`, `extraDirs=[]`, put `SKILL-INDEX.md` in workspace root, keep only `mcp-bridge` in `workspace/skills/`. Agent reads individual skills on demand. Confirmed snappier responses.

### OC Hooks Are the Only Enforcement (2026-03-22)
OC has no equivalent to CC's pre-tool-use hooks at the protocol level. System prompt rules are "suggestions the model agrees to then ignores" -- Skippy went silent for 20 min, no status updates, timeouts with no reporting. `before_tool_call` hooks in `~/.openclaw/hooks/` are the ONLY structural enforcement.

### OB Gate: Soft Nudge -> Hard Block (2026-04-02)
Initial `ob-gate` hook was a soft suggestion to check OB. Agent ignored it. Upgraded to hard block -- message won't send until OB is checked. Exempt patterns for confirmations/preferences to avoid blocking simple replies.

### mcp2cli Restricted Token for OC (2026-03-17)
Always-on channel should NOT have admin-level access to all PAI systems. Use agent-scoped token (read + tools, no config mutations). Different tokens per config file is intentional RBAC, not drift.

### Heartbeat Session Isolation (2026-03-27)
Heartbeat must run in `session: "isolated"` mode. Without isolation, heartbeat's model override leaks into the main agent session, corrupting model routing.

---

## Disk Usage Reference

| Path | Size |
|------|------|
| `~/.openclaw/` | ~483 MB |
| `~/.config/mcp2cli/` | ~464 KB |

---

## Related Docs

- `openclaw-deployment-playbook.md` -- Original Air deployment notes (2026-03-17)
- `blueprint-architecture.md` -- Multi-instance architecture design
- `blueprint-enforcement.md` -- Three-layer enforcement model
- `blueprint-deployment.md` -- Post-deploy hardened blueprint
- `law-enforcement-hooks.md` -- Hook implementation deep-dive
- `../docs/setup-guide.md` -- Prerequisites and channel architecture
- `../docs/imcp-setup.md` -- iMCP native macOS automation reference
