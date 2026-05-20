# score-and-inject-user-sentiment

**Priority:** 50
**Event:** `before_prompt_build`
**Type:** Injection (conditional)

## What

Scores user messages for positive and negative sentiment using pattern matching. Updates SCORECARD.md with scored entries. Injects a behavioral alert when strong negative sentiment is detected.

## Why

Agents need feedback awareness. Without sentiment tracking, repeated negative signals (frustration, anger, repeated failures) go unacknowledged. The agent keeps making the same mistakes. This injection creates a feedback loop: user sentiment is recorded, trends are visible in the scorecard, and strong negatives trigger immediate behavioral adjustment.

## How

1. Finds the last user message in the event's message history.
2. Deduplicates against `sentimentLastMsg` to avoid re-scoring the same message.
3. Filters out non-conversational content: boot messages, JSON blobs, system-injected XML, very short messages (< 3 chars), and very long messages (> 500 chars).
4. Runs the message text against POSITIVE_SENTIMENT and NEGATIVE_SENTIMENT pattern arrays from shared constants.
5. If the absolute score is < 2, ignores (avoids noise from single weak signals).
6. Appends a timestamped entry to SCORECARD.md's "Recent Feedback" section and updates the running score.
7. If total score is < -2 (strong negative), returns `appendSystemContext` with a behavioral alert.

## State Dependencies

| State Field | Purpose |
|---|---|
| `sentimentLastMsg` | Deduplication -- skip if same message as last scored |

## Sentiment Patterns

**Positive** (from `shared/constants.js`):
- Praise (nice, great, awesome, nailed it): +2
- Gratitude (thanks, appreciate): +1
- Confirmation (yes, correct, exactly): +1
- Positive emoji: +2
- Strong praise (crushing it, killing it): +3

**Negative** (from `shared/constants.js`):
- Anger (wtf, are you serious): -3
- Criticism (dumb, stupid, broken): -2
- Correction (stop, no, don't): -1
- Accountability (why did you, what happened): -2
- Repeated failure (again, every time): -3
- Strong criticism (shit show, flaky, lazy): -3
- Negative emoji: -2

## Injection Message (only on strong negative, score < -2)

```
BEHAVIORAL ALERT
User expressed negative sentiment (score). Triggers: [matched patterns].
Acknowledge the feedback. Own errors specifically. Check SCORECARD.md for patterns.
```

## Side Effects

- Writes to SCORECARD.md: appends feedback entry, updates running score.

## Examples

**Injected:** User says "wtf this is broken again" (score: -8). Alert injected.

**Scorecard updated, no injection:** User says "nice work, thanks!" (score: +3). Positive, logged but no alert.

**Skipped:** User sends a JSON blob or system message.

**Skipped:** Same message as the previous scored message (dedup).

**Skipped:** Message is under 3 characters or over 500 characters.
