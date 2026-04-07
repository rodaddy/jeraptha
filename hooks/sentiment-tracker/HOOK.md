---
name: sentiment-tracker
description: "Detects user praise/anger and auto-logs behavioral feedback to SCORECARD.md"
metadata:
  openclaw:
    emoji: "📊"
    events: ["before_prompt_build"]
---

# Sentiment Tracker Hook

Monitors user messages for sentiment signals (praise, anger, frustration, approval) and:
1. Auto-logs the event to SCORECARD.md with timestamp, context, and what triggered it
2. Adjusts the behavioral score (positive for praise, negative for anger)
3. Generates verbose verbal feedback from the signal for prompt injection

The user doesn't need to write detailed feedback -- natural reactions are enough.
"nice" / "good job" / 👍 / "perfect" → positive signal
"wtf" / "dumb" / "stop" / "why" / angry emoji → negative signal

The hook turns these natural reactions into structured behavioral reinforcement.
