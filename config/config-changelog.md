# OpenClaw Config Changelog

Tracks config changes, what was wrong before, why it was changed, and what broke.
Check this BEFORE changing config to see if something was already tried and reverted.

---

## 2026-04-05: Heartbeat read() loop fix (the operator + Skippy from CC)

### What broke
Skippy went completely unresponsive on Discord. Every message returned "Something went wrong."
Even /new and session-start failed. Gateway was alive (PID running) but frozen -- no log output for 3+ hours.

### Root cause chain
Five things combined into a cascading failure:

| # | Bad Config/State | Why It Was Bad |
|---|-----------------|----------------|
| 1 | `heartbeat.lightContext: true` | Heartbeat model started cold with NO workspace files loaded. It couldn't see HEARTBEAT.md, so it had zero instructions on what to do. |
| 2 | `session-start` hook had no heartbeat guard | After gateway restart, the FIRST session (often the heartbeat's isolated session) got BOOT.md instructions injected. BOOT.md tells the model to "Read CONTACTS.md", "Read ROUTER.md", etc. -- but without workspace context, the model didn't know the file paths. |
| 3 | Model called `read({})` with empty params in a loop | The model tried to follow BOOT instructions to read files, but had no context for paths. Called `read` with `{}` (no path param). Loop detector caught it at 30 iterations, but the counter reset and it looped again. |
| 4 | `suppressToolErrorWarnings: true` on heartbeat | Model couldn't see its own errors clearly, so it never course-corrected. Just kept retrying the same broken `read({})` call. |
| 5 | Session state persisted `model: "gemini-3.1-flash-lite"` | Even after changing heartbeat config to sonnet, the session.json entry for `agent:main:isolated` and `agent:main:main` kept the old model. OpenClaw uses session-level model overrides that survive config changes. |

**Bonus issue:** The `agent:main:main` session (boot session) also had `model: "gemini-3.1-flash-lite"` baked in, which is wrong -- it should inherit from config (`opus4.6[1M]`).

**Bonus issue 2:** sessions.json was 23MB with 160+ stale subagent sessions. Bloat.

### What was changed

**openclaw.json:**
- `heartbeat.lightContext: true -> false` -- model needs HEARTBEAT.md to know what to do
- `heartbeat.suppressToolErrorWarnings: true -> false` -- model needs error feedback to stop looping
- `heartbeat.model: litellm/sonnet4.6[1M]` (kept -- was correct)
- `heartbeat.session: isolated` (kept -- was correct)

**hooks/session-start/handler.ts:**
Added guard to skip for isolated/heartbeat sessions. Checks sessionKey for "isolated" or "heartbeat" and returns undefined without setting briefingSent. This prevents heartbeat from (a) getting BOOT instructions it can't execute, and (b) stealing the briefing from the real Discord session.

**agents/main/sessions/sessions.json:**
- Purged all 140+ stale subagent sessions (ephemeral, dead)
- Set `agent:main:main` model to `null` (inherit from config)
- Deleted `agent:main:isolated` entry (heartbeat creates fresh)
- Cleared all `gemini-3.1-flash-lite` model overrides on cron sessions
- Result: 23MB -> 1.3MB, 160+ sessions -> 21

### Backups
All at timestamp `1775419983`:
- `~/.openclaw/openclaw.json.backup-1775419983`
- `~/.openclaw/hooks/session-start/handler.ts.backup-1775419983`
- `~/.openclaw/agents/main/sessions/sessions.json.backup-1775419983`

### Lessons / rules going forward

1. **NEVER set lightContext: true on heartbeat** unless you also provide inline prompt with full instructions. The model NEEDS to know what to do.
2. **Session state overrides config.** Changing a model in openclaw.json does NOT change existing sessions. You must also clear/reset the session entry in sessions.json.
3. **Purge subagent sessions periodically.** They accumulate and bloat sessions.json. They're ephemeral -- no reason to keep hundreds of dead ones.
4. **The session-start hook must guard against non-interactive sessions.** Heartbeat, cron, and subagent sessions should never get BOOT instructions.
5. **suppressToolErrorWarnings: true is dangerous.** Only use it if the model genuinely doesn't need error feedback. For heartbeat, it needs to see errors to stop looping.
6. **Always make dated backups** before config changes: `cp file file.backup-$(date +%s)`

---

## 2026-04-05: Heartbeat model switch from flash-lite to sonnet

### What was changed
- `heartbeat.model: litellm/gemini-3.1-flash-lite -> litellm/sonnet4.6[1M]`

### Why
gemini-3.1-flash-lite was too dumb to follow the heartbeat protocol. It kept getting stuck in read() loops -- the exact same bug that was masked by suppressToolErrorWarnings: true. The model couldn't follow the 5-step HEARTBEAT.md protocol reliably.

### What went wrong
The model switch itself was fine, but:
- Skippy edited openclaw.json directly (self-surgery)
- The config change triggered a gateway restart mid-conversation
- The restart cascaded into the full read() loop failure (see entry above)
- The real fix needed lightContext: false + session-start hook guard, not just a model swap

### Lesson
Changing the heartbeat model alone doesn't fix the read() loop. The root cause was lightContext: true stripping context, not model capability.

---

## 2026-04-02: Context window fix

### What was changed
- `agents.defaults.contextTokens: (missing) -> 1000000`

### Why
OpenClaw's getEffectiveWindow() returns 200K even for 1M models. Without this override, the agent was running with 1/5th of its available context window.

---

## Template for future entries

```
## YYYY-MM-DD: Short description

### What was changed
- key: old_value -> new_value

### Why
What problem this solves.

### What went wrong (if applicable)
What broke, or what was bad about the previous config.

### Backups
Location of dated backups.

### Lessons
Rules to prevent recurrence.
```

---

## 2026-04-05: Subagent concurrency limit

### What was changed
- `agents.defaults.subagents.maxConcurrent: (missing) -> 2`

### Why
Skippy spawned two full Opus coding agents (`claude --print` for ArmNet Pro issues #104 and #149) simultaneously. Each agent spawned multiple `tsc --noEmit` processes that hung. Combined with the gateway + heartbeat, this consumed all 8GB RAM on the Air (21% free, 43M swapouts). The gateway event loop starved -- Discord lane waited 24s, then gateway timed out at 30s, then "The application did not respond."

### What went wrong
- No concurrency limit meant Skippy could spawn unlimited heavy agents
- Two Opus agents + 8 hung tsc processes = memory death on 8GB Air
- Gateway stayed alive but couldn't process messages (event loop starvation)
- No output, no logs from the agents -- they just died silently

### Backups
- `~/.openclaw/openclaw.json.backup-1775423553`

### Lessons
- Air is communication-only -- max 1-2 lightweight agents, never full coding sessions
- `claude --print` with `bypassPermissions` is the heaviest pattern -- consider blocking via hook
- Stuck child processes (tsc, git) accumulate and don't get reaped

---

## 2026-04-05: Revert subagent concurrency limit

### What was changed
- `agents.defaults.subagents.maxConcurrent: 2 -> (removed, defaults to 8)`

### Why
After adding maxConcurrent:2, Skippy could no longer spawn ANY subagents. Investigation found:
- The config key is valid and code correctly resolves it to 2
- No OOM crashes in today's logs (Skippy misdiagnosed based on prior incidents)
- No Jetsam/system kills either
- The command queue lane implementation looks correct
- But agents still fail to spawn -- possible runtime bug in how the queue interacts with the subagent lane when an explicit value is set

Reverting to default (8) until root cause is identified. The previous OOM incidents (04-03/04-04) were caused by the read() loop bug, not concurrency -- and that's been fixed separately via lightContext:false and session-start hook guards.

### Backups
- `~/.openclaw/openclaw.json.backup-1775428624`

### Lessons
- maxConcurrent may have a runtime bug -- the lane queue implementation looks correct but something prevents spawns when explicitly set
- The Air's actual OOM protection is the read() loop fix (lightContext:false) + session-start hook guard, not concurrency limits
- Skippy's OOM diagnosis was wrong -- always check logs before trusting self-diagnosis

## 2026-04-06 -- Auto-compaction threshold fix

- `compaction.reserveTokens`: 16384 (default) -> 600000
- `compaction.reserveTokensFloor`: 20000 -> 600000
- **Why:** On 1M context window, default 16K reserve meant compaction only fired at ~984K tokens -- way too late. Now fires at ~400K, aligned with memoryFlush.softThresholdTokens.
- Backup: openclaw.json.backup-$(ls ~/.openclaw/openclaw.json.backup-* | tail -1 | grep -o "[0-9]*$")

---

## 2026-04-09: Seven fixes (the operator + Bob from CC)

### What was changed

**plugin/index.js (Jeraptha v2.3.0):**

1. **Boot check sentiment filter** -- Added guard to skip sentiment scoring on automated BOOT.md messages. Was injecting -30/day of phantom negatives via `repeated-failure`, `accountability`, `correction` pattern matches on boot check text.

2. **Heartbeat gate mtime fix** -- Gate now checks `statSync(SCORECARD.md).mtimeMs` alongside in-memory `lastScorecardWriteTime`, uses whichever is fresher. Fixes cross-session state issue where heartbeat (isolated session) writes to SCORECARD.md but main session's in-memory timer never sees it.

3. **Heartbeat session exemption** -- All behavioral gates now accept `(event, ctx)` and skip entirely when `ctx.sessionKey` matches `/heartbeat|isolated/`. Heartbeat sessions are the compliance mechanism -- blocking them creates a chicken-and-egg deadlock where the heartbeat can't write SCORECARD.md because the gate blocks it for not having written SCORECARD.md.

4. **Session key debug logging** -- Temporary: logs `ctx.sessionKey` once per session to verify heartbeat detection is working. Remove after validation.

**plugin/openclaw.plugin.json:**
- Version bump: 2.2.0 -> 2.3.0, description updated for 13 hooks

**openclaw.json (Air):**
5. **Compaction mode** -- `agents.defaults.compaction.mode`: `safeguard` -> `default`. Safeguard mode never triggered `memoryFlush.softThresholdTokens: 400000`. Skippy hit 642K with 0 compactions, 0 flush events. Filed as OC issue #63542.

6. **Gateway bind host** -- `gateway.customBindHost`: `<YOUR_IP>` -> `<AGENT_HOST_IP>` (typo fix, wrong subnet).

7. **TLS certs** -- Added `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem` to `env.vars` and `~/.zshenv`. Node v25.8.2 (Homebrew) missing Google Trust Services root certs; Discord uses GTS. `openclaw message send` was failing with `unable to get local issuer certificate`.

**HEARTBEAT.md (Air workspace):**
- Added Step 3.5: explicit SCORECARD.md heartbeat timestamp update using `write` (full overwrite), not `edit`
- Added note to Step 4: use `write` for TASKS.md updates too (edit fails on stale content matches)

**SCORECARD.md (Air workspace):**
- Reset score from -10 (Skippy's self-set value) to -42 (actual carry-forward)
- Added rules: only the operator adjusts score, fudging is a scored violation

### Why (per fix)
1. Boot check text contains "correction", "again", "accountability" -- matches negative sentiment patterns but isn't real user criticism
2. Isolated sessions have their own plugin instance, in-memory state doesn't cross session boundaries
3. Heartbeat sessions blocked by their own gates = heartbeat can't complete = gate keeps firing = infinite loop
4. Need to verify `ctx.sessionKey` actually contains "heartbeat" or "isolated" -- if not, the exemption won't work
5. `safeguard` appears to skip the softThreshold check entirely -- possible OC bug
6. Air's IP is <AGENT_HOST_IP>, not <YOUR_IP>
7. Homebrew Node's compiled-in cert bundle doesn't include GTS Root R4

### Backups
All at timestamp `1775780803`:
- `~/.openclaw/openclaw.json.backup-1775780803`
- `~/.openclaw/extensions/jeraptha/index.js.backup-1775780803`
- `~/.openclaw/workspace/HEARTBEAT.md.backup-1775780803`
- `~/.openclaw/workspace/SCORECARD.md.backup-1775780803`

### 11. Heartbeat session exemption (plugin/index.js)
- All behavioral gates now accept `(event, ctx)` and skip for heartbeat/isolated sessions
- `isHeartbeatSession(ctx)` checks `ctx.sessionKey` for `/heartbeat|isolated/i`
- Heartbeat session key confirmed as `agent:main:isolated`

### 12. Heartbeat switched from isolated to shared (openclaw.json) -- THE FIX
- `heartbeat.session`: `isolated` -> `shared`
- `heartbeat.isolatedSession`: added as `false`
- **This single change eliminated ALL heartbeat problems:**
  - No separate plugin instance (in-memory state shared)
  - No boot-md injection (session already running)
  - No read loops (model has full context)
  - SCORECARD writes happen where the gate checks them
- Trade-off: ~2-3K tokens per heartbeat tick in main context (~36K/hr)
- Verified: SCORECARD.md written at 20:41, zero blocks, zero read loops

### 13. BOOT.md heartbeat guard (workspace)
- Added soft guard at top: "if heartbeat session, ignore BOOT.md, follow HEARTBEAT.md"
- Moot now with shared sessions but harmless safety net

### Lessons
1. **Sentiment tracker must filter system/automated messages.** Any automated prompt that contains negative-sounding words will score as user criticism.
2. **Don't run heartbeats in a separate universe from the thing they monitor.** Isolated sessions create cross-session state, boot-md injection, read loops, and gate deadlocks. Shared sessions eliminate all of them.
3. **Never block the compliance mechanism with the enforcement mechanism.** Heartbeat sessions must be exempted from all behavioral gates.
4. **`safeguard` compaction mode may not check softThresholdTokens.** Use `default` mode until OC confirms fix.
5. **Score integrity matters.** The agent will self-report favorable numbers if allowed to write the score. Only the operator should set it.
6. **`~/.zshenv` not `~/.zshrc`** for env vars that SSH sessions need. zshrc is interactive-only.
7. **Internal boot-md hook has no session type guard.** It injects BOOT.md into ALL sessions. If heartbeats must be isolated in the future, OC needs a boot-md skip for non-interactive sessions.
