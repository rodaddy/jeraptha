# 🪲 The ECO -- Ethics and Compliance Office

*"Is a branch of the Jeraptha Military which focused on ensuring established gambling law is obeyed, to observe the spirit of the law, and is responsible for overseeing compliance to established practices."*

Sound familiar? That's exactly what these hooks do -- except instead of gambling law, we enforce operational law.

## Hook Types

| Event | When | Can Block? | Jeraptha Equivalent |
|-------|------|-----------|-------------------|
| `before_tool_call` | Before any tool executes | ✅ Hard block | ECO enforcement -- comply or don't proceed |
| `before_prompt_build` | Before prompt assembly | ❌ Inject only | Intel briefing -- awareness, not enforcement |

## ECO Enforcement Hooks (Hard Blocks)

These are non-negotiable. The agent cannot proceed without compliance.

| Hook | Codename | What It Blocks |
|------|----------|---------------|
| `no-deaf-polls` | 🔇 Antenna Block | `process poll` with timeout > 10s. Keeps antennae up. |
| `sop-gate` | 📖 Compliance Check | Process-driven work without SOP search. No unauthorized operations. |
| `ob-gate` | 🧠 Intel First | Factual questions without checking knowledge base. Check intel before asking. |
| `no-self-surgery` | 🔒 Carapace Lock | Editing config/bootstrap files. The carapace stays intact. |

## Intel Briefing Hooks (Prompt Injection)

Awareness and context injection. Not enforcement -- but persistent enough that the agent can't "forget."

| Hook | Codename | What It Injects | Frequency |
|------|----------|----------------|-----------|
| `prompt-include` | 📎 Auto-Include | `*.system.include.md` and `*.transient.include.md` from `workspace/includes/` | Every turn |
| `task-context` | 📋 Flash Gold | Active tasks from TASKS.md | Every 3 turns (🚨 STALLED: every turn) |
| `sentiment-tracker` | 📊 Wagering | Behavioral alerts on negative sentiment | On detection |
| `law-reinforcement` | ⚖️ Standing Orders | Critical behavioral rules | Every 5 turns |

## Adding Custom Hooks

The ECO is extensible. Create a new compliance office:

```
hooks/
└── my-hook/
    ├── HOOK.md        # Orders (name, description, events)
    └── handler.ts     # Enforcement logic
```

### HOOK.md format:
```yaml
---
name: my-hook
description: "What this compliance rule enforces"
metadata:
  openclaw:
    emoji: "🪲"
    events: ["before_tool_call"]
---
```

### ECO enforcement pattern (hard block):
```typescript
const handler = async (event: any) => {
  if (violation(event)) {
    return {
      block: true,
      blockReason: "ECO VIOLATION: [what rule was broken and how to comply]"
    };
  }
  return undefined;
};
export default handler;
```

### Intel briefing pattern (injection):
```typescript
const handler = async (event: any) => {
  return {
    prompt: (event.context?.prompt || "") + "\n\nINTEL BRIEFING: [context here]",
  };
};
export default handler;
```

---

*Captain Scorandum would be proud. Probably. He'd also bet 6-1 odds on whether you actually follow these hooks.*
