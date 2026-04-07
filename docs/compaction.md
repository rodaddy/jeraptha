# Context Window Management

## The Problem

On 1M context window, OpenClaw's default `compaction.reserveTokens` (16384) means compaction only fires at ~984K tokens -- way too late. By then the agent is incoherent.

## The Fix

```json
{
  "compaction": {
    "reserveTokens": 600000,
    "reserveTokensFloor": 600000
  }
}
```

This makes compaction fire at ~400K tokens (1M - 600K = 400K).

## Why 400K?

- < 300K: Agent is sharp, context is fresh
- 300K-400K: Still functional but getting chunky
- 400K+: Quality degrades, "lost in the middle" effect kicks in
- 600K+: Agent is tripping balls
- Never let it hit 1M

## Rules

1. **Trust auto-compaction.** Do NOT manually bounce sessions.
2. **Agent should warn at 300K** ("context getting chunky")
3. **Auto-compaction handles 400K+** automatically
4. **Never set memoryFlush thresholds without matching compaction thresholds**

## Related Config

```json
{
  "memoryFlush": {
    "softThresholdTokens": 400000
  }
}
```

Keep `memoryFlush.softThresholdTokens` aligned with the effective compaction trigger point.
