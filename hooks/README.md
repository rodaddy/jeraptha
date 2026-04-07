# Hooks Catalog

OpenClaw hooks fire on specific events and can block tool calls or inject prompt content.

## Event Types

| Event | When | Can Block? | Use For |
|-------|------|-----------|---------|
| `before_tool_call` | Before any tool is executed | ✅ Yes | Hard enforcement (SOP gate, deaf polls, etc.) |
| `before_prompt_build` | Before prompt is assembled | ❌ No (inject only) | Context injection (tasks, scores, rule reminders) |

## Installed Hooks

### Hard Blocks (before_tool_call)

| Hook | What It Blocks | Why |
|------|---------------|-----|
| `no-deaf-polls` | `process poll` with timeout > 10s | Prevents agent from going deaf to user messages |
| `sop-gate` | Process-driven work without SOP check | Forces SOP compliance for deploys, git, PRs, etc. |
| `ob-gate` | Factual questions without knowledge base check | Forces knowledge base first |
| `no-self-surgery` | Editing config/bootstrap files | Prevents agent from breaking itself |

### Prompt Injection (before_prompt_build)

| Hook | What It Injects | Frequency |
|------|----------------|-----------|
| `task-context` | Active tasks from TASKS.md | Every 3 turns (STALLED: every turn) |
| `sentiment-tracker` | Behavioral alerts on negative sentiment | On negative user sentiment |
| `law-reinforcement` | Critical behavioral rules | Every 5 turns |

## Adding Custom Hooks

```
hooks/
└── my-hook/
    ├── HOOK.md        # Metadata (name, description, events)
    └── handler.ts     # Logic
```

### HOOK.md format:
```yaml
---
name: my-hook
description: "What this hook does"
metadata:
  openclaw:
    emoji: "🔧"
    events: ["before_tool_call"]  # or ["before_prompt_build"]
---
```

### handler.ts patterns:

**Hard block:**
```typescript
const handler = async (event: any) => {
  if (shouldBlock(event)) {
    return { block: true, blockReason: "Why it was blocked" };
  }
  return undefined;
};
export default handler;
```

**Prompt injection:**
```typescript
const handler = async (event: any) => {
  return {
    prompt: (event.context?.prompt || "") + "\n\nInjected content here",
  };
};
export default handler;
```
