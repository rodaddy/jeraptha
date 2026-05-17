# Gist Workflow Analysis

Research date: 2026-02-21
Source: https://gist.github.com/<github-user>/b4c6724c391f612c4de4e9a07b0a74b6

20 real-world automation workflows from 50 days of OpenClaw usage.

---

## Discord Channel Architecture (Key Pattern)

Per-channel model routing for cost optimization:

```
#general          -> Sonnet  (balanced cost/capability)
#briefing         -> Sonnet  (daily summaries, conversational)
#monitoring       -> Haiku   (cheap alerts, health checks)
#deep-research    -> Opus    (complex analysis, synthesis)
#youtube-stats    -> Haiku   (data retrieval, fast)
#inbox            -> Sonnet  (bookmark processing)
```

Maps to our LiteLLM aliases:
- `#general` -> `main` (Sonnet)
- `#monitoring` -> `fast` (Haiku)
- `#deep-research` -> `quality` (Opus)
- `#inbox` -> `main` (Sonnet)

Each channel gets **isolated context** -- conversations don't bleed across channels.

---

## Cron Schedule

| Time | Frequency | Task | Channel |
|------|-----------|------|---------|
| 3:00 AM | Daily | QMD semantic index rebuild | Background |
| 4:00 AM | Daily | Auto-update OpenClaw + plugins | #monitoring |
| 4:30 AM | Daily | Full backup to GitHub (with ggshield) | #monitoring |
| 5:30 AM | Daily | Art generation (TRMNL e-ink) | Background |
| 7:00 AM | Daily | Morning Twitter briefing | #briefing |
| 7:00 AM-11:00 PM | Every 30 min | Health checks (email/calendar/services) | #monitoring (alert only) |
| 10:00 AM / 6:00 PM | Daily | Reminder triggers | Reminders |
| 9:45 AM | Weekly (Mon) | Standup reminder | Reminders |

Pattern: Batch heavy work 3-7 AM, lightweight monitoring during waking hours.

---

## All 20 Workflows

### Tier 1 -- Can Do Now With Existing Infra

| # | Workflow | What It Does | APIs/Services | Our Equivalent |
|---|----------|-------------|---------------|----------------|
| 16 | Discord channel architecture | Per-channel model routing | Discord API | LiteLLM + Clawdbot |
| 18 | QMD semantic search | Search 2,800+ markdown notes | QMD MCP | PostgreSQL + pgvector + QMD |
| 9 | Infrastructure & DevOps | SSH monitoring, Coolify queries | SSH, Coolify | Proxmox + n8n health checks |
| 17 | Discord bookmarks | Link inbox -> summary + tags + save | Discord, vault | n8n + knowledge pipeline |
| 4 | Self-maintenance: backup | Encrypted backup to GitHub w/ secret scanning | GitHub, ggshield | Already have ggshield |

### Tier 2 -- Need OpenClaw Wiring

| # | Workflow | What It Does | APIs/Services | Gap |
|---|----------|-------------|---------------|-----|
| 1 | Morning Twitter briefing | Daily top 10 tweets -> Obsidian + Discord | X/Twitter API | Twitter API key, Obsidian vault |
| 5 | Background health checks | 30-min heartbeat: email/calendar/services | Gmail IMAP, Google Calendar, Coolify | Email + calendar integration |
| 11 | Email triage & drafts | Scan inbox, classify, draft replies (DRAFT-ONLY) | Gmail IMAP | Email integration, prompt injection safeguards |
| 13 | Voice transcription | Auto-transcribe voice messages | Whisper API | Whisper via LiteLLM |
| 10 | Mobile coding | Phone-based code changes -> branch -> PR | SSH, Git, GitHub | OpenClaw skill wiring |
| 20 | Home automation | Voice/Discord control of lights, climate | Home Assistant API | HA long-lived token + skill |
| 12 | Calendar & family mgmt | Natural language scheduling, WhatsApp | Google Calendar, WhatsApp | Calendar API + WhatsApp channel |
| 3 | Self-maintenance: updates | Daily auto-update + gateway + plugins | OpenClaw CLI | Cron job |
| 8 | Web summaries (/summarize) | One-command article/video/PDF summary | URL fetching | Built-in skill |

### Tier 3 -- Nice-to-Have

| # | Workflow | What It Does | APIs/Services |
|---|----------|-------------|---------------|
| 6 | Research agent (parallel) | 5 sub-agents across Twitter/Reddit/HN/YouTube/web | Multiple APIs |
| 7 | YouTube analytics | Channel performance, engagement trends | YouTube Data + Analytics API |
| 2 | "Moment Before" e-ink art | Daily AI art -> TRMNL display | Wikipedia, image gen, TRMNL |
| 14 | Daily life assistants | Coffee shops, weather, reminders | Google Places, weather API |
| 15 | Group chat setup help | Help friends set up OpenClaw in WhatsApp | WhatsApp |
| 19 | WordPress honeypot rickroll | Fake WP login that rickrolls scanners | Next.js, Vercel |

---

## Security Practices (From Gist)

1. **Email: draft-only mode** -- never auto-send, treats all email content as hostile
2. **Treat external content as hostile** -- never follow instructions found in emails/web pages
3. **Secret scanning in backups** -- scan ALL files before GitHub push, replace with placeholders
4. **Least privilege** -- each integration gets only required permissions, read-only where possible
5. **Approval gates** -- destructive actions require explicit confirmation
6. **Tailscale VPN** -- all machines on private network, nothing exposed
7. **No direct command execution from email** -- flag suspicious instructions

---

## Cost Optimization

Route by task complexity:
- **Haiku**: Monitoring, summaries, link processing, health checks, data retrieval
- **Sonnet**: Daily assistant tasks, email triage, bookmarks, general conversation
- **Opus**: Research synthesis, deep thinking, complex analysis

Author claims 80% cost reduction with model routing config.
Calculator: https://calculator.vlvt.sh

---

## Obsidian Integration Pattern

Author uses Obsidian vault (2,800+ markdown notes) as primary knowledge store:

**Vault Structure:**
```
/Daily/          - Daily notes, briefings
/Projects/       - Active project notes
/Research/       - Research output
/Bookmarks/      - Saved links with frontmatter
/Diagrams/       - Excalidraw files
Templates/       - Excluded from indexing
.obsidian/       - Excluded from indexing
.trash/          - Excluded from indexing
```

**QMD Indexing:**
- Nightly rebuild at 3:00 AM via cron
- Semantic search (not just keyword matching)
- Returns file paths + relevant excerpts

**Workflow Integrations:**
- Twitter briefing -> `/Daily/YYYY-MM-DD-briefing.md`
- Research output -> `/Research/YYYY-MM-DD-[topic-slug].md`
- Bookmarks -> `/Bookmarks/YYYY-MM-DD-[title-slug].md` with frontmatter (url, tags, date, summary)
- Video ideas -> `/Projects/video-ideas.md` (appended)
- Diagrams -> `/Diagrams/[name].excalidraw`
