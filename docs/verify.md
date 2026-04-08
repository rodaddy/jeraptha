# OpenClaw + Jeraptha Verification Runbook

Copy-paste checklist for a Claude Code session to validate a deployment is healthy.
Sections 1-5 (critical checks) are here. Sections 6-10 are in `verify-part2.md`.

For a one-shot pass/fail, run `verify-quick.sh` instead.

## Setup

```bash
# Set this if SSH'ing in. Leave blank for local execution.
OC_HOST="rico@10.71.1.21"

# Helper -- prefix commands with r() to work both locally and remotely.
r() { if [[ -n "${OC_HOST:-}" ]]; then ssh -o ConnectTimeout=10 "$OC_HOST" "$@"; else eval "$@"; fi; }
```

---

## 1. Gateway Health (Critical)

### 1.1 Gateway process running

**Command:**
```bash
r "ps aux | grep '[o]penclaw' | grep -v grep | head -5"
```

**Expected:** At least one `openclaw` process.

**If failing:**
- Check plist: `r "launchctl list | grep openclaw"`
- Start: `r "launchctl kickstart gui/\$(id -u)/ai.openclaw.gateway"`
- Logs: `r "tail -30 /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log"`

### 1.2 Listening on port 18789

**Command:**
```bash
r "lsof -iTCP:18789 -sTCP:LISTEN -P | head -5"
```

**Expected:** A process listening on `*:18789`.

**If failing:**
- Gateway crashed. Check 1.1.
- Port conflict: `r "lsof -iTCP:18789 -P"`
- Restart: `r "launchctl kickstart -k gui/\$(id -u)/ai.openclaw.gateway"`

### 1.3 Gateway status

**Command:**
```bash
r "openclaw gateway status"
```

**Expected:** `running` or `ok`.

**If failing:**
- `openclaw` not in PATH: check install dir
- Status error: check gateway logs

### 1.4 Dashboard HTTP

**Command:**
```bash
r 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/'
```

**Expected:** `200`

**If failing:**
- `000` = not listening (see 1.2). `500` = startup crash -- check logs.

---

## 2. Jeraptha Plugin (Critical)

### 2.1 Plugin files installed

**Command:**
```bash
r "test -f ~/.openclaw/extensions/jeraptha/index.js && test -f ~/.openclaw/extensions/jeraptha/openclaw.plugin.json && echo OK || echo MISSING"
```

**Expected:** `OK`

**If failing:**
- `ssh $OC_HOST "mkdir -p ~/.openclaw/extensions/jeraptha"`
- `scp /Volumes/ThunderBolt/Development/jeraptha/plugin/{index.js,openclaw.plugin.json} $OC_HOST:~/.openclaw/extensions/jeraptha/`
- Restart gateway

### 2.2 Plugin enabled in config

**Command:**
```bash
r "jq '.plugins.entries.jeraptha' ~/.openclaw/openclaw.json"
```

**Expected:** JSON with `"enabled": true`.

**If failing:**
- `r "openclaw plugins enable jeraptha"` then restart gateway

### 2.3 Plugin registered in logs

**Command:**
```bash
r "grep '\[jeraptha\] registered' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log | tail -1"
```

**Expected:** `[jeraptha] registered: 4 before_tool_call + 3 before_prompt_build + 1 message_received`

**If failing:**
- Check JS syntax: `r "node -c ~/.openclaw/extensions/jeraptha/index.js 2>&1 || true"`
- Check errors: `r "grep -i 'jeraptha\|plugin.*error' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log | tail -20"`

### 2.4 Hook count correct

**Command:**
```bash
r "grep '\[jeraptha\] registered' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log | tail -1 | grep -o '[0-9] before_tool_call.*message_received'"
```

**Expected:** `4 before_tool_call + 3 before_prompt_build + 1 message_received`

**If failing:** index.js on Air is stale. Redeploy from source.

### 2.5 No stale pai-hooks

**Command:**
```bash
r "ls ~/.openclaw/extensions/ | grep -v _disabled"
```

**Expected:** Shows `jeraptha`. Should NOT show `pai-hooks` (old name).

**If failing:**
- `r "mv ~/.openclaw/extensions/pai-hooks ~/.openclaw/extensions/pai-hooks_disabled"`
- Remove from config (backup first, follow SOP)

---

## 3. Workspace Files

### 3.1 Required files

**Command:**
```bash
r 'for f in TASKS.md SCORECARD.md HEARTBEAT.md AGENTS.md SOUL.md; do
  test -f ~/.openclaw/workspace/$f && echo "OK  $f" || echo "MISSING $f"
done'
```

**Expected:** All `OK`.

**If failing:**
- Copy templates from `jeraptha/workspace/`, remove `.template` suffix
- `AGENTS.md` and `HEARTBEAT.md` are non-template -- copy as-is

### 3.2 Optional files

**Command:**
```bash
r 'for f in SKILL-INDEX.md ROUTER.md SUPERVISOR.md IDENTITY.md; do
  test -f ~/.openclaw/workspace/$f && echo "OK  $f" || echo "MISSING $f"
done'
```

**Expected:** All `OK` for a full deployment. Missing is non-critical.

### 3.3 TASKS.md structure

**Command:**
```bash
r "grep -c '## .*Active' ~/.openclaw/workspace/TASKS.md"
```

**Expected:** `1`

**If failing:** TASKS.md malformed. Restore from template.

### 3.4 SCORECARD.md structure

**Command:**
```bash
r "grep 'Current Score:' ~/.openclaw/workspace/SCORECARD.md"
```

**Expected:** `Current Score: <integer>`

**If failing:** Sentiment tracker writes here. Restore from template, set score to 0.

---

## 4. Config Validation (Critical)

### 4.1 Context tokens

**Command:**
```bash
r "jq '.agents.defaults.contextTokens' ~/.openclaw/openclaw.json"
```

**Expected:** `1000000`

**If failing:** OC defaults to 200K without this. Backup, then set via `openclaw config set`.

### 4.2 Compaction reserve

**Command:**
```bash
r "jq '.agents.defaults.compaction.reserveTokens // .compaction.reserveTokens' ~/.openclaw/openclaw.json"
```

**Expected:** `600000`

**If failing:** Controls compaction threshold. Backup, then set.

### 4.3 Heartbeat lightContext

**Command:**
```bash
r "jq '.agents.defaults.heartbeat.lightContext' ~/.openclaw/openclaw.json"
```

**Expected:** `false`

**If failing:** CRITICAL -- `true` caused 3+ hour gateway freeze. Fix immediately. See `lessons-learned.md`.

### 4.4 Heartbeat suppressToolErrorWarnings

**Command:**
```bash
r "jq '.agents.defaults.heartbeat.suppressToolErrorWarnings' ~/.openclaw/openclaw.json"
```

**Expected:** `false`

**If failing:** When true, heartbeat retries broken calls forever. Set to false.

### 4.5 Thinking default

**Command:**
```bash
r "jq '.agents.defaults.thinkingDefault' ~/.openclaw/openclaw.json"
```

**Expected:** `"high"`

**If failing:** Not critical. Improves reasoning quality.

### 4.6 Exec security

**Command:**
```bash
r "jq '{security: .tools.exec.security, ask: .tools.exec.ask}' ~/.openclaw/openclaw.json"
```

**Expected:** `{ "security": "full", "ask": "off" }`

**If failing:** `full` + `off` = YOLO mode. Intentional for PAI. Confirm with Rico for shared instances.

### 4.7 Access groups

**Command:**
```bash
r "jq '.commands.useAccessGroups' ~/.openclaw/openclaw.json"
```

**Expected:** `false`

### 4.8 No stale pai-hooks in config

**Command:**
```bash
r "jq '.plugins.entries | keys[]' ~/.openclaw/openclaw.json | grep -i 'pai-hooks' || echo 'CLEAN'"
```

**Expected:** `CLEAN`

**If failing:** Old name in config. Backup, then remove via jq. Plugin should be `jeraptha`.

---

## 5. Plist Health

### 5.1 No-respawn flag

**Command:**
```bash
r "grep OPENCLAW_NO_RESPAWN ~/Library/LaunchAgents/ai.openclaw.gateway.plist || echo 'MISSING'"
```

**Expected:** `OPENCLAW_NO_RESPAWN` with value `1`.

**If failing:**
- `r "/usr/libexec/PlistBuddy -c 'Add :EnvironmentVariables:OPENCLAW_NO_RESPAWN string 1' ~/Library/LaunchAgents/ai.openclaw.gateway.plist"`

### 5.2 Throttle interval

**Command:**
```bash
r "/usr/libexec/PlistBuddy -c 'Print :ThrottleInterval' ~/Library/LaunchAgents/ai.openclaw.gateway.plist 2>/dev/null || echo 'NOT_SET'"
```

**Expected:** >= 10

**If failing:** Prevents crash-restart loops.
- `r "/usr/libexec/PlistBuddy -c 'Add :ThrottleInterval integer 10' ~/Library/LaunchAgents/ai.openclaw.gateway.plist"`

### 5.3 mcp2cli daemon port

**Command:**
```bash
r "grep MCP2CLI_DAEMON_PORT ~/Library/LaunchAgents/ai.openclaw.gateway.plist || echo 'MISSING'"
```

**Expected:** `MCP2CLI_DAEMON_PORT` with value `9501`.

**If failing:** Gateway can't reach mcp2cli daemon. Add to plist env vars.

### 5.4 Log level

**Command:**
```bash
r "grep OPENCLAW_LOG_LEVEL ~/Library/LaunchAgents/ai.openclaw.gateway.plist || echo 'MISSING'"
```

**Expected:** `OPENCLAW_LOG_LEVEL` = `debug`.

**If failing:** Without this, can't verify hook firings.
- `r "/usr/libexec/PlistBuddy -c 'Add :EnvironmentVariables:OPENCLAW_LOG_LEVEL string debug' ~/Library/LaunchAgents/ai.openclaw.gateway.plist"`
- Restart gateway after plist changes.

---

Continue to [verify-part2.md](verify-part2.md) for checks 6-10 (mcp2cli, network, channels, heartbeat, behavioral).
