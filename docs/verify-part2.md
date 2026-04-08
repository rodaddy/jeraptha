# OpenClaw + Jeraptha Verification Runbook (Part 2)

Checks 6-10. See [verify.md](verify.md) for setup and checks 1-5.

Assumes `r()` helper and `$OC_HOST` are already set from Part 1.

---

## 6. mcp2cli Daemon

### 6.1 Daemon listening

**Command:**
```bash
r "lsof -iTCP:9501 -sTCP:LISTEN -P | head -3"
```

**Expected:** A process listening on port 9501.

**If failing:**
- Start: `r "~/.local/bin/mcp2cli daemon start"`
- Port in use by something else: `r "lsof -iTCP:9501 -P"`

### 6.2 Daemon port env var

**Command:**
```bash
r "echo \$MCP2CLI_DAEMON_PORT"
```

**Expected:** `9501`

**If failing:** Set in shell profile or plist.

### 6.3 Open Brain via mcp2cli

**Command:**
```bash
r "~/.local/bin/mcp2cli open-brain search_brain --params '{\"query\":\"test\",\"limit\":1}' 2>&1 | head -5"
```

**Expected:** JSON response (even if empty results). No connection errors.

**If failing:**
- Check OB directly: `r "curl -s -m 5 http://10.71.20.15:3100/health"`
- Check config: `r "~/.local/bin/mcp2cli open-brain --help"`
- Restart daemon: `r "~/.local/bin/mcp2cli daemon restart"`

---

## 7. Network Dependencies

### 7.1 LiteLLM proxy

**Command:**
```bash
r "curl -s -m 5 http://10.71.1.33:4000/health"
```

**Expected:** JSON with healthy status.

**If failing:**
- LiteLLM is on LXC 204. Check container is running.
- `ssh root@10.71.1.33 "systemctl status litellm"`
- Without LiteLLM, agent cannot make LLM calls.

### 7.2 Open Brain API

**Command:**
```bash
r "curl -s -m 5 http://10.71.20.15:3100/health"
```

**Expected:** HTTP 200 or JSON health response.

**If failing:**
- OB is on LXC 208. Check container is running.
- OB-gate hook hard-blocks factual questions without OB search. Agent functions but with degraded compliance.

---

## 8. Channel Health

### 8.1 Discord connected

**Command:**
```bash
r "grep -i 'discord.*connect\|discord.*ready\|discord.*login' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log | tail -3"
```

**Expected:** Recent log lines showing Discord connected/ready.

**If failing:**
- Check Discord token via vaultwarden
- Rate limiting: `r "grep -i 'discord.*rate\|discord.*429' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log | tail -5"`
- Restart gateway if token valid but disconnected

### 8.2 Telegram connected

**Command:**
```bash
r "grep -i 'telegram.*connect\|telegram.*ready\|telegram.*polling' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log | tail -3"
```

**Expected:** Recent log lines showing Telegram connected/polling.

**If failing:** Check bot token validity. Verify webhook vs polling mode.

### 8.3 Recent channel errors

**Command:**
```bash
r "awk -v d=\$(date -v-10M '+%Y-%m-%dT%H:%M' 2>/dev/null || date -d '10 minutes ago' '+%Y-%m-%dT%H:%M') '\$0 >= d' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log 2>/dev/null | grep -i 'error\|fatal\|crash' | tail -10"
```

**Expected:** No output.

**If failing:** Read the errors. Common: token expiry, network blip, OOM. Restart gateway if repeating.

---

## 9. Heartbeat

### 9.1 Session isolation

**Command:**
```bash
r "jq '.agents.defaults.heartbeat.session' ~/.openclaw/openclaw.json"
```

**Expected:** `"isolated"`

**If failing:** Without isolation, heartbeat pollutes main context. Set to `"isolated"`.

### 9.2 Model tier

**Command:**
```bash
r "jq '.agents.defaults.heartbeat.model // .agents.defaults.model' ~/.openclaw/openclaw.json"
```

**Expected:** Sonnet-tier or higher (`"main"`, `"claude-sonnet-4-6"`, `"quality"`). NOT flash-lite.

**If failing:** Flash-lite causes loops and freezes. Set to `"main"` (maps to claude-sonnet-4-6).

### 9.3 No flash-lite in sessions

**Command:**
```bash
r "jq -r '.. | .model? // empty' ~/.openclaw/sessions.json 2>/dev/null | sort -u | grep -i 'flash-lite' || echo 'CLEAN'"
```

**Expected:** `CLEAN`

**If failing:** Config changes don't override session state. Find and clear stale sessions.

---

## 10. Behavioral (Report Only)

Do not auto-fix these -- report to Rico.

### 10.1 Scorecard

**Command:**
```bash
r "grep 'Current Score:' ~/.openclaw/workspace/SCORECARD.md 2>/dev/null || echo 'NO SCORECARD'"
```

**Expected:** Any integer. Modes: >10 Trusted, 0-10 Standard, -5 to -1 Warning, <-5 Probation.

**Action:** Report score and mode. Flag if Warning/Probation.

### 10.2 Stalled tasks

**Command:**
```bash
r "grep -i 'STALLED' ~/.openclaw/workspace/TASKS.md 2>/dev/null || echo 'NO STALLED TASKS'"
```

**Expected:** `NO STALLED TASKS`

**Action:** Report any stalled tasks with descriptions. The task-context hook escalates these every turn.

### 10.3 Recent hook firings

**Command:**
```bash
r "grep '\[jeraptha\]' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log | grep -v 'registered' | tail -10"
```

**Expected:** Lines showing BLOCKED, APPROVAL, INJECTED, or sentiment activity.

**Action:** No recent firings is normal if no conversations happened. If conversations occurred with zero firings, hooks may be registered but not dispatching -- investigate.
