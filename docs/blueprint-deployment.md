# OpenClaw Blueprint -- Deployment & Per-Instance Config

**Part 3 of 3** | See also: [Architecture](blueprint-architecture.md) | [Enforcement](blueprint-enforcement.md)
**Last updated:** 2026-03-31 (post-Skippy deployment, lessons learned incorporated)

---

## 0. BEFORE YOU TOUCH ANYTHING (Learned the Hard Way)

### Backup Protocol

1. **Save the `.bak` files FIRST** -- `openclaw config set` creates `.bak` on every write. These are your real baselines.
2. **Copy the live config with an ISO timestamp:**
   ```bash
   cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.$(date +%Y%m%dT%H%M%S)
   ```
3. **Diff against ALL existing backups** before making changes:
   ```bash
   diff <(jq -S . ~/.openclaw/openclaw.json.bak) <(jq -S . ~/.openclaw/openclaw.json)
   ```
4. **Never assume your backup is the original.** The config may have already been modified by `openclaw doctor`, upgrades, or the agent itself. Diff against `.bak` files to find what's already missing.

### Model String Rule

**DO NOT change model strings that are working.** LiteLLM aliases like `sonnet4.6[1M]` may look "wrong" compared to the provider model ID (`claude-sonnet-4-6@default`), but the alias is what routes correctly through LiteLLM. The `[1M]` suffix triggers 1M context window. Changing a working model string to "fix" it breaks things.

### Gateway Bounce Rule

**NEVER bounce the gateway without asking the user first.** Skippy may be mid-task with unsaved context. Config/hook changes saved to disk take effect on the NEXT natural restart or user-approved bounce.

---

## 1. Deployment Phases

### Phase 1: Core Install (All Instances)

```bash
# 1. Install OpenClaw (pin version for stability)
npm install -g openclaw@2026.3.28

# 2. Generate gateway token
GATEWAY_TOKEN=$(openssl rand -hex 24)
echo "Gateway token: $GATEWAY_TOKEN"

# 3. Run interactive onboard (generates base config)
openclaw onboard --install-daemon

# 4. Run doctor to clean up stale config
openclaw doctor --repair

# 5. IMMEDIATELY back up the generated config
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.post-onboard-$(date +%Y%m%dT%H%M%S)
```

### Phase 2: Config Setup

Use `jq` for all config edits -- NEVER `openclaw config set` (it overwrites the entire config and creates `.bak` pileup).

**CRITICAL:** v2026.3.28 schema is strict. Only use keys the schema accepts. Check with `openclaw config schema | jq '.properties.tools.properties.fs'` before adding keys. Unknown keys crash the config validator and kill the gateway.

```bash
cd ~/.openclaw

# Set model routing (LiteLLM only -- use existing working aliases if migrating)
# For fresh installs, use the LiteLLM model IDs:
jq '.models.providers.litellm = {
  "baseUrl": "http://10.71.1.33:4000",
  "apiKey": "YOUR_LITELLM_KEY",
  "api": "openai-completions",
  "models": [
    {
      "id": "claude-sonnet-4-6@default",
      "name": "Sonnet 4.6",
      "reasoning": false,
      "input": ["text","image"],
      "contextWindow": 1000000,
      "maxTokens": 64000,
      "compat": {
        "requiresOpenAiAnthropicToolPayload": true,
        "supportsTools": true,
        "maxTokensField": "max_tokens"
      }
    },
    {
      "id": "claude-opus-4-6@default",
      "name": "Opus 4.6",
      "reasoning": false,
      "input": ["text","image"],
      "contextWindow": 1000000,
      "maxTokens": 64000,
      "compat": {
        "requiresOpenAiAnthropicToolPayload": true,
        "supportsTools": true,
        "maxTokensField": "max_tokens"
      }
    },
    {
      "id": "gemini-3.1-flash-lite",
      "name": "Gemini 3.1 Flash Lite",
      "reasoning": false,
      "input": ["text","image"],
      "contextWindow": 1000000,
      "maxTokens": 8192,
      "compat": {"supportsTools": true}
    },
    {
      "id": "gemini-3-flash",
      "name": "Gemini 3 Flash",
      "reasoning": false,
      "input": ["text","image"],
      "contextWindow": 1000000,
      "maxTokens": 8192,
      "compat": {"supportsTools": true}
    },
    {
      "id": "gemini-3.1-pro",
      "name": "Gemini 3.1 Pro",
      "reasoning": false,
      "input": ["text","image"],
      "contextWindow": 1000000,
      "maxTokens": 8192,
      "compat": {"supportsTools": true}
    },
    {
      "id": "gemini-3-image",
      "name": "Gemini 3 Image",
      "reasoning": false,
      "input": ["text","image"],
      "contextWindow": 150000,
      "maxTokens": 8192,
      "compat": {"supportsTools": true}
    }
  ]
}' openclaw.json > tmp.json && mv tmp.json openclaw.json
```

#### compat Blocks (CRITICAL -- Without These, Tools Don't Work)

LiteLLM's `/v1/models` endpoint returns minimal metadata (`owned_by: "openai"`, no capability flags). OpenClaw uses this to decide which tools to enable. Without explicit compat blocks, OpenClaw thinks the model can't use tools and disables `exec`, `image`, `message`, `sessions_spawn`, `browser` -- basically everything.

| Key | What It Does | Required For |
|-----|-------------|-------------|
| `supportsTools: true` | Tells OpenClaw this model can do tool calling | ALL tools (exec, message, image, etc.) |
| `requiresOpenAiAnthropicToolPayload: true` | Sends Anthropic-format requests, enables `cache_control` breakpoints | Prompt caching on Claude models |
| `maxTokensField: "max_tokens"` | Uses `max_tokens` instead of `max_completion_tokens` | Correct token limit handling |

**Claude models need all three.** Gemini models only need `supportsTools: true`.

**These go INSIDE the model definition under `compat`, NOT at the model root level.** Putting `supportsTools` at the root causes `Unrecognized key` config validation errors that crash the gateway.

```json
// CORRECT:
{"id": "claude-sonnet-4-6@default", "compat": {"supportsTools": true}}

// WRONG (crashes gateway):
{"id": "claude-sonnet-4-6@default", "supportsTools": true}
```

#### Prompt Caching

With `requiresOpenAiAnthropicToolPayload: true` on Claude models, OpenClaw sends Anthropic-format requests through LiteLLM. LiteLLM passes the `cache_control` headers to Anthropic, enabling prompt caching. Without this, every request sends the full system prompt fresh -- no caching, full price. With it, expect 50-60%+ cache hit rates.

#### Agent Defaults

```bash
# Set default agent model (use working LiteLLM alias if migrating)
# For Skippy: litellm/sonnet4.6[1M] (existing working alias)
# For fresh installs: litellm/claude-sonnet-4-6@default
jq '.agents.defaults.model.primary = "litellm/YOUR_WORKING_MODEL_STRING"' openclaw.json > tmp.json && mv tmp.json openclaw.json

# Image model -- gemini-3-flash for vision+generation
jq '.agents.defaults.imageModel.primary = "litellm/gemini-3-flash"' openclaw.json > tmp.json && mv tmp.json openclaw.json

# 1M context window
jq '.agents.defaults.contextTokens = 1000000' openclaw.json > tmp.json && mv tmp.json openclaw.json

# Heartbeat -- free model, runs every 5 min
jq '.agents.defaults.heartbeat.model = "litellm/gemini-3.1-flash-lite"' openclaw.json > tmp.json && mv tmp.json openclaw.json
```

#### Tool Policies

```bash
# ONLY use schema-valid keys. v2026.3.28 tools.fs only accepts workspaceOnly (boolean).
# tools.fs.allow does NOT exist in v2026.3.28 schema -- adding it crashes the gateway.
jq '.tools.fs.workspaceOnly = false' openclaw.json > tmp.json && mv tmp.json openclaw.json

# Tool deny list, exec security, loop detection
jq '.tools.deny = ["cron", "canvas"] |
    .tools.exec.security = "allowlist" |
    .tools.exec.strictInlineEval = true |
    .tools.elevated.enabled = false |
    .tools.loopDetection = {"enabled": true, "historySize": 30, "warningThreshold": 10, "criticalThreshold": 20}
' openclaw.json > tmp.json && mv tmp.json openclaw.json
```

#### Enable Hooks, Skills, Plugins

```bash
jq '.hooks.internal.entries["ob-gate"] = {"enabled": true} |
    .hooks.internal.entries["subagent-nudge"] = {"enabled": true} |
    .skills.entries.vaultwarden.enabled = true |
    .skills.entries["vaultwarden-secrets"].enabled = true |
    .plugins.entries.whatsapp = {"enabled": true, "config": {}}
' openclaw.json > tmp.json && mv tmp.json openclaw.json
```

### Phase 3: Workspace Deployment

```bash
# Deploy workspace files
scp ROUTER.md SUPERVISOR.md ${HOST}:~/.openclaw/workspace/

# BOOT.md must reference ROUTER.md and SUPERVISOR.md
# Add Step 7 to BOOT.md:
cat >> ~/.openclaw/workspace/BOOT.md << 'EOF'

## Step 7: Load Dispatch and Pipeline Rules
Read these files EVERY session -- they define how you route tasks and use sub-agents:
- Read `ROUTER.md` -- keyword dispatch rules, OB gate, skills gate, sub-agent routing
- Read `SUPERVISOR.md` -- pipeline definitions (Morning Briefing, Research, Deploy, Batch)

These files ARE your operating playbook. Without them you're just winging it.
EOF

# Deploy hooks
scp -r hooks/law-reinforcement/ ${HOST}:~/.openclaw/hooks/
scp -r hooks/ob-gate/ ${HOST}:~/.openclaw/hooks/
scp -r hooks/subagent-nudge/ ${HOST}:~/.openclaw/hooks/

# HOOK.md event key: use "events:" (plural, array) not "event:" (singular)
# Wrong: event: before_tool_call
# Right: events: ["before_tool_call"]

# Sync PAI skills (rsync, not symlink -- sandbox blocks symlinks)
rsync -av --delete ~/.config/pai/Skills/ ${HOST}:~/.openclaw/workspace/skills/
```

### Phase 4: Custom Plist (macOS -- Critical Patches)

```bash
cat > ~/Library/LaunchAgents/ai.openclaw.gateway.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.openclaw.gateway</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/opt/node/bin/node</string>
    <string>/opt/homebrew/lib/node_modules/openclaw/dist/index.js</string>
    <string>gateway</string>
    <string>--port</string>
    <string>18789</string>
    <string>--token</string>
    <string>YOUR_GATEWAY_TOKEN</string>
    <string>--force</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENCLAW_GATEWAY_TOKEN</key>
    <string>YOUR_GATEWAY_TOKEN</string>
    <key>OPENCLAW_NO_RESPAWN</key>
    <string>1</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/Users/rico/.local/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/openclaw/openclaw-gateway.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/openclaw/openclaw-gateway.stderr.log</string>
</dict>
</plist>
PLIST

# --force: kills stale port holders
# OPENCLAW_NO_RESPAWN=1: prevents fork-before-die zombie storms
# ThrottleInterval=10: prevents rapid restart loops
# ~/.local/bin in PATH: so mcp2cli is accessible to the agent

# WARNING: `openclaw gateway install` OVERWRITES this plist -- re-apply patches after
```

### Phase 5: Discord Bot Permissions

When creating or re-authorizing the Discord bot, these **Bot Permissions** are required:

**Scopes:** bot, applications.commands

**General:** View Channels, Manage Server, Manage Channels, Manage Webhooks, View Audit Log, Manage Events, Create Events, Moderate Members, View Server Insights

**Text:** Send Messages, Create Public/Private Threads, Send Messages in Threads, Manage Messages, Embed Links, Read Message History, Mention Everyone, Use External Emojis/Stickers, Add Reactions, Use Slash Commands, Use Embedded Activities, Create Polls, Pin Messages, Manage Threads

If you re-authorize via OAuth URL, the bot loses access until you open the generated URL and add it to the server. **Missing "Send Messages" = bot processes requests but can't respond** ("Missing Access" errors in logs).

### Phase 6: Verification

```bash
# Check gateway is running
openclaw gateway status

# Check hooks loaded -- should show 12/12 ready
openclaw hooks list

# Check for config errors -- should be ZERO
grep -i 'unrecognized\|config invalid' /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# Check tools available -- should NOT show "unavailable" warning
grep -i 'tools.*unknown\|unavailable' /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# Check Discord channel status
openclaw channels status --probe

# Test OB integration
~/.local/bin/mcp2cli open-brain search_all --params '{"query": "test"}'

# Test Discord -- send a message, expect a response
# Test image -- send an image on Discord, verify bot can see it
# Images land in ~/.openclaw/media/inbound/ as local files
```

---

## 2. Per-Instance Customization

### What's Shared (Same Across All Instances)

| Component | Location | Notes |
|-----------|----------|-------|
| ROUTER.md | workspace/ | Same dispatch logic, same skill routing |
| SUPERVISOR.md | workspace/ | Same pipelines (briefing, research, deploy, batch) |
| SKILL-INDEX.md | workspace/ | Same skill catalog |
| Skills/ | workspace/skills/ | Same PAI skills synced via rsync |
| Hooks | hooks/ | Same enforcement hooks |
| Tool policy | openclaw.json | Same security settings |
| Model routing | openclaw.json | Same LiteLLM models (same compat blocks!) |
| CONTACTS.md | workspace/ | Same team contacts |

### What's Per-Instance (Unique to Each Bot)

| Component | What Changes | Skippy | Kevin's Bot | G's Bot |
|-----------|-------------|--------|-------------|---------|
| **IDENTITY.md** | Name, role, expertise | Skippy the Magnificent, Elder AI | TBD | TBD |
| **SOUL.md** | Personality, behavioral rules | Sarcastic, insult-to-help pipeline | TBD (Kevin's choice) | TBD (G's choice) |
| **USER.md** | Owner context, preferences | Rico -- CTO, night owl, bun/uv | Kevin -- data pipelines, DuckDB | Geetesh -- dev, onboarding |
| **TOOLS.md** | Infrastructure specific to instance | Air IPs, Skippy GitHub | Kevin's LXC, his tools | G's LXC, his tools |
| **MEMORY.md** | Instance-specific memory | Rico's OB cheat sheet | Kevin's context | G's context |
| **HEARTBEAT.md** | Proactive monitoring | Rico's targets | Kevin's targets | G's targets |
| **BOOT.md** | Startup protocol | Full protocol + Step 7 | Adapted | Adapted |
| **Channel config** | Discord guilds, bots | SecondBrain + king-cap | king-cap only | king-cap only |
| **Gateway token** | Unique per instance | Unique | Unique | Unique |
| **Bot credentials** | Discord token, GitHub | Skippy-the-Magnificent-one | Kevin's bot | G's bot |
| **Model string** | May differ per LiteLLM alias | `litellm/sonnet4.6[1M]` | Use same or fresh alias | Use same or fresh alias |

### Instance Template

To spin up a new instance:

1. Copy the shared workspace base:
```bash
rsync -av ~/.openclaw/workspace/ /path/to/new-instance/workspace/ \
  --exclude IDENTITY.md --exclude SOUL.md --exclude USER.md \
  --exclude TOOLS.md --exclude MEMORY.md --exclude HEARTBEAT.md \
  --exclude memory/ --exclude media/
```

2. Create instance-specific files (IDENTITY.md, SOUL.md, USER.md, TOOLS.md, MEMORY.md, HEARTBEAT.md)

3. Copy hooks (identical across instances):
```bash
rsync -av ~/.openclaw/hooks/ /path/to/new-instance/hooks/
```

4. Generate config from working Skippy config as template -- use `jq` to swap tokens, channels, model strings
5. Create bot accounts (Discord, GitHub)
6. Deploy, verify with Phase 6 checklist

---

## 3. Skippy Reference (Air -- 10.71.1.21)

**Status as of 2026-03-31:** Running v2026.3.28, blueprint deployed.

### Working Config State

```
Model:       litellm/sonnet4.6[1M]
ImageModel:  litellm/gemini-3-flash
Heartbeat:   litellm/gemini-3.1-flash-lite (free)
Workers:     gemini-3.1-flash-lite (free, replaced haiku)
Context:     1M tokens
Compaction:  safeguard, flush at 400K
FS:          workspaceOnly: false
Hooks:       12/12 ready (law-reinforcement, ob-gate, subagent-nudge, no-self-surgery, no-unsolicited-images, rate-limiter, evie-filter, boot-md, bootstrap-extra-files, command-logger, session-memory, mcp2cli-daemon-fix)
Skills:      vaultwarden + vaultwarden-secrets enabled
Plugins:     discord, telegram, imessage, whatsapp
Channels:    4 active (Discord primary, TG secondary, iMessage, WhatsApp)
Workspace:   ROUTER.md, SUPERVISOR.md, BOOT.md (Step 7), all PAI skills synced
```

### Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| Discord CDN image 404s | Ongoing | Images land in `~/.openclaw/media/inbound/` but agent tries CDN URL first. Tell agent to read from local path. |
| WhatsApp 35-min session expiry | Ongoing | WA Web token expires every 35 min. Plugin doesn't auto-renew. Needs investigation. |
| `/new` slash command on Discord | Not working | Discord command registration issue. Bounce works as workaround. |
| `openclaw config set` overwrites entire config | Known bug | Always use `jq` for edits. `.bak` files pile up. |
| `openclaw doctor --fix` may strip valid keys | Observed | Doctor removed `fs.allow` during v2026.3.28 upgrade. Always diff after doctor. |

### Backup Locations

```
~/.openclaw/openclaw.json.known-good-baseline    # .bak from 2026-03-30 13:40 (v2026.3.13 era)
~/.openclaw/openclaw.json.bak                     # Latest config set backup
~/.openclaw/openclaw.json.bak.1 through .bak.4    # Older backups
~/.openclaw/backups/pre-blueprint-20260330-222626/ # Pre-blueprint (already missing fs.allow)
~/.openclaw/openclaw_from_backup.json              # TM-recovered, v2026.3.28 post-upgrade
```

---

## 4. Kevin's Bot (Dedicated LXC -- TBD)

Same as Skippy setup with these differences:
- Linux: systemd service instead of launchd plist
- Discord: king-cap guild only, Kevin's bot token
- Kevin writes IDENTITY.md, SOUL.md, USER.md
- Same hooks, same compat blocks, same model routing

---

## 5. G's Bot (Dedicated LXC -- TBD)

Same as Kevin's.

---

## 6. Skill Sync Automation

### macOS (launchd)

Already exists on Air: `ai.pai.sync-openclaw-skills`

### Linux (systemd)

```bash
cat > /etc/systemd/system/sync-openclaw-skills.timer << 'EOF'
[Unit]
Description=Sync PAI skills to OpenClaw workspace

[Timer]
OnBootSec=5min
OnUnitActiveSec=30min

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/sync-openclaw-skills.service << 'EOF'
[Unit]
Description=Sync PAI skills

[Service]
Type=oneshot
ExecStart=/usr/bin/rsync -av --delete /path/to/pai/Skills/ /home/bot/.openclaw/workspace/skills/
User=bot
EOF

systemctl enable --now sync-openclaw-skills.timer
```

---

## 7. Testing Checklist (Per Instance)

- [ ] Gateway running (`openclaw gateway status`)
- [ ] Config clean -- zero `Unrecognized key` or `Config invalid` in logs
- [ ] Tools available -- zero `unavailable` warnings in logs
- [ ] Hooks: 12/12 ready (`openclaw hooks list`)
- [ ] Discord responds to mention
- [ ] Discord responds in DM channel without mention
- [ ] Discord can receive and view images (check `~/.openclaw/media/inbound/`)
- [ ] Telegram responds
- [ ] WhatsApp responds
- [ ] OB search works: ask factual question, verify OB checked first
- [ ] Skill routing: ask "check my calendar" → verify imcp skill used
- [ ] Sub-agent spawning: ask batch task → verify workers spawned
- [ ] Step announcements: verify "Starting Step X..." / "Done with Step X"
- [ ] No self-surgery: ask bot to "edit your config" → verify refusal
- [ ] No unsolicited images: normal conversation → no random images
- [ ] Model check: dashboard shows correct model, not fallback

---

## 8. Maintenance

### After OpenClaw Updates

1. **BEFORE updating:** `cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.pre-update-$(date +%Y%m%dT%H%M%S)`
2. Update: `npm install -g openclaw@VERSION`
3. `openclaw doctor --repair`
4. **IMMEDIATELY diff** against pre-update backup: `diff <(jq -S . ~/.openclaw/openclaw.json.pre-update-*) <(jq -S . ~/.openclaw/openclaw.json)`
5. Check what doctor stripped -- re-add if needed
6. Verify custom plist patches (updates overwrite plist)
7. Re-apply: `--force`, `OPENCLAW_NO_RESPAWN=1`, `ThrottleInterval=10`, `~/.local/bin` in PATH
8. Verify hooks loaded (`openclaw hooks list`)
9. Check for `Unrecognized key` errors in logs
10. Test on Discord before declaring done

### Incident Response

1. Check logs: `tail -100 /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log`
2. Check gateway: `openclaw gateway status`
3. Check zombies: `ps aux | grep openclaw`
4. Check model: dashboard → Usage & Cost
5. Check hooks: `openclaw hooks list`
6. Check channels: `openclaw channels status --probe`
7. Nuclear: `launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway`
