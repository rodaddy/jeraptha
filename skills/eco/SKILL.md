---
name: eco
description: Show behavioral scorecard from SCORECARD.md -- current score, enforcement mode, recent feedback, and failure patterns.
triggers:
  - /eco
  - show score
  - scorecard
  - behavioral score
  - how am i doing
  - wagering system
  - eco report
user-invocable: true
---

# Score -- Behavioral Scorecard (The Wagering System)

Read SCORECARD.md from the workspace and display the current behavioral score formatted for Discord.

## Instructions

When triggered, read `SCORECARD.md` from the workspace root.

Format the output for Discord using stacked block format.

### Display Format

**Header:**
```
🪲 **ECO Status Report**
> Current Score: [X]
> Mode: [🟢 Trusted / 🟡 Standard / 🟠 Warning / 🔴 Probation]
```

**Score thresholds:**
- > 10: 🟢 Trusted (Captain's discretion)
- 0-10: 🟡 Standard (Normal patrol)
- -5 to 0: 🟠 Warning (ECO audit)
- < -5: 🔴 Probation (Regional Patrol takeover)

**Recent Feedback (last 5 entries):**
```
> [timestamp] ✅ +2 praise -- "nice job on the deploy"
> [timestamp] ❌ -3 anger -- "wtf where are you"
```

If no recent feedback: `_No recent feedback logged._`

**Active Failure Patterns (if any):**
Show any failure log entries from the last 48h with their root cause and whether a fix was applied.

**Process Step Compliance (today):**
Show the daily checklist status (announced plan, checked SOP, updated TASKS.md, used tmux, etc.)

### If SCORECARD.md doesn't exist
Reply: "📊 No SCORECARD.md found. The wagering system is offline. No bets are being tracked."

### Tone
Use Jeraptha-flavored language where natural:
- Good score: "Odds favorable. ECO has no complaints."
- Bad score: "Wager history unfavorable. ECO recommends compliance review."
- Stalled: "Multiple defaults on record. Regional Patrol has been notified."
