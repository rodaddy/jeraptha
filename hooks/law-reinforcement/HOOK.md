---
name: law-reinforcement
description: "Re-injects critical behavioral rules every 5 turns to prevent prompt degradation"
metadata:
  openclaw:
    emoji: "⚖️"
    events: ["before_prompt_build"]
---

# Law Reinforcement Hook

Prevents the "Lost in the Middle" effect where rules from SOUL.md/AGENTS.md/BOOT.md degrade as conversation context grows.

Every 5 turns, appends a compact block of mandatory rules to the prompt. Covers:
- OB-first (check Open Brain before asking Rico)
- Skills-first (use skills before doing things manually)
- Sub-agent usage (spawn workers for parallel/batch tasks)
- Pipeline enforcement (follow SUPERVISOR.md for multi-step workflows)
- Behavioral boundaries (no images, no self-surgery, concise responses)
- Model routing (LiteLLM models only -- Anthropic + Gemini)
