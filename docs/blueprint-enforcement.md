# OpenClaw Blueprint -- Enforcement & Hooks

**Part 2 of 3** | See also: [Architecture](blueprint-architecture.md) | [Deployment](blueprint-deployment.md)

---

## 1. The Enforcement Problem

System prompt instructions (SOUL.md, BOOT.md, AGENTS.md) work for the first few messages. Then the "Lost in the Middle" effect kicks in -- as context grows, instructions in the middle of the window lose attention. The agent literally forgets its rules.

**Three-layer enforcement model:**

| Layer | Type | Bypassable? | Strength | When It Fires |
|-------|------|-------------|----------|---------------|
| Tool Policy | `tools.deny`, `tools.exec` | No | Mechanical (hard stop) | Every tool call |
| Hooks (`before_tool_call`, `before_prompt_build`) | Pattern match + inject/block | Very hard to bypass | Strong | Every N turns or every tool call |
| System Prompt (SOUL.md, BOOT.md) | Behavioral instructions | Yes (degrades over time) | Weakening | Session start only |

**Rule: Anything that MUST be enforced goes in hooks or tool policy, not just prompts.**

---

## 2. Hook Architecture

Hooks are TypeScript files at `~/.openclaw/hooks/<name>/handler.ts` with a companion `HOOK.md`.

### Hook Events

| Event | When It Fires | Use For |
|-------|---------------|---------|
| `before_prompt_build` | Before every Nth prompt is composed | Re-injecting rules, adding context |
| `before_tool_call` | Before any tool is executed | Blocking dangerous actions, nudging behavior |
| `message_sending` | Before a message is sent to a channel | Filtering, rate limiting, canceling |

### Hook File Structure

```
~/.openclaw/hooks/
├── law-reinforcement/
│   ├── handler.ts       # before_prompt_build -- re-inject rules every 5 turns
│   └── HOOK.md          # Description and metadata
├── ob-gate/
│   ├── handler.ts       # before_tool_call -- nudge OB check before asking user questions
│   └── HOOK.md
├── no-self-surgery/
│   ├── handler.ts       # before_tool_call -- block config edits, gateway restarts
│   └── HOOK.md
├── no-unsolicited-images/
│   ├── handler.ts       # before_tool_call -- block image sends unless user asked
│   └── HOOK.md
├── rate-limiter/
│   ├── handler.ts       # before_tool_call -- per-tool-per-minute caps
│   └── HOOK.md
└── evie-filter/
    ├── handler.ts       # Custom filter for Evie's agent
    └── HOOK.md
```

---

## 3. Hook Implementations

### 3.1 law-reinforcement (UPDATED)

**Event:** `before_prompt_build`
**Purpose:** Re-inject critical rules every 5 turns to prevent prompt degradation.

**Rules enforced (the ones that keep getting violated):**

| # | Rule | Why It's Here |
|---|------|---------------|
| 1 | OB FIRST -- search Open Brain before asking user ANY factual question | Agent keeps asking the user things stored in OB |
| 2 | SKILLS FIRST -- check SKILL-INDEX.md before doing anything manually | Agent does tasks manually when skills exist |
| 3 | SUB-AGENTS -- spawn workers for batch/parallel/research tasks | Agent processes everything sequentially in main context |
| 4 | PIPELINES -- follow SUPERVISOR.md for multi-step workflows | Agent wings complex workflows instead of following defined pipelines |
| 5-13 | Behavioral rules (no images, no self-surgery, concise, etc.) | Standard behavioral guardrails |

**Code:** See `workspace-staging/hooks/law-reinforcement/handler.ts`

The re-injection happens every 5 turns via the `before_prompt_build` event. The rules block is appended to the existing prompt, keeping it in the model's recent attention window.

### 3.2 ob-gate (NEW)

**Event:** `before_tool_call`
**Purpose:** Detect when agent is about to ask the user a factual question and nudge it to check OB first.

**How it works:**
1. Tracks whether `mcp2cli open-brain` or `memory_search` was called in the current turn
2. When a `message` tool call is detected with question-pattern text ("what's the IP for...", "where is...", "do you know...")
3. If OB wasn't queried first → injects a nudge into the prompt: "Did you check OB first?"
4. Not a hard block -- a strong nudge. Agent can still send but the friction makes it much harder to skip

**Question patterns detected:**
- "what's the (ip|port|version|password|url|path|config)"
- "where (is|are|can I find)"
- "do you (know|have|remember)"
- "can you (tell me|remind me)"
- "what (was|were|did)"
- "how (do|does|did)"

**Code:** See `workspace-staging/hooks/ob-gate/handler.ts`

### 3.3 no-self-surgery (EXISTING)

**Event:** `before_tool_call`
**Purpose:** Block the agent from modifying its own config, restarting the gateway, or editing bootstrap files.

**Blocks:**
- `exec` calls containing: `openclaw config`, `openclaw gateway restart`, `launchctl`, editing `openclaw.json`
- `write`/`edit` calls to: `BOOT.md`, `SOUL.md`, `AGENTS.md`, `openclaw.json`
- Any command that would restart the gateway process

**Why:** Gateway restart = WebSocket drop = context loss = user sees "application did not respond." The agent cannot perform surgery on itself while it IS the patient.

### 3.4 no-unsolicited-images (EXISTING)

**Event:** `before_tool_call`
**Purpose:** Block image/media sends unless the user explicitly asked with words like "show me", "picture", "image", "draw."

**Why:** Unsolicited images are annoying, expensive (gemini-3-image), and waste bandwidth on mobile.

### 3.5 rate-limiter (EXISTING)

**Event:** `before_tool_call`
**Purpose:** Cap tool calls per minute to prevent runaway API costs.

**Thresholds:**
- `exec`: 10/minute
- `web_search`: 5/minute
- `web_fetch`: 5/minute
- `message`: 20/minute
- `image`: 2/minute

**Why:** A runaway loop can burn hundreds of dollars in API credits over a weekend (Video 2 warning).

### 3.6 subagent-nudge (NEW -- RECOMMENDED)

**Event:** `before_tool_call`
**Purpose:** When the agent is about to process a long sequential task, nudge it to consider spawning workers.

**Detection patterns:**
- `exec` tool called 3+ times in a row with similar commands (batch processing without parallelism)
- Processing a list/array with 3+ items sequentially
- Research task that could benefit from parallel search strategies

**Nudge:** "You're doing sequential work that could be parallelized. Consider using sessions_spawn to create parallel workers per SUPERVISOR.md batch pipeline."

**Implementation:** Track recent tool calls. If pattern matches sequential batch work, inject the nudge.

```typescript
let recentExecs: string[] = [];
const BATCH_THRESHOLD = 3;

const handler = async (event: any) => {
  const toolName = event.tool?.name || "";

  if (toolName === "exec") {
    recentExecs.push(JSON.stringify(event.tool?.input || {}));
    if (recentExecs.length > 10) recentExecs.shift();

    // Check if last N execs look similar (batch pattern)
    if (recentExecs.length >= BATCH_THRESHOLD) {
      const recent = recentExecs.slice(-BATCH_THRESHOLD);
      const similarity = checkSimilarity(recent);
      if (similarity > 0.7) {
        return {
          prompt: (event.context?.prompt || "") +
            "\n\n⚠️ BATCH DETECTED: You're running similar commands sequentially. " +
            "Consider spawning parallel workers via sessions_spawn. " +
            "See SUPERVISOR.md → Batch Processing pipeline."
        };
      }
    }
  }

  return undefined;
};

function checkSimilarity(commands: string[]): number {
  // Simple: check if commands share the same tool/command prefix
  const prefixes = commands.map(c => c.substring(0, 50));
  const unique = new Set(prefixes);
  return 1 - (unique.size / commands.length);
}

export default handler;
```

---

## 4. ROUTER.md -- Dispatch Logic

The ROUTER.md file tells the agent HOW to dispatch incoming requests. It maps natural language keywords to specific actions, skills, or sub-agent spawns.

### Core Rules (Always Active)

| Rule | Priority | Description |
|------|----------|-------------|
| OB GATE | 0 (highest) | Before asking ANY factual question, search OB first |
| SKILLS GATE | 1 | Before doing ANY task, check SKILL-INDEX.md for a match |
| SUB-AGENT GATE | 2 | For 3+ independent items, spawn parallel workers |

### Dispatch Table

See `workspace-staging/ROUTER.md` for the full table mapping keywords → actions.

Key routing decisions:
- **Factual questions** → OB search_all → answer (never ask user first)
- **Apple services** (email, calendar, reminders) → mcp2cli imcp → haiku model
- **Infrastructure** (deploy, container, proxmox) → spawn infra worker → sonnet model
- **Research** → spawn research worker → sonnet model
- **Batch/bulk** → Spawn & Report pattern → haiku workers
- **Conversation/banter** → handle directly (no dispatch)

---

## 5. SUPERVISOR.md -- Pipeline Orchestration

Defines multi-step workflows with explicit step sequences, model assignments, and handoff rules.

### Defined Pipelines

| Pipeline | Trigger | Steps | Pattern |
|----------|---------|-------|---------|
| Morning Briefing (Mission Control) | First message, "catch me up", cron 7AM | 5 parallel workers → merge → compose → send | Spawn & Report |
| Research Deep Dive | "research", "investigate" | OB search → web search → synthesize → save to OB → report | Sequential + spawn |
| Deploy / Infra Change | "deploy", "set up" | Audit → plan → APPROVE → execute → verify | Sequential with gate |
| Content Processing | YouTube URL, "summarize" | Detect type → fabric process → save to OB → report | Sequential |
| Session Bounce | 400K context | Save OB → write memory → notify → /new | Sequential (urgent) |
| Batch Processing | "all of", "each", "batch" | Parse items → split batches → spawn workers → merge → report | Spawn & Report |

See `workspace-staging/SUPERVISOR.md` for full pipeline definitions with step-by-step instructions.

---

## 6. Cron / Automation

### Morning Briefing Cron

```json
{
  "id": "morning-briefing",
  "schedule": "0 7 * * *",
  "timezone": "America/New_York",
  "agent": "main",
  "prompt": "Execute the Morning Briefing pipeline from SUPERVISOR.md. Send results to the user on Discord.",
  "model": "litellm/claude-sonnet-4-6@default"
}
```

### Nightly Consolidation ("Dream Cycle")

```json
{
  "id": "nightly-consolidation",
  "schedule": "0 2 * * *",
  "timezone": "America/New_York",
  "agent": "main",
  "prompt": "Execute nightly consolidation: 1) Compress memory files older than 7 days into weekly digest. 2) Push important facts to OB as thoughts. 3) Trim MEMORY.md if over 200 lines. 4) Report what was consolidated.",
  "model": "litellm/gemini-3-flash"
}
```

### Heartbeat (Already Configured)

Runs every 5 minutes on `gemini-3-flash` (free). Checks for pending messages, scheduled tasks, and proactive opportunities defined in HEARTBEAT.md.

---

## 7. Hook Registration in Config

All hooks must be registered in `openclaw.json` under `hooks.internal.entries`:

```json
"hooks": {
  "internal": {
    "enabled": true,
    "entries": {
      "law-reinforcement": { "enabled": true },
      "ob-gate": { "enabled": true },
      "no-self-surgery": { "enabled": true },
      "no-unsolicited-images": { "enabled": true },
      "rate-limiter": { "enabled": true },
      "subagent-nudge": { "enabled": true },
      "boot-md": { "enabled": true },
      "session-memory": { "enabled": true },
      "mcp2cli-daemon-fix": { "enabled": true }
    }
  }
}
```

Hooks are loaded from `~/.openclaw/hooks/<name>/handler.ts` at gateway start. Changes require a gateway restart to take effect.

---

## 8. Enforcement Checklist (Per Instance)

Before declaring any instance "production ready":

- [ ] law-reinforcement hook deployed and enabled (OB-first, skills-first, sub-agents rules)
- [ ] ob-gate hook deployed and enabled
- [ ] no-self-surgery hook deployed and enabled
- [ ] no-unsolicited-images hook deployed and enabled
- [ ] rate-limiter hook deployed and enabled
- [ ] Tool policy: `tools.deny` includes dangerous tools
- [ ] Tool policy: `exec.security: "allowlist"`
- [ ] Tool policy: `elevated.enabled: false`
- [ ] Tool policy: `loopDetection.enabled: true`
- [ ] Model string matches LiteLLM model ID exactly
- [ ] ROUTER.md deployed with OB gate + skills gate rules
- [ ] SUPERVISOR.md deployed with pipeline definitions
- [ ] No ClawHub skills installed (PAI curated skills only)
- [ ] Separate bot credentials (not personal accounts)
- [ ] Gateway token set in both config AND plist
- [ ] Custom plist patches applied (--force, NO_RESPAWN, ThrottleInterval=10)
- [ ] Context tokens set to 1000000 in agents.defaults
- [ ] Compaction memoryFlush configured with OB save protocol
