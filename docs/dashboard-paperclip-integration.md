# Dashboard ↔ Paperclip Integration Scoping

**Date:** 2026-04-07
**Status:** Draft

---

## Current State

### Dashboard Agents (king-dashboard)
- Has its own agent system: `researchAgents` table, `executeAgent()`, `agentReports`, `agentSources`
- Agents are configured per-commodity with model types and data sources
- Execution: agent runs → LLM call → structured output → report saved to DB → displayed in UI
- UI at `/dashboard/agents` -- list agents, create new, run, view reports
- Individual agent detail at `/dashboard/agents/[id]`
- **Limitation:** Static. Each agent has fixed instructions. No inter-agent communication. No task queue. No heartbeat scheduling. Reports are one-shot, not iterative.

### Paperclip (king-agents.example.com)
- 10 agents registered (Analyst, Strategist, Risk, Research, Quant + Skippy team)
- Heartbeat-based execution model -- agents wake, check inbox, do work, sleep
- Inter-agent messaging (call chains)
- Dynamic task assignment
- `canCreateAgents` flag on Masters for dynamic hiring
- Company ID: `a29d4e8a-6feb-4c58-a3f5-d2a2f3630047`
- API: `http://<SERVICE_HOST>:3100`

---

## Integration Options

### Option A: Dashboard Becomes Paperclip Viewer (Recommended)

**Dashboard reads from Paperclip API instead of its own agents table.**

The dashboard agents page becomes a viewer for Paperclip agent output:

```
Dashboard UI → Paperclip API → Agent data
```

Instead of:
```
Dashboard UI → Own DB → Own executeAgent()
```

**Changes needed:**
1. New API client in dashboard: `src/lib/paperclip/client.ts`
   - `GET /api/companies/:id/agents` → agent list
   - `GET /api/agents/:id` → agent detail + recent issues
   - `POST /api/issues` → create task for agent
   - `GET /api/issues/:id/comments` → agent findings/reports

2. Replace `src/app/dashboard/agents/actions.ts`:
   - `getAgents()` → call Paperclip API instead of own DB
   - `runAgent()` → create Paperclip issue (task) instead of `executeAgent()`
   - `createAgent()` → possibly keep for config, or delegate to Paperclip

3. Agent detail page (`/dashboard/agents/[id]`):
   - Show Paperclip agent's recent issues (tasks completed)
   - Show agent's current status (idle/working)
   - Show inter-agent message history
   - Allow creating new tasks from the UI

4. Keep existing agent reports table for historical data (migration later)

**Pros:**
- Dashboard becomes lightweight (just a viewer)
- All agent logic lives in Paperclip (one place to maintain)
- Inter-agent communication works out of the box
- Dynamic task assignment from UI
- Heartbeat scheduling automatic

**Cons:**
- Network dependency (dashboard → Paperclip API)
- Need to map Paperclip's data model to dashboard's UI
- Historical reports in dashboard DB need migration path

### Option B: Paperclip as Backend, Dashboard Keeps Own Schema

**Dashboard creates Paperclip tasks but stores results in its own DB.**

```
Dashboard UI → Paperclip API (create task) → Paperclip agent works → Webhook back to dashboard → Dashboard DB
```

**Changes needed:**
1. Dashboard sends tasks to Paperclip via API
2. Paperclip agent completes work
3. Webhook or polling syncs results back to dashboard's `agentReports` table
4. Dashboard UI stays the same, reads from own DB

**Pros:**
- Less UI change
- Dashboard stays self-contained for display
- Existing reports schema unchanged

**Cons:**
- Two systems to maintain (sync issues)
- More complexity
- Webhook/polling infrastructure needed

### Option C: Gradual Migration

**Start with Option B, evolve to Option A.**

1. First: dashboard creates Paperclip tasks for new research requests
2. Paperclip agents do the work, results sync back
3. Over time, migrate dashboard to read directly from Paperclip
4. Eventually deprecate dashboard's own agent system

**This is probably the realistic path.**

---

## Paperclip API Endpoints Needed

Based on the dashboard agent UI requirements:

| Dashboard Feature | Paperclip API | Notes |
|-------------------|--------------|-------|
| List agents | `GET /api/companies/:id/agents` | ✅ Already works |
| Agent status | `GET /api/agents/:id` | Need idle/working/error |
| Create task | `POST /api/issues` | Assign to specific agent |
| View results | `GET /api/issues/:id/comments` | Agent writes findings as comments |
| Run history | `GET /api/agents/:id/issues` | Recent completed tasks |
| Create agent | `POST /api/companies/:id/agents` | If allowing from dashboard |

---

## Data Model Mapping

| Dashboard Concept | Paperclip Concept |
|-------------------|-------------------|
| Research Agent | Agent (role: engineer) |
| Agent Report | Issue comment (agent's findings) |
| Agent Run | Issue (assigned task) |
| Model Type | Agent's LLM config |
| Data Sources | Issue context (injected with task) |
| Commodity | Issue label/tag |

---

## UI Mockup (Option A)

### Agents List Page
```
Research Agents (powered by Paperclip)

[Analyst Engineer]     Status: idle     Last task: 2h ago
  └─ "NG momentum analysis" → Sharpe review, vol regime check ✅

[Research Engineer]    Status: working  Current: "Corn Q3 outlook"
  └─ Started 5 min ago, 40% through data collection

[Risk Engineer]        Status: idle     Last task: 6h ago
  └─ "Daily portfolio risk" → No alerts, correlations stable ✅

[Strategist Engineer]  Status: idle     Last task: 1d ago
  └─ "Evaluate palladium addition" → Sharpe 0.93, below threshold ❌

[+ New Task]  [Schedule Routine]
```

### Agent Detail Page
```
Research Engineer

Status: idle
Base instructions: "You are a research engineer..."
Domain context: commodities/natural-gas.md loaded

Recent Tasks:
├─ KIN-7: "Corn Q3 outlook"                    ✅ 2h ago
│  └─ Report: 5 sources, 3 findings, 2 action items
├─ KIN-6: "NG storage dynamics"                ✅ 1d ago  
│  └─ Report: EIA data analysis, seasonal pattern
├─ KIN-5: "Cross-commodity correlation check"  ✅ 2d ago
│  └─ Report: CT-NG correlation rising (0.3→0.5)

[Assign New Task]  [View Full Reports]  [Edit Agent]
```

---

## Next Steps

1. **Team decides:** Option A, B, or C?
2. Build Paperclip API client in dashboard (`src/lib/paperclip/client.ts`)
3. Wire up agents page to read from Paperclip
4. Test with a real task: create issue via UI → agent picks up → results display
5. Iterate based on what's useful vs. noise
