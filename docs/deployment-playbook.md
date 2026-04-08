# OpenClaw Deployment Playbook

Learned the hard way on 2026-03-17 deploying Skippy on MacBook Air (10.71.10.21).
Reference for all future OpenClaw instances (King-NG PAs, Strategy Finder, LXC deploys).

## Quick Reference

| Item | Value |
|------|-------|
| Latest version | v2026.4.5 |
| Install | `npm install -g openclaw@latest` |
| Config | `~/.openclaw/openclaw.json` |
| Workspace | `~/.openclaw/workspace/` |
| Persona | `~/.openclaw/workspace/SOUL.md` |
| Logs | `~/.openclaw/logs/gateway.log` |
| Dashboard | `http://127.0.0.1:18789/` |
| Source repo | `https://github.com/openclaw/openclaw` (cloned to `/tmp/openclaw-src/` for reference) |

---

## CRITICAL BUGS & GOTCHAS

### 1. Gateway Token Mismatch (SHOWSTOPPER)

**Bug:** `openclaw gateway install` does NOT pass `OPENCLAW_GATEWAY_TOKEN` to the launchd/systemd service environment. The gateway service's `buildServiceEnvironment()` in `src/daemon/service-env.ts` omits it, while the node service DOES include it.

**Symptom:** Every CLI command fails with `gateway token mismatch (provide gateway auth token)`.

**Root cause chain:**
1. Daemon starts without `OPENCLAW_GATEWAY_TOKEN` env var
2. Gateway calls `ensureGatewayStartupAuth()` which generates a RANDOM token
3. Random token gets persisted to config
4. CLI reads from `device-auth.json` operator token (different)
5. Token mismatch on every WebSocket handshake

**Fix:** Write your OWN launchd plist with `--token` in ProgramArguments:
```xml
<key>ProgramArguments</key>
<array>
    <string>/opt/homebrew/opt/node@24/bin/node</string>
    <string>/opt/homebrew/lib/node_modules/openclaw/dist/index.js</string>
    <string>gateway</string>
    <string>run</string>
    <string>--token</string>
    <string>YOUR_TOKEN_HERE</string>
    <string>--port</string>
    <string>18789</string>
</array>
```

Also include `OPENCLAW_GATEWAY_TOKEN` in the plist's EnvironmentVariables.

**ALSO REQUIRED:** Set `gateway.remote.token` to match `gateway.auth.token`:
```bash
openclaw config set gateway.remote.token YOUR_TOKEN_HERE
```
Without this, the CLI sends null/wrong token even when the gateway token is correct.

### 2. Token Resolution Precedence (Source Code Analysis)

From `src/gateway/credentials.ts`:
- **CLI commands (health, status):** `env-first` precedence (env var > config)
- **Gateway service:** `config-first` precedence (config > env var)
- **Drift check:** `config-first` with EMPTY env dict

From `src/gateway/startup-auth.ts` - token generation order:
1. Override flag (`--token`)
2. Environment variable (`OPENCLAY_GATEWAY_TOKEN`)
3. Config file (`gateway.auth.token`)
4. Generate random (if none of above)

### 3. `config set` Overwrites Config

Every `openclaw config set` command rewrites the entire config file. This can:
- Change token values if auto-migration kicks in
- Reset fields you set manually
- Create backup files (`.json.bak`) that accumulate

### 4. Bind Mode Names (Not IPs)

`gateway.bind` accepts named modes, NOT raw IPs:
- `loopback` -- 127.0.0.1 only
- `lan` -- 0.0.0.0 (all interfaces)
- `tailnet` -- Tailscale IP
- `auto` -- loopback, falls back to LAN
- `custom` -- uses `gateway.customBindHost`

`openclaw config set gateway.bind 0.0.0.0` WILL FAIL with validation error.

### 5. mcporter Transport Incompatibility

mcporter uses Streamable HTTP MCP protocol (POST to `/register`). Servers using different HTTP transports (like Open Brain) will get 404 errors.

**Workaround:** Use mcp2cli as a bash tool via a workspace skill instead of mcporter.

### 6. Non-Interactive Onboard Race Condition

`openclaw onboard --non-interactive --install-daemon` has a race:
1. Writes config with generated token
2. Installs and starts daemon
3. Daemon generates ITS OWN token (see bug #1)
4. CLI can't connect

**Workaround:** Use interactive onboard (`openclaw onboard --install-daemon`), then fix the plist manually.

### 7. Old Clawdbot Artifacts

If migrating from Clawdbot:
- Remove `/opt/homebrew/lib/node_modules/clawdbot` and `clawdhub`
- Remove `~/Library/LaunchAgents/com.clawdbot.gateway.plist`
- Remove `~/.clawdbot/`
- Check for `CLAWDBOT_GATEWAY_TOKEN` env var (legacy, causes confusion)

---

## DEPLOYMENT STEPS (WHAT ACTUALLY WORKS)

### Phase 1: Install

```bash
# Install OpenClaw
npm install -g openclaw@latest

# Verify
openclaw --version  # Should show v2026.3.x
```

### Phase 2: Initial Setup

```bash
# Generate a token
export OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 24)
echo "Save this token: $OPENCLAW_GATEWAY_TOKEN"

# Add to shell profile
echo "export OPENCLAW_GATEWAY_TOKEN=\"$OPENCLAW_GATEWAY_TOKEN\"" >> ~/.zshrc

# Run interactive onboard (NOT --non-interactive)
openclaw onboard --install-daemon
# Pick: Local, LAN bind, token auth, paste your token
```

### Phase 3: Fix the Daemon (MANDATORY)

After onboard, the daemon will have the token mismatch bug. Fix it:

```bash
# Stop the broken daemon
openclaw gateway stop
launchctl unload ~/Library/LaunchAgents/ai.openclaw.gateway.plist

# Set remote.token to match auth.token
openclaw config set gateway.remote.token $OPENCLAW_GATEWAY_TOKEN

# Write fixed plist (see template below)
# Then load it
launchctl load ~/Library/LaunchAgents/ai.openclaw.gateway.plist

# Verify
openclaw health
```

### Phase 4: LiteLLM Provider

The model config goes in `~/.openclaw/openclaw.json` under `models.providers.litellm`:

```json5
{
  "models": {
    "providers": {
      "litellm": {
        "baseUrl": "http://10.71.20.53:4000",
        "apiKey": "sk-YOUR-LITELLM-KEY",
        "api": "openai-completions",
        "models": [
          {"id": "openclaw/sonnet", "name": "Claude Sonnet 4.6", "reasoning": true, "input": ["text", "image"], "contextWindow": 200000, "maxTokens": 64000},
          {"id": "openclaw/opus", "name": "Claude Opus 4.6", "reasoning": true, "input": ["text", "image"], "contextWindow": 200000, "maxTokens": 64000},
          {"id": "openclaw/haiku", "name": "Claude Haiku 4.5", "reasoning": false, "input": ["text", "image"], "contextWindow": 200000, "maxTokens": 8192},
          {"id": "openclaw/flash", "name": "Gemini 3 Flash", "reasoning": false, "input": ["text", "image"], "contextWindow": 1000000, "maxTokens": 8192},
          {"id": "openclaw/pro", "name": "Gemini 3 Pro", "reasoning": true, "input": ["text", "image"], "contextWindow": 1000000, "maxTokens": 8192},
          {"id": "openclaw/image", "name": "Gemini 3 Image", "reasoning": false, "input": ["text", "image"], "contextWindow": 32000, "maxTokens": 8192}
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "litellm/openclaw/sonnet"
      }
    }
  }
}
```

### Phase 5: Persona (SOUL.md)

Copy persona file to workspace:
```bash
cp /path/to/SOUL.md ~/.openclaw/workspace/SOUL.md
```

The agent reads all `.md` files in the workspace root as context.

### Phase 6: Channels

**Discord:**
```bash
openclaw config set channels.discord.botToken "YOUR_DISCORD_BOT_TOKEN"
openclaw config set channels.discord.enabled true
```

**Telegram:**
```bash
openclaw config set channels.telegram.botToken "YOUR_TELEGRAM_BOT_TOKEN"
openclaw config set channels.telegram.enabled true
# After first message, approve pairing:
openclaw pairing approve telegram CODE
```

**iMessage (macOS only):**
- Grant Full Disk Access to node: System Settings > Privacy & Security > Full Disk Access
- Grant Automation access for Messages.app
- Restart gateway
- Send message from phone, approve pairing:
```bash
openclaw pairing approve imessage CODE
```

### Phase 7: MCP Tools via mcp2cli

Don't use mcporter for HTTP MCP servers (transport incompatibility). Instead, create a workspace skill:

```bash
mkdir -p ~/.openclaw/workspace/skills/mcp-bridge
# Write SKILL.md with mcp2cli usage docs and examples
```

Ensure mcp2cli is installed at `~/.local/bin/mcp2cli`. It is NOT in default PATH over SSH/launchd -- skills must use the full path `~/.local/bin/mcp2cli` or export PATH first.

### Phase 8: PAI Skills (Lazy Load -- Do NOT Bulk Copy)

**Do NOT copy or sync all PAI skills into the workspace.** OpenClaw injects every workspace skill into the system prompt on every message. With 76+ skills, that's massive token waste.

**Do NOT use `extraDirs` either.** Setting `skills.load.extraDirs: ["~/.config/pai/Skills"]` in openclaw.json injects ALL PAI skills into every prompt -- same problem. The `allowBundled` setting only gates bundled skills, NOT extraDirs.

**Solution: Lazy load via index file.**

1. Disable all skill injection in openclaw.json:
```bash
openclaw config set skills.allowBundled '[]'
openclaw config set skills.load.extraDirs '[]'
```

2. Copy AGENT-INDEX.md to workspace root:
```bash
cp ~/.config/pai/Skills/AGENT-INDEX.md ~/.openclaw/workspace/SKILL-INDEX.md
```

3. Keep only essential skills in workspace:
```
~/.openclaw/workspace/skills/
  mcp-bridge/SKILL.md    # Always loaded -- OB, qmd, n8n, homekit, vaultwarden
```

4. Add lazy-load instructions to AGENTS.md:
```
Skills are NOT pre-loaded. Read SKILL-INDEX.md to find the right skill,
then read ~/.config/pai/Skills/<skill>/SKILL.md on demand.
```

The agent reads the index, identifies which skill it needs, reads that one SKILL.md, and acts. No bulk loading, minimal token cost.

**Important:** PAI skills must be installed at `~/.config/pai/Skills/` on the instance. Fix any broken symlinks (e.g., pointing to `/Volumes/ThunderBolt/`):
```bash
find ~/.config/pai/Skills -maxdepth 2 -type l ! -exec test -e {} \; -print
```

### Phase 9: Memory (Open Brain Backed)

OpenClaw expects `MEMORY.md` in the workspace root. Instead of flat-file memory, point it to Open Brain:

Create `~/.openclaw/workspace/MEMORY.md` with:
- Instructions to use `~/.local/bin/mcp2cli open-brain log_thought` for writes
- Instructions to use `~/.local/bin/mcp2cli open-brain search_brain` for reads
- A small "quick reference" section with instance-specific info (timezone, channels, security level)
- Rules for what to log vs what to skip

This gives all OpenClaw instances shared memory through OB, so decisions logged by one instance are searchable by all others.

### Phase 10: Workspace Files Checklist

After skills sync, verify all workspace files exist:

| File | Purpose | Source |
|------|---------|--------|
| `SOUL.md` | Persona definition | Custom per instance |
| `AGENTS.md` | Behavioral instructions | OpenClaw default (customize) |
| `TOOLS.md` | Environment-specific reference data | Custom per instance |
| `USER.md` | User info (name, timezone, channels) | Custom per instance |
| `MEMORY.md` | OB-backed memory instructions | Template (see Phase 9) |
| `IDENTITY.md` | Bot identity | OpenClaw default |
| `HEARTBEAT.md` | Proactive check instructions | Custom per instance |
| `skills/mcp-bridge/` | mcp2cli tool bridge | Copy from template |
| `skills/*/` | PAI skills (76+) | rsync from ~/.config/pai/Skills/ |

### Phase 11: Discord Assets

Upload to Discord Developer Portal > Rich Presence > Art Assets:

| Asset | Dimensions | Location |
|-------|-----------|----------|
| Cover Image | 1024x576 (16:9) | Generate via nano-banana, resize with sips |
| Large Image | 1024x1024 (square) | Generate via nano-banana |
| Custom Emojis | 128x128 (<256KB) | Generate via nano-banana, resize with sips |

Generate with `/nano-banana` skill using JSON-structured prompts. Resize with:
```bash
sips -z 128 128 source.png --out discord/emoji.png    # emoji
sips -z 576 1024 source.png --out discord/cover.png   # cover
sips -z 1024 1024 source.png --out discord/large.png  # large
```

### Phase 12: Reverse Proxy (HTTPS)

On Caddy (CT 205, 10.71.20.55):
```
skippy.rodaddy.live {
    reverse_proxy INSTANCE_IP:18789
}
```

Caddy handles WebSocket upgrade automatically -- no extra config needed.

Add to allowed origins:
```bash
openclaw config set gateway.controlUi.allowedOrigins '["http://localhost:18789","https://YOUR-SUBDOMAIN.rodaddy.live"]'
```

DNS on Pi-hole: point subdomain to 10.71.20.55 (the proxy, NOT the instance).

---

## LAUNCHD PLIST TEMPLATE (FIXED)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.openclaw.gateway</string>
    <key>Comment</key>
    <string>OpenClaw Gateway -- fixed token passthrough</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/opt/node@24/bin/node</string>
      <string>/opt/homebrew/lib/node_modules/openclaw/dist/index.js</string>
      <string>gateway</string>
      <string>run</string>
      <string>--token</string>
      <string>YOUR_TOKEN_HERE</string>
      <string>--port</string>
      <string>18789</string>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/USER/.openclaw/logs/gateway.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/USER/.openclaw/logs/gateway.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>/Users/USER</string>
      <key>PATH</key>
      <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
      <key>OPENCLAW_GATEWAY_TOKEN</key>
      <string>YOUR_TOKEN_HERE</string>
      <key>OPENCLAW_GATEWAY_PORT</key>
      <string>18789</string>
      <key>OPENCLAW_SERVICE_MARKER</key>
      <string>openclaw</string>
      <key>OPENCLAW_SERVICE_KIND</key>
      <string>gateway</string>
    </dict>
  </dict>
</plist>
```

For LXC (systemd), adapt to a `.service` unit with `Environment=OPENCLAW_GATEWAY_TOKEN=...`.

---

## LXC DEPLOYMENT NOTES (for King-NG instances)

When deploying in LXC containers:
- Use systemd instead of launchd (same `--token` fix applies, different service file format)
- Node.js path: `/usr/bin/node` or `/usr/local/bin/node` (not `/opt/homebrew/`)
- Each instance gets its own:
  - Gateway token
  - LiteLLM restricted API key (scoped to openclaw/* models)
  - SOUL.md persona
  - Discord bot (separate bots per PA)
  - Caddy entry + DNS
- Port allocation: 18789 (default), or offset per instance
- Bind to 0.0.0.0 for LXC (no loopback issues)

### Planned King-NG Instances

| Instance | CT | IP | Port | Persona | Discord |
|----------|----|----|------|---------|---------|
| Rico PA | 310 | TBD | 18789 | Skippy (Rico) | #claw-rico |
| Kevin PA | 311 | TBD | 18789 | TBD (Kevin) | #claw-kevin |
| Strategy Finder | 312 | TBD | 18789 | Analyst | #strategy-desk |

---

## CHECKLIST FOR EACH NEW INSTANCE

### Core Setup
- [ ] Install OpenClaw (`npm install -g openclaw@latest`)
- [ ] Generate gateway token (`openssl rand -hex 24`)
- [ ] Run interactive onboard
- [ ] Fix daemon plist/service (add `--token` flag)
- [ ] Set `gateway.remote.token` to match `gateway.auth.token`

### Models & Auth
- [ ] Create LiteLLM restricted API key (scoped to openclaw/* models)
- [ ] Configure LiteLLM provider in openclaw.json
- [ ] Verify models respond: test each alias

### Workspace
- [ ] Copy SOUL.md (persona) to workspace
- [ ] Populate TOOLS.md (instance-specific: IPs, models, channels, preferences)
- [ ] Populate USER.md (user info for this instance)
- [ ] Create MEMORY.md (OB-backed memory instructions)
- [ ] Install mcp2cli at ~/.local/bin/mcp2cli
- [ ] Create mcp-bridge workspace skill
- [ ] Install PAI skills to ~/.config/pai/Skills/
- [ ] Fix any broken symlinks in PAI skills (check for /Volumes/ThunderBolt refs)
- [ ] Run initial skills rsync to workspace
- [ ] Install launchd/systemd auto-sync for skills
- [ ] Verify skills load (check gateway.err.log for "Skipping skill path" errors)

### Channels
- [ ] Configure Discord (bot token, channel routing)
- [ ] Upload Discord assets (cover, large image, emojis)
- [ ] Configure Telegram if needed
- [ ] Configure iMessage if macOS (needs BlueBubbles for sender identity)
- [ ] Approve all channel pairings

### Network
- [ ] Add Caddy reverse proxy entry + Ansible template
- [ ] Add DNS entry on Pi-hole + Ansible playbook
- [ ] Add allowed origins for HTTPS domain
- [ ] Restart gateway after config changes

### Verify
- [ ] `openclaw health` returns ok
- [ ] All channels green (send test message on each)
- [ ] mcp2cli commands work from the instance
- [ ] Skills load without sandbox errors
- [ ] OB memory read/write works
- [ ] Security audit: `openclaw security audit --deep`

## GOTCHAS DISCOVERED 2026-03-17 (Evening Session)

### 8. Workspace Skill Sandbox Blocks Symlinks

**Bug:** OpenClaw's skill loader rejects symlinks that resolve outside `~/.openclaw/workspace/skills/`. Error log: "Skipping skill path that resolves outside its configured root."

**Impact:** Symlinks from workspace to `~/.config/pai/Skills/` don't work. All skills silently fail to load.

**Fix:** Use rsync to copy real files into the workspace. Set up launchd WatchPaths to auto-sync. See Phase 8.

### 9. mcp2cli Not in PATH Over SSH/launchd

**Bug:** `~/.local/bin` is not in PATH when commands run via SSH or launchd. `which mcp2cli` returns nothing.

**Fix:** Always use full path `~/.local/bin/mcp2cli` in skills and scripts. Or export PATH in the launchd plist EnvironmentVariables (include `~/.local/bin`).

### 10. Skill Name Mismatch (skippy-dev vs skippy)

**Bug:** The `skippy` skill directory contained `name: skippy-dev` in SKILL.md frontmatter. OpenClaw (and Claude Code) couldn't match the skill by name.

**Fix:** Ensure SKILL.md frontmatter `name:` matches the directory name. After renaming in skippy-agentspace source, the change must propagate to all copies (PAI Skills on each machine). Real copies don't auto-update -- rsync or manual fix required.
