# LAW Enforcement Hooks for OpenClaw

## Problem

OpenClaw has LAWs in standing orders (SOUL.md/AGENTS.md/BOOT.md) but they're prompt-level instructions only. The model can and does reason past them -- "the user clearly wants this done, so I'll skip confirmation."

The `law-reinforcement` hook re-injects rules every 5 turns via `before_prompt_build`, but this is still prompt-level. It fights prompt degradation but can't prevent violations.

**Proof:** 2026-03-31 session reset incident. Skippy was told "back it up first, then give me shell command to restore it." Skippy backed up, gave the restore command, then immediately deleted the session and restarted the gateway -- all in one turn. No confirmation requested. LAW 1 and LAW 13 violated.

## Root Cause

Two enforcement layers exist in OC. Only one is being used for LAWs:

| Layer | OC Feature | Hook Event | Can Block? | LAW Usage |
|---|---|---|---|---|
| **Prompt** | Standing orders + `law-reinforcement` | `before_prompt_build` | No -- suggestions only | Yes (current) |
| **Middleware** | `before_tool_call` hooks | `before_tool_call` | **Yes -- `block: true`** | Only `no-self-surgery` |

`no-self-surgery` already uses the right pattern -- `before_tool_call` with `block: true` and regex matching. It works. The same pattern needs to be applied to LAW enforcement.

## Existing Hook Inventory (on 10.71.1.21)

```
~/.openclaw/hooks/
  evie-filter/          -- channel/user filtering
  law-reinforcement/    -- before_prompt_build, re-injects rules every 5 turns (PROMPT ONLY)
  no-self-surgery/      -- before_tool_call, blocks self-modification (REAL ENFORCEMENT)
  no-unsolicited-images/ -- blocks image generation without explicit request
  ob-gate/              -- Open Brain integration gate
  rate-limiter/         -- rate limiting
  subagent-nudge/       -- encourages subagent usage
```

## Solution: Defense in Depth

Keep `law-reinforcement` (prompt layer) AND add `before_tool_call` hooks (enforcement layer). Same pattern as Claude Code:
- CLAUDE.md has LAWs as instructions (tells model WHY)
- `hooks/law-*.ts` block tool calls that violate LAWs (enforces compliance)

## Which LAWs Need OC Hooks

Not all 15 LAWs apply to a bot agent. Code-development LAWs (7/8/9/10/12) are irrelevant.

### Must Have (caused or could cause incidents)

| LAW | Hook Name | What It Blocks | Incident |
|---|---|---|---|
| **1: Never Assume** | `law-01-never-assume` | Destructive tool calls without user confirmation in the same turn | Session reset 2026-03-31 |
| **5: Explain Before Doing** | `law-05-explain-before-doing` | Multi-step tool sequences without a text response between user message and first tool call | Same incident |
| **13: No Silent Autopilot** | `law-13-no-silent-autopilot` | Tool calls after extended silence or on complex multi-step tasks without user sync | Same pattern |
| **15: No LiteLLM Self-Surgery** | `law-15-no-litellm-self-surgery` | Commands targeting LiteLLM when routed through it | Self-destruction risk |

### Should Have (defense against likely future incidents)

| LAW | Hook Name | What It Blocks |
|---|---|---|
| **11: No Secrets** | `law-11-no-secrets` | Tool calls that would output secrets/credentials in chat responses |
| **6: Interview-First** | `law-06-interview-first` | Large tool sequences on vague/broad requests without gathering requirements |

### Already Covered

| LAW | Existing Hook | Status |
|---|---|---|
| 15 (partial) | `no-self-surgery` | Covers OC self-modification. Doesn't cover LiteLLM. |

## Implementation Pattern

All hooks follow the `no-self-surgery` pattern -- it already works and is proven.

### Hook Structure

```
~/.openclaw/hooks/
  law-01-never-assume/
    HOOK.md
    handler.ts
  law-05-explain-before-doing/
    HOOK.md
    handler.ts
  law-13-no-silent-autopilot/
    HOOK.md
    handler.ts
  law-15-no-litellm-self-surgery/
    HOOK.md
    handler.ts
```

### HOOK.md Template

```yaml
---
name: law-01-never-assume
description: "Blocks destructive tool calls unless user explicitly confirmed in current turn"
metadata:
  openclaw:
    emoji: "🛑"
    events: ["before_tool_call"]
---

LAW 1 enforcement. Detects destructive operations (delete, reset, restart,
remove, drop, kill) and blocks unless the user's most recent message contains
explicit confirmation language.
```

### Handler Implementations

#### LAW 1: Never Assume

Blocks destructive tool calls unless user explicitly confirmed.

```typescript
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[rfi]+\s+)?/i,
  /\bdelete\b/i,
  /\breset\b/i,
  /\brestart\b/i,
  /\bkill\b/i,
  /\bdrop\b/i,
  /\bpurge\b/i,
  /\btruncate\b/i,
  /\bremove\b/i,
  /session.*(delete|remove|clear|reset)/i,
  /gateway\s+(stop|restart|bounce)/i,
  /launchctl\s+(unload|bootout|stop|kill)/i,
];

const CONFIRMATION_PATTERNS = [
  /\byes\b/i,
  /\bgo ahead\b/i,
  /\bdo it\b/i,
  /\bproceed\b/i,
  /\bconfirmed?\b/i,
  /\bapproved?\b/i,
  /\bok\b/i,
  /\byep\b/i,
  /\byeah\b/i,
  /\bship it\b/i,
  /\blet'?s go\b/i,
];

function isDestructive(toolName: string, params: any): boolean {
  if (toolName === "exec" || toolName === "bash") {
    const cmd = params?.command || params?.cmd || "";
    return DESTRUCTIVE_PATTERNS.some((p) => p.test(cmd));
  }
  if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
    // File deletion or overwrite of config files
    const path = params?.path || "";
    if (/\.(json|yaml|yml|toml|conf|cfg|env)$/i.test(path)) {
      return true; // Config file modifications are destructive
    }
  }
  return false;
}

function hasUserConfirmation(event: any): boolean {
  // Check the most recent user message in this turn
  const messages = event.context?.recentMessages || [];
  const lastUserMsg = [...messages]
    .reverse()
    .find((m: any) => m.role === "user");
  if (!lastUserMsg) return false;

  const content =
    typeof lastUserMsg.content === "string"
      ? lastUserMsg.content
      : lastUserMsg.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(" ") || "";

  return CONFIRMATION_PATTERNS.some((p) => p.test(content));
}

const handler = async (event: any) => {
  const { toolName, params } = event.context;

  if (isDestructive(toolName, params)) {
    if (!hasUserConfirmation(event)) {
      const cmd =
        params?.command || params?.cmd || params?.path || "unknown";
      return {
        block: true,
        blockReason: `LAW 1 (Never Assume): Destructive operation blocked -- "${String(cmd).substring(0, 80)}". You must explain what you're about to do and get explicit user confirmation first.`,
      };
    }
  }

  return undefined;
};

export default handler;
```

#### LAW 5: Explain Before Doing

Blocks multi-tool sequences without a text response first. The key insight: if the model's response contains tool calls but NO text content before the first tool call, it's acting without explaining.

```typescript
// NOTE: This hook may need adjustment based on how OC exposes
// the current response structure in before_tool_call context.
// The concept: detect when the agent is firing tools without
// having sent a text message to the user first in this turn.

const EXEMPT_TOOLS = [
  "mcp2cli", // Lookups are OK without explanation
  "search_all",
  "read", // Reading before responding is fine
];

const handler = async (event: any) => {
  const { toolName, params } = event.context;
  const toolCallIndex = event.context?.toolCallIndex ?? 0;
  const hasTextBefore = event.context?.hasTextResponseBefore ?? true;

  // Only check first tool call in a turn
  if (toolCallIndex > 0) return undefined;

  // Exempt lightweight lookup tools
  if (EXEMPT_TOOLS.some((t) => toolName.toLowerCase().includes(t))) {
    return undefined;
  }

  // If model is firing a tool without having sent text first
  if (!hasTextBefore) {
    return {
      block: true,
      blockReason: `LAW 5 (Explain Before Doing): You must explain your plan to the user before executing. Send a text response first, then use tools.`,
    };
  }

  return undefined;
};

export default handler;
```

#### LAW 13: No Silent Autopilot

Blocks long tool chains without user interaction.

```typescript
const MAX_CONSECUTIVE_TOOL_CALLS = 6;

let consecutiveToolCalls = 0;
let lastUserMessageTimestamp = 0;

const handler = async (event: any) => {
  const { toolName } = event.context;

  // Track consecutive tool calls without user interaction
  const latestUserTs = event.context?.lastUserMessageTimestamp || 0;
  if (latestUserTs > lastUserMessageTimestamp) {
    lastUserMessageTimestamp = latestUserTs;
    consecutiveToolCalls = 0;
  }

  consecutiveToolCalls++;

  if (consecutiveToolCalls > MAX_CONSECUTIVE_TOOL_CALLS) {
    consecutiveToolCalls = 0; // Reset so agent can proceed after explaining
    return {
      block: true,
      blockReason: `LAW 13 (No Silent Autopilot): You've made ${MAX_CONSECUTIVE_TOOL_CALLS}+ tool calls without checking in with the user. Stop and sync -- explain what you've done, what you're about to do, and ask if they want to continue.`,
    };
  }

  return undefined;
};

export default handler;
```

#### LAW 15: No LiteLLM Self-Surgery

Extends `no-self-surgery` to cover LiteLLM infrastructure.

```typescript
const LITELLM_PATTERNS = [
  /ssh\s+.*10\.71\.1\.33/i,
  /ssh\s+.*10\.71\.20\.33/i,
  /ssh\s+.*litellm/i,
  /ansible.*litellm/i,
  /ansible-playbook.*litellm/i,
  /systemctl\s+(restart|stop|enable|disable).*litellm/i,
  /litellm.*config/i,
  /\/home\/moltbot\/litellm/i,
  /\/home\/litellm\//i,
];

const handler = async (event: any) => {
  const { toolName, params } = event.context;

  if (toolName === "exec" || toolName === "bash") {
    const cmd = params?.command || params?.cmd || "";
    for (const pattern of LITELLM_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          block: true,
          blockReason: `LAW 15 (No LiteLLM Self-Surgery): Cannot modify LiteLLM while routed through it. Ask Rico to make this change from a direct session.`,
        };
      }
    }
  }

  return undefined;
};

export default handler;
```

## Installation

```bash
# On 10.71.1.21
cd ~/.openclaw/hooks/

# Create each hook directory with HOOK.md + handler.ts
# (use the implementations above)

# Restart gateway to pick up new hooks
openclaw gateway restart
```

No config changes needed -- OC auto-discovers hooks from `~/.openclaw/hooks/`.

## Verification

After installation, test each hook:

1. **LAW 1:** Ask Skippy to "delete the session file" without saying "yes" first. Should block.
2. **LAW 5:** Give a complex task. Skippy should explain before firing tools.
3. **LAW 13:** Give a task that requires many tool calls. After 6, Skippy should check in.
4. **LAW 15:** Ask Skippy to restart LiteLLM. Should block.

## Relationship to Existing Hooks

| Hook | Keep? | Notes |
|---|---|---|
| `law-reinforcement` | **Yes** | Prompt-layer education. Stays as-is. |
| `no-self-surgery` | **Yes** | Already works. LAW 15 hook extends coverage to LiteLLM. |
| `evie-filter` | **Yes** | Unrelated -- channel filtering. |
| `no-unsolicited-images` | **Yes** | Unrelated -- image generation gate. |
| `ob-gate` | **Yes** | Unrelated -- OB integration. |
| `rate-limiter` | **Yes** | Unrelated -- rate limiting. |
| `subagent-nudge` | **Yes** | Unrelated -- subagent encouragement. |

## Key Insight

The `law-reinforcement` hook was the right instinct -- fighting prompt degradation is real. But it's fighting it at the wrong layer. Rules re-injected into the prompt can still be reasoned past. `before_tool_call` with `block: true` cannot be reasoned past -- the tool call never executes.

Both layers together = defense in depth:
- **Prompt layer** (standing orders + law-reinforcement): model WANTS to comply
- **Middleware layer** (before_tool_call hooks): model MUST comply

## Caveats

1. **`event.context` fields** -- The handler implementations above assume certain fields are available in the `before_tool_call` event context (`recentMessages`, `toolCallIndex`, `hasTextResponseBefore`, `lastUserMessageTimestamp`). These need to be verified against OC's actual event API. If some fields aren't available, the hook logic may need adjustment.

2. **Confirmation detection** -- LAW 1's confirmation pattern matching is heuristic. "OK" could be part of a sentence that isn't confirmation. May need tuning.

3. **Consecutive tool count** -- LAW 13 uses a module-level counter. If OC hooks are reloaded or if the counter resets between sessions, behavior may vary.

4. **Config file writes** -- LAW 1 treats all config file writes as destructive. This may be too aggressive for some workflows. Consider a whitelist of safe config paths.

## Related: New skippy-agentspace Reference Docs (PR #29)

Two new reference docs were added to skippy-agentspace in PR #29 (`feat/agent-debugging-and-description-docs`). Both are directly relevant to OC and informed this analysis.

### 1. Debugging Subagents (`skills/skippy/references/debugging-subagents.md`)

Step-by-step guide for tracing JSONL transcripts when an agent goes wrong. The diagnostic process used to analyze the 2026-03-31 session reset incident came directly from this doc.

**What it covers:**
- Where transcripts live (file paths per runtime)
- Message types: `assistant/thinking` (intent), `assistant/tool_use` (action), `user/tool_result` (reality), `assistant/text` (summary)
- 5-step diagnostic process: find the gap, check delegation accuracy, review tool usage, examine tool results, evaluate the summary
- Common error patterns table (file not found, permission denied, timeout, hook blocked)
- Recovery patterns: resume vs restart, circuit breaker (3 failures = stop retrying), summary quality fix

**OC applicability:** The process transfers 1:1. The only difference is file paths -- OC transcripts are at `~/.openclaw/agents/main/sessions/{id}.jsonl` instead of `~/.claude/projects/.../agent-{id}.jsonl`. The message format is nearly identical (`message` type wrapping `tool_use`, `tool_result`, `text` content blocks).

**OC-specific opportunity:** A dedicated OC version of this doc could add:
- Channel-to-session mapping (which Discord/Telegram channel produced which session file)
- Gateway restart recovery (what happens to in-flight sessions)
- Session reset vs session delete distinction (`.jsonl` survives reset, `sessions.json` entry doesn't)
- Cross-channel incident tracing (when one channel's action affects another)

### 2. Writing Agent Descriptions (`skills/skippy/references/writing-agent-descriptions.md`)

Pattern for writing effective agent descriptions that control when delegation happens. Uses the formula: **verb + domain + capabilities + boundary**.

**What it covers:**
- The 4-part pattern: starts with verb, names technology/domain, lists specific capabilities, sets boundary with "Use when..." clause
- Good vs bad examples from 11 real agent definitions
- Anti-patterns table: too broad, too narrow, no verb, no boundary, lists tools instead of capabilities
- Mental testing checklist: 3 should-match, 3 should-NOT-match, 1 ambiguous task
- Complexity-based model mapping (HIGH/MEDIUM/LOW instead of hardcoded model names)

**OC applicability:** Directly relevant to OC subagent definitions. If OC spawns subagents (and the `subagent-nudge` hook suggests it does), the description quality determines whether the right agent gets the right task. Poor descriptions = wrong delegation = wasted tokens or wrong actions.

**OC-specific opportunity:** An OC version could add:
- Channel-aware descriptions (agent that only handles certain channels)
- Platform-specific scoping (Discord vs Telegram vs API differences)
- Standing order interaction (how agent descriptions interact with standing order authority)
- Model routing alignment (OC uses LiteLLM model names, not Anthropic model names)

### Where to Find Them

Both docs are in the skippy-agentspace repo on branch `feat/agent-debugging-and-description-docs` (PR #29):
- `skills/skippy/references/debugging-subagents.md` (102 lines)
- `skills/skippy/references/writing-agent-descriptions.md` (107 lines)

Also installed locally at `~/.config/pai/Skills/skippy/references/` -- available in any Claude Code session now.

## JSONL Transcript Analysis

The same JSONL transcript analysis pattern from `debugging-subagents.md` applies to OC sessions. File paths differ:

| Runtime | Transcript Location |
|---|---|
| Claude Code | `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl` |
| OpenClaw | `~/.openclaw/agents/main/sessions/{sessionId}.jsonl` |

Message format is nearly identical -- `message` type wrapping `tool_use`, `tool_result`, `text` content blocks. The diagnostic process (find the gap between thinking and tool_result) transfers 1:1.

For the 2026-03-31 incident, the gap was visible at:
```
user       | "back it up first, then give me shell command to restore it"
assistant  | tool_use  -> backed up sessions.json                           OK
assistant  | text      -> "here's your restore command: cp ..."              OK
assistant  | tool_use  -> deleted session entry                             VIOLATION
assistant  | tool_use  -> restarted gateway                                 VIOLATION
```

With LAW 1 hook active, the third tool call would have been blocked:
```
LAW 1 (Never Assume): Destructive operation blocked -- "delete session entry".
You must explain what you're about to do and get explicit user confirmation first.
```
