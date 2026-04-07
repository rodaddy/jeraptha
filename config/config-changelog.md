# OpenClaw Config Changelog

Tracks config changes, what was wrong before, why it was changed, and what broke.
Check this BEFORE changing config to see if something was already tried and reverted.

---

## 2026-04-05: Heartbeat read() loop fix (Rico + Skippy from CC)

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
