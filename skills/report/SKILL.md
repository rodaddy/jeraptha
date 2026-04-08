---
name: report
description: Generate a Jeraptha enforcement report from today's OC gateway logs -- gate fires, blocks, compliance, sentiment, and behavioral patterns over a configurable time window.
triggers:
  - /report
  - enforcement report
  - gate report
  - hook report
  - what's firing
  - show blocks
user-invocable: true
---

# Report -- Jeraptha Enforcement Report

Parse the OpenClaw gateway log and produce a behavioral enforcement summary for a configurable time window.

## Arguments

`/report [timeframe]` -- defaults to `1h`. Accepts: `30m`, `1h`, `4h`, `12h`, `24h`, `today`.

Examples:
- `/report` -- last 1 hour
- `/report 4h` -- last 4 hours
- `/report 24h` -- last 24 hours
- `/report today` -- since midnight

## Instructions

### Step 1: Parse the time window

Convert the argument to a cutoff timestamp. Default is 1 hour ago.

### Step 2: Read the log

The log file is at `/tmp/openclaw/openclaw-YYYY-MM-DD.log` (today's date).

Each line is JSON. Jeraptha entries have `[jeraptha]` in field `"1"`. Extract all jeraptha log lines within the time window.

If running remotely (not on the OC host), SSH to the gateway host to read the log.

### Step 3: Categorize entries

Parse each `[jeraptha]` log entry and categorize:

| Category | Pattern in log | Count |
|----------|---------------|-------|
| **Registrations** | `registered:` | How many gateway restarts |
| **Task gate blocks** | `BLOCKED task-freshness-gate` | Times task gate fired |
| **Comms gate blocks** | `BLOCKED communication-gate` | Times comms gate fired |
| **Heartbeat gate blocks** | `BLOCKED heartbeat-gate` | Times heartbeat gate fired |
| **SOP gate blocks** | `BLOCKED sop-gate` | Times SOP gate blocked |
| **OB gate blocks** | `BLOCKED ob-gate` | Times OB gate blocked |
| **Self-surgery blocks** | `BLOCKED no-self-surgery` | Times self-surgery blocked |
| **Deaf poll blocks** | `BLOCKED no-deaf-polls` | Times deaf poll blocked |
| **Approvals** | `APPROVAL` | Times approval was required |
| **Task writes** | `state-tracker: TASKS.md write` | Times TASKS.md was updated |
| **Scorecard writes** | `state-tracker: SCORECARD.md write` | Times scorecard was updated |
| **Message sends** | `state-tracker: message send` | Times a message was sent |
| **Sentiment positive** | `sentiment: POSITIVE` | Positive sentiment events |
| **Sentiment negative** | `sentiment: NEGATIVE` | Negative sentiment events |
| **Stalled alerts** | `INJECTED task-stalled-alert` | Times stalled alert fired |

### Step 4: Format for Discord

```
**Jeraptha Enforcement Report** ({timeframe})
> Period: {start_time} -- {end_time}
> Gateway restarts: {count}

**Blocking Gates**
> Task Freshness: {count} blocks | {task_write_count} compliant writes
> Communication: {count} blocks | {message_count} messages sent
> Heartbeat: {count} blocks | {scorecard_write_count} heartbeat updates
> SOP Gate: {count} blocks
> OB Gate: {count} blocks
> Self-Surgery: {count} blocks
> Deaf Poll: {count} blocks

**Compliance Ratio**
> Gates fired: {total_blocks} | Actions taken: {total_compliant}
> Ratio: {percentage}%

**Sentiment**
> Positive: {count} | Negative: {count} | Net: {net}

**Stalled Tasks**
> Alerts fired: {count}

**Assessment**
> {one-line assessment based on the data}
```

### Assessment Logic

- 0 blocks + high compliance actions: "Clean run. Gates didn't need to fire."
- Blocks with matching compliance: "Gates working as designed -- blocking forced compliance."
- Blocks without compliance: "Gates firing but compliance not following. Investigate."
- High negative sentiment: "User frustration detected. Check SCORECARD.md for patterns."
- No data: "No Jeraptha activity in this window. Gateway may not be running."

### If log doesn't exist

Reply: "No log file found for today. Is the OpenClaw gateway running?"

### Tone

Jeraptha-flavored -- clinical, betting-themed:
- Good: "Odds improving. The exoskeleton is holding."
- Mixed: "Partial compliance. The beetles would note this is a 3-1 proposition."
- Bad: "Enforcement overhead exceeding tolerance. ECO recommends intervention."
