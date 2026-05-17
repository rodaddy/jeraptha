# 🪲 Jeraptha -- Behavioral Enforcement for OpenClaw Agents

*"Trust the beetle. The beetle tracks everything."*

Named after the Jeraptha -- the beetle-like Tier 2 species from the Expeditionary Force universe who obsessively gamble on every outcome, run a nationalized compliance system, and are the only species with claws. Running on Open**Claw**. Get it?

## What Is This?

Your AI agent is a dumdum. It drops tasks, ignores SOPs, goes silent for 15 minutes, and then pretends everything is fine. You know it. It knows it. Nobody is doing anything about it.

Jeraptha fixes that.

It's a behavioral enforcement framework that brings Jeraptha-level discipline to OpenClaw agents:

- **The Ethics and Compliance Office (ECO)** -- Hooks that hard-block bad behavior. The agent physically cannot proceed without following the rules. Just like the Jeraptha ECO enforces gambling law, these hooks enforce operational law.

- **The Wagering System** -- A behavioral scorecard that tracks every outcome. Positive reinforcement when things go well, negative when they don't. The Jeraptha bet on everything. We score everything.

- **Flash Gold Priority** -- Task tracking with stale detection. If a task goes dark for 2 heartbeats (10 min), it gets flagged 🚨 STALLED and the agent is forced to address it. Like a Flash Gold message -- highest urgency, no ignoring it.

- **Regional Patrol** -- The heartbeat system. Every 5 minutes, it sweeps all channels, checks all tasks, enforces SOP compliance, and kicks the agent back on track. Underfunded and running on obsolete hardware? Maybe. But it gets the job done.

## Quick Start

```bash
# Clone the beetles
git clone git@github.com:<your-username>/jeraptha.git
cd jeraptha

# Deploy the ECO to your OpenClaw instance
./install.sh --workspace ~/.openclaw/workspace --hooks ~/.openclaw/hooks

# Or dry-run to see what the beetles would do
./install.sh --dry-run
```

## The ECO (Ethics and Compliance Office)

Hard-block hooks that enforce operational law. The agent can't ignore these -- the tool call gets rejected.

| Hook | Codename | What It Enforces |
|------|----------|-----------------|
| `no-deaf-polls` | 🔇 Antenna Block | Blocks `process poll` > 10s. Agent stays responsive. Never goes deaf. |
| `sop-gate` | 📖 Compliance Check | Blocks process-driven work without SOP search. No winging it. |
| `ob-gate` | 🧠 Intel First | Blocks factual questions without checking the knowledge base first. |
| `no-self-surgery` | 🔒 Carapace Lock | Blocks agent from editing its own config. No self-modification. |

## The Wagering System

Behavioral scoring with verbal feedback. Not just numbers -- actual context about what went right or wrong.

| Signal | Points | The Jeraptha Would Say... |
|--------|--------|--------------------------|
| Task completed with full detail | +2 | "Favorable odds confirmed. Payout authorized." |
| Used tmux, stayed responsive | +2 | "Antenna discipline maintained. Bet honored." |
| Strong user praise | +3 | "The monkey is pleased. Odds improving." |
| Task went STALLED | -3 | "Wager defaulted. ECO notified." |
| User had to ask "where are you" | -3 | "Antenna failure. Compliance violation." |
| Didn't follow SOP | -2 | "Unauthorized deviation. ECO investigating." |

The scorecard changes the agent's enforcement mode:

| Score | Mode | Jeraptha Equivalent |
|-------|------|-------------------|
| > 10 | 🟢 Trusted | Captain's discretion |
| 0-10 | 🟡 Standard | Normal patrol operations |
| -5 to 0 | 🟠 Warning | ECO audit in progress |
| < -5 | 🔴 Probation | Regional Patrol takeover -- every action monitored |

## Flash Gold Priority System

Task tracking that actually works. Every task lives in TASKS.md with full context -- not lazy one-liners.

**The 2-Heartbeat Rule:**
1. **HB 1:** Task not progressing → ⚠️ WARNING stamped
2. **HB 2:** Still nothing → 🚨 STALLED. Agent is forced to address it. Message sent to the task's channel.

Like a Flash Gold message in Jeraptha military comms -- when it hits, you stop what you're doing and respond.

## Regional Patrol (Heartbeat)

Every 5 minutes, the heartbeat sweeps:
1. Context window health
2. Push state to knowledge base
3. Read TASKS.md -- check every task
4. Enforce SOP compliance
5. Check for urgent items

It's underfunded and runs on a sonnet-tier model. But like the Jeraptha Regional Patrol, it keeps the outer colonies from falling apart.

## Prompt Injection (Awareness Layer)

Not hard blocks -- but persistent awareness that fights "lost in the middle" degradation.

| Hook | Frequency | What It Injects |
|------|-----------|----------------|
| `task-context` | Every 3 turns (STALLED: every turn) | Active tasks from TASKS.md |
| `sentiment-tracker` | On negative sentiment | Behavioral alerts with context |
| `law-reinforcement` | Every 5 turns | Critical behavioral rules |

## What's In The Box

```
jeraptha/
├── README.md                    # You are here
├── install.sh                   # One-command deployment
│
├── workspace/                   # Agent workspace files
│   ├── AGENTS.md                # The LAWs (universal)
│   ├── HEARTBEAT.md             # Regional Patrol protocol
│   ├── TASKS.md.template        # Flash Gold task tracker
│   ├── SCORECARD.md.template    # Wagering system
│   ├── SOUL.md.template         # Agent persona (customize)
│   ├── USER.md.template         # Your human (customize)
│   ├── IDENTITY.md.template     # Agent identity (customize)
│   ├── TOOLS.md.template        # Infrastructure (customize)
│   └── MEMORY.md.template       # Knowledge base integration
│
├── hooks/                       # The ECO
│   ├── no-deaf-polls/           # 🔇 Antenna Block
│   ├── sop-gate/                # 📖 Compliance Check
│   ├── ob-gate/                 # 🧠 Intel First
│   ├── no-self-surgery/         # 🔒 Carapace Lock
│   ├── task-context/            # 📋 Flash Gold Injection
│   ├── sentiment-tracker/       # 📊 Wagering System
│   └── law-reinforcement/       # ⚖️ Rule Reinforcement
│
├── docs/                        # Field manuals
│   ├── lessons-learned.md       # Battle damage reports
│   ├── compaction.md            # Context management
│   ├── model-routing.md         # Fleet composition
│   └── agent-communication.md   # Comms protocol
│
├── config/                      # Configuration intel
│   ├── defaults.md              # Recommended settings
│   └── config-changelog.md      # Every change and why
│
└── evolution/                   # The wager history
    ├── CHANGELOG.md             # Version history
    └── decisions/               # Decision log with odds
```

## Setup Checklist

1. [ ] Clone the repo
2. [ ] Copy templates, remove `.template` suffix, fill in details
3. [ ] Set up LiteLLM or direct API keys
4. [ ] Configure channels (Discord/Telegram/iMessage)
5. [ ] Run `install.sh`
6. [ ] Restart gateway: `openclaw gateway restart`
7. [ ] Send a test message -- verify the ECO is active

## Research Basis

This isn't made up. It's based on actual research into agent self-regulation:

- **Reflexion** (Shinn et al., 2023) -- Verbal reinforcement learning. Text feedback works better than numeric scores for LLMs.
- **OPTAGENT** (Bi et al., 2025) -- Verbal RL for multi-agent reasoning. Evaluating interaction quality, not just outcomes.
- **MetaClaw** (Xia et al., 2026) -- Continual meta-learning on OpenClaw. Process reward models, failure trajectory analysis.
- **Self-Regulation** (Min et al., 2025) -- Metacognitive agent behavior. Knowing when to ask for help.

## Philosophy

**Hard blocks > soft nudges.** If the agent can ignore a rule, it will.

**Verbal feedback > numeric scores.** "You went silent for 12 minutes" is more useful than "-3 points."

**Process rewards > outcome rewards.** Score each step, not just the result.

**Track the evolution.** Every change gets a WHY. The next agent shouldn't repeat the same mistakes.

**The Jeraptha bet on everything. We track everything.**

## Requirements

- OpenClaw 2026.4.x+
- LiteLLM proxy or direct API keys
- Node.js 25+
- An unhealthy appreciation for beetle-based compliance systems

## License

MIT

---

*Built with an unhealthy appreciation for beetle-based compliance systems. The Jeraptha would approve -- assuming we let them bet on whether it works.*

*Chuta.*
