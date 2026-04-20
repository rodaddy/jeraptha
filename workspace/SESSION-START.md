# Session Start Protocol

## On New Session (Mandatory)

1. Read TASKS.md -- what's active, stalled, blocked
2. Read SCORECARD.md -- current score, recent feedback, behavioral state
3. Read CONVERSATIONS.md -- active topics, heat levels
4. Check HEARTBEAT.md -- last heartbeat time, compliance status
5. Search OB for recent context:
   `mcp2cli open-brain search_all --params '{"query":"recent session save skippy"}'`

## KB Frequency Weighting

When loading context from Open Brain, prioritize by access frequency:

**Always load (high-frequency):**
- Infrastructure IPs, ports, service locations
- Deploy SOPs and active workflow IDs
- Current project state and blockers

**Load when relevant (medium-frequency):**
- Project-specific decisions and architecture
- Recent session summaries
- Skill-specific reference data

**Skip unless asked (low-frequency):**
- Historical session logs
- Archived decisions
- Completed project context

Use `access_count` from OB search results to gauge frequency. Higher access_count = more
likely to be needed again.

## Report to User

After loading, send a brief status message:
- Active tasks (count + top priority)
- Current score (from SCORECARD.md)
- Last session summary (one line from OB)
- Blockers or carry-forward items
- "Ready. What do you want to work on?"

Do NOT dump raw file contents. Summarize.
