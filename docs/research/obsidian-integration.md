# Obsidian Integration Plan

Research date: 2026-02-21

## Why Obsidian

The gist author uses Obsidian as primary knowledge store (2,800+ markdown notes). This aligns with our markdown-first philosophy and existing QMD indexing.

**Current state**: We use PostgreSQL + pgvector as WARM tier, Skippy_matrix markdown as HOT tier. Adding Obsidian gives us a proper markdown-first UI for browsing, linking, and editing knowledge -- something neither PostgreSQL nor SiYuan does as well for pure markdown.

## Proposed Architecture

```
Obsidian Vault (markdown-first UI + storage)
  ├── /Daily/          - Briefings, daily notes
  ├── /Projects/       - Active project notes
  ├── /Research/       - Research output
  ├── /Bookmarks/      - Saved links with frontmatter
  ├── /Learnings/      - Extracted knowledge (from Fabric)
  ├── /Decisions/      - Architecture decisions
  ├── /People/         - Contact notes
  ├── /Ideas/          - Idea capture
  ├── /Diagrams/       - Excalidraw files
  └── Templates/       - Excluded from indexing
         |
         | QMD semantic indexing (nightly 3 AM cron)
         v
  QMD Index (BM25 + vector embeddings)
         |
         | Feed changes to
         v
  PostgreSQL + pgvector (WARM tier, structured queries)
         |
         | Sync active items
         v
  Skippy_matrix (HOT tier, 14 files, 5s sync)
```

## How It Fits

| Tier | Current | With Obsidian |
|------|---------|---------------|
| HOT | Skippy_matrix (markdown) | Skippy_matrix (no change) |
| WARM | PostgreSQL + pgvector | PostgreSQL + pgvector (no change) |
| BROWSE | SiYuan (AttributeView) | **Obsidian vault** (markdown-first) |
| INDEX | QMD (over repo files) | QMD (over Obsidian vault) |
| COLD | Raw sessions (~/.claude/*.jsonl) | Raw sessions (no change) |

Obsidian replaces SiYuan as the browsing/editing layer. SiYuan could stay as a secondary view or be deprecated.

## Obsidian + OpenClaw Integration Points

1. **Capture**: OpenClaw writes markdown files directly to vault directories
2. **Search**: QMD semantic search over vault (already works with markdown)
3. **Briefings**: Morning briefing -> `/Daily/YYYY-MM-DD-briefing.md`
4. **Bookmarks**: Link save -> `/Bookmarks/YYYY-MM-DD-[slug].md` with frontmatter
5. **Research**: Deep research output -> `/Research/YYYY-MM-DD-[topic].md`
6. **Ideas**: Quick capture -> `/Ideas/[slug].md`
7. **Diagrams**: Excalidraw integration (Obsidian plugin)

## Frontmatter Standard

```yaml
---
title: "Article Title"
url: https://example.com/article
tags: [ai, infrastructure, security]
category: bookmark  # bookmark | research | learning | decision | idea
source: discord     # discord | telegram | voice | email | web | manual
created: 2026-02-21
confidence: 0.85    # classification confidence (if auto-classified)
---
```

## Sync Strategy

**Option A: Obsidian as Source of Truth (Recommended)**
- Obsidian vault is the canonical store
- QMD indexes vault nightly (3 AM cron)
- PostgreSQL stores structured metadata + embeddings for fast queries
- Changes in Obsidian propagate to PostgreSQL via sync script
- OpenClaw writes directly to vault

**Option B: PostgreSQL as Source of Truth**
- PostgreSQL is canonical
- Obsidian vault is a rendered view
- Sync script generates markdown from PostgreSQL entries
- More complex, harder to edit in Obsidian

Option A is simpler and more aligned with markdown-first.

## Obsidian Setup

### Install
```bash
# macOS
brew install --cask obsidian
```

### Vault Location
```
~/Documents/SecondBrain/   # or on TrueNAS via SMB mount
```

### Recommended Plugins
- **Excalidraw**: Diagram creation/editing
- **Dataview**: SQL-like queries over frontmatter
- **Templater**: Template automation
- **QuickAdd**: Fast capture with templates
- **Obsidian Git**: Auto-commit vault changes

### QMD Indexing
```bash
# Add to qmd.yaml
collections:
  second-brain:
    path: ~/Documents/SecondBrain
    patterns: ["**/*.md"]
    exclude: [".obsidian/", ".trash/", "Templates/"]
```

### Nightly Rebuild (n8n or cron)
```bash
# 3:00 AM daily
0 3 * * * cd ~/Documents/SecondBrain && qmd update && qmd embed
```

## Open Questions

- [ ] Vault on local disk vs TrueNAS SMB mount? (Latency vs shared access)
- [ ] Keep SiYuan alongside Obsidian or deprecate?
- [ ] iCloud sync for mobile Obsidian access? (Security implications)
- [ ] How does Obsidian Git interact with ggshield? (Secret scanning on vault commits)
