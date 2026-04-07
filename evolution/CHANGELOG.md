# Evolution Changelog

Tracks how this framework evolves. Every change gets a WHY.

---

## v0.1.0 -- 2026-04-07 -- Initial Release

### What's included
- AGENTS.md with 11 LAWs (universal behavioral rules)
- TASKS.md template with cross-channel task tracking
- HEARTBEAT.md steering loop with 2-HB stale detection
- SCORECARD.md template with behavioral scoring
- 7 hooks: task-context, no-deaf-polls, sop-gate, sentiment-tracker, law-reinforcement, ob-gate, no-self-surgery
- Documentation: lessons-learned, compaction, model-routing, agent-communication
- Config changelog from production Skippy instance

### Why this exists
After months of running an always-on AI agent (Skippy), we identified that:
1. Soft nudges and prompt rules don't work -- agents ignore them
2. Hard blocks via hooks work -- agents can't ignore them
3. Task tracking without enforcement is useless
4. Behavioral scoring with verbal feedback (from the Reflexion/OPTAGENT research) provides meaningful self-regulation
5. Every lesson learned needs to be documented so the next agent doesn't repeat it

### Research basis
- Reflexion (Shinn et al., 2023) -- verbal reinforcement learning
- OPTAGENT (Bi et al., 2025) -- verbal RL for multi-agent reasoning
- MetaClaw (Xia et al., 2026) -- continual meta-learning on OpenClaw
- Self-Regulation (Min et al., 2025) -- metacognitive agent behavior
