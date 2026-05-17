# Paperclip Agent Scoping: Quant Workflow

*What your agents could do, based on what you're already doing manually.*

**Date:** 2026-04-07
**For:** Collaborator
**Status:** Draft for review

---

## What We Looked At

Your Claude Code sessions on cc-collaborator (king-strategies project) -- 21 sessions, daily work from March 26 through April 7. Your CC memory files, your backtest scripts, your research pipeline, your reports.

This isn't theoretical. This is based on YOUR actual workflow.

---

## Your Current Workflow (What We See)

**You spend your time on:**

1. **Running backtests** -- Walleye variants, parameter sweeps, stop-level tuning, portfolio construction. You have 30+ backtest scripts. Each run takes time, you wait for results, analyze output, iterate.

2. **Data work** -- Bloomberg repulls, LME data loading, COT ingestion, inventory tracking, timezone validation. Necessary but repetitive.

3. **Research** -- Alpha hunting across commodities, fundamental data sources (EIA, USDA, exchange data), cross-commodity correlation, regime analysis.

4. **Report generation** -- Session reports, backtest summaries, sweep analysis, strategy documentation (like the Walleye_NG_PL spec).

5. **Strategy iteration** -- Testing hypotheses (risk parity vs fixed lots, contrarian vs momentum, overlay stacking), rejecting what doesn't work, documenting what does.

---

## What Agents Could Automate

### 🤖 Backtest Agent
**What it does:** Runs your existing backtest scripts, collects results, summarizes findings.

**Example tasks you'd assign:**
- "Run Walleye sweep with stop levels 0.2x to 0.4x in 0.05 steps across all 6 commodities"
- "Test adding silver to the Walleye portfolio -- run the standard framework"
- "Re-run the holiday filter analysis with updated 2026 holiday calendar"

**How it works:**
- You assign the task (via dashboard, API, or chat)
- Agent kicks off the script on cc-king or cc-collaborator
- Waits for completion, parses output
- Writes structured results to DB
- Posts summary: "Sweep complete. Best stop: 0.25x (current). Silver Sharpe: 0.93 -- below threshold. Recommend: no add."

**What YOU still do:** Decide what to test, interpret results, make strategy decisions. The agent runs the scripts and organizes the output.

---

### 🤖 Data Agent
**What it does:** Automated data ingestion and quality checks on a schedule.

**Runs automatically (heartbeat/cron):**
- Bloomberg data refresh (daily after market close)
- COT report ingestion (weekly, Friday release)
- Inventory data updates (EIA weekly, LME daily)
- Data quality checks: gap detection, timezone validation, settlement time verification
- Alert on anomalies: missing bars, unusual price moves, data source outages

**What YOU stop doing:** Manual repulls, chasing data issues, remembering to update inventories. The agent handles the plumbing.

---

### 🤖 Research Agent
**What it does:** Researches topics you assign, produces structured reports.

**Base knowledge:** How to research -- source evaluation, report formatting, academic vs practical sources. NOT hard-coded to specific commodities.

**Example tasks:**
- "Research natural gas storage dynamics for Q3 injection season"
- "Find academic papers on commodity momentum factor decay post-2020"
- "Compile fundamental data sources for palladium -- who publishes what, frequency, reliability"

**Domain context (injected per task):**
- Known sources for that commodity (from your existing fundamental data source docs)
- Your prior findings (from CC memory + OB)
- What you already know (so it doesn't repeat old ground)

**Output:** Structured report in your existing format, saved to `.reports/`, findings written to DB for other agents to consume.

---

### 🤖 Risk Agent
**What it does:** Daily portfolio risk assessment from latest positions and market data.

**Runs automatically (daily, post-close):**
- Current portfolio exposure across all 6 Walleye commodities
- Correlation matrix (rolling 20-day) -- flag shifts
- Drawdown tracking vs historical worst
- Vol regime check (are we in high/low vol across the portfolio?)
- Position-level P&L attribution

**Alerts (sent to dashboard or Discord):**
- Correlation spike between portfolio commodities
- Drawdown approaching historical worst
- Vol regime change that affects stop sizing
- Any commodity breaking its historical Sharpe trend

---

### 🤖 Regime Agent
**What it does:** Runs regime inference pipeline and flags changes.

**Runs on schedule (daily or on-demand):**
- Execute your regime inference code (`research/regime/regime_inference.py`)
- Compare current regime classification vs yesterday
- Flag transitions (contango → backwardation, low vol → high vol, etc.)
- Cross-reference with event calendar (USDA reports, FOMC, OPEC)

**Output:**
- Regime state table (all commodities, current classification)
- Transition alerts (what changed and why it matters)
- Strategy impact assessment ("regime shift in NG -- Walleye historically performs X in this regime")

---

## What This DOESN'T Do

- **Make trading decisions** -- agents research and report, YOU decide
- **Execute trades** -- no execution capability, ever
- **Replace your judgment** -- your CC memory literally says "momentum not contrarian" because the agent got it wrong and you corrected it. The agents serve your expertise, not replace it.
- **Work without your input** -- you assign tasks, review output, course-correct

---

## How You'd Interact

**Option A: Dashboard**
- Task assignment panel in king-dashboard
- Results appear in agent cards (replacing current limited agents)
- You see what each agent is working on, last run results, alerts

**Option B: Chat (Discord or direct)**
- Talk to the Quant agent directly: "run a sweep on corn with the Walleye framework"
- Get results back in chat with charts and summaries

**Option C: Automated (cron/heartbeat)**
- Data and Risk agents run on schedule, you just see the output
- Regime agent flags changes, you decide what to act on

**Most likely:** Mix of all three. Automated stuff runs in the background, you assign research/backtest tasks as needed, results show up in dashboard.

---

## Your Existing Knowledge (Already Captured)

From your CC memory, we know:
- All market data is UTC (not ET) -- agents will know this
- NG strategy is momentum, not contrarian -- agents will know this
- 0.25x tight stops are key -- agents will know this
- Risk parity was tested and rejected -- agents won't re-suggest it
- Holiday/weekend filtering improves some commodities, hurts others -- agents will have this context

This domain knowledge becomes the base context for all agents. They start with YOUR expertise, not from scratch.

---

## Next Steps

1. **You tell us:** Which of these is most useful to you RIGHT NOW?
2. **We build that one first** -- get it working, iterate
3. **You use it** -- tell us what's missing, what's wrong, what you'd change
4. **We expand** -- add the next most useful agent
5. **Repeat**

Don't need to build all 5 at once. Start with the one that saves you the most time.

---

*Built on Paperclip (king-agents.example.com). Your agents are already registered and waiting for instructions.*
