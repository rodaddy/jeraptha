# oc-bootstrap -- OpenClaw Agent Bootstrap Kit

Everything we learned the hard way so the next agent doesn't have to.

## What This Is

A complete bootstrap package for spinning up a new OpenClaw agent with behavioral enforcement, task tracking, SOP compliance, and self-regulation baked in from day 1. Born from months of running Skippy (an always-on AI assistant) and documenting every failure, config fix, and behavioral pattern that actually works.

## Quick Start

```bash
# Clone
git clone git@github.com:rodaddy/oc-bootstrap.git
cd oc-bootstrap

# Install into an existing OpenClaw workspace
./install.sh --workspace ~/.openclaw/workspace --hooks ~/.openclaw/hooks

# Or dry-run to see what it would do
./install.sh --dry-run
```

## What You Get

### Workspace Files (customize these)
- `SOUL.md.template` -- Agent persona and behavioral DNA
- `USER.md.template` -- Your human's info, preferences, schedule
- `IDENTITY.md.template` -- Agent identity (name, creature, vibe, emoji)
- `TOOLS.md.template` -- Infrastructure, models, channels
- `MEMORY.md.template` -- Knowledge base integration

### Behavioral System (universal -- works out of the box)
- `AGENTS.md` -- The LAWs. Non-negotiable behavioral rules.
- `TASKS.md.template` -- Cross-channel task tracker with stale detection
- `HEARTBEAT.md` -- Steering loop that runs every 5 minutes
- `SCORECARD.md.template` -- Behavioral scoring with verbal feedback

### Hooks (enforcement -- the teeth)
| Hook | Type | What It Does |
|------|------|-------------|
| `task-context` | before_prompt_build | Injects active tasks into every Nth prompt turn |
| `no-deaf-polls` | before_tool_call | Hard blocks process polls > 10s (use tmux instead) |
| `sop-gate` | before_tool_call | Blocks process-driven work without SOP check |
| `sentiment-tracker` | before_prompt_build | Auto-scores from user reactions (praise/anger) |
| `law-reinforcement` | before_prompt_build | Re-injects critical rules every N turns |
| `ob-gate` | before_tool_call | Blocks factual questions without checking knowledge base |
| `no-self-surgery` | before_tool_call | Blocks agent from editing its own config |

### Documentation
- `docs/lessons-learned.md` -- Every screwup and how it was fixed
- `docs/compaction.md` -- Context window management
- `docs/model-routing.md` -- Which models for what tasks
- `config/config-changelog.md` -- Every config change and why

### Evolution Tracking
- `evolution/CHANGELOG.md` -- Framework version history
- `evolution/decisions/` -- Decision log with reasoning

## Philosophy

### Hard blocks > soft nudges
If the agent can ignore a rule, it will. Hooks that hard-block tool calls work. Prompt injections that "remind" the agent don't. Build enforcement into the system, not into promises.

### Verbal feedback > numeric scores
LLMs reason about text better than numbers. "You went silent for 12 minutes while an agent was running" is more actionable than "-3 points."

### Process rewards > outcome rewards
Score each STEP, not just the result. Did the agent announce what it was doing? Did it check the SOP? Did it update TASKS.md? Each step matters independently.

### Track the evolution
Every config change, every bug fix, every behavioral pattern gets documented with WHY. When the next agent hits the same problem, the answer is already there.

## Setup Checklist

1. [ ] Clone this repo
2. [ ] Copy templates, remove `.template` suffix, fill in your details
3. [ ] Set up LiteLLM or direct API keys
4. [ ] Configure channels (Discord/Telegram/iMessage)
5. [ ] Run `install.sh`
6. [ ] Restart gateway: `openclaw gateway restart`
7. [ ] Test: send a message, verify hooks are firing

## Requirements

- OpenClaw 2026.4.x+
- LiteLLM proxy or direct Anthropic/Google API keys
- Node.js 25+ (for hook TypeScript)

## Credits

Built by Rico Rojas and Skippy the Magnificent. Informed by:
- Reflexion (Shinn et al., 2023) -- verbal reinforcement learning
- OPTAGENT (Bi et al., 2025) -- verbal RL for multi-agent interactions
- MetaClaw (Xia et al., 2026) -- continual meta-learning for OpenClaw agents
- Self-Regulation (Min et al., 2025) -- metacognitive agent behavior

## License

MIT
