# How Jeraptha was built

This is the build history of Jeraptha, taken from its git log (34 commits,
2026-04-07 to 2026-10-13), its `CHANGELOG.md`, `hooks/SPEC.md`, the
benchmark results in `bench/results/`, and the project's issue tracker.
This public repository is a one-commit snapshot of the v4 release; the
earlier versions described below lived in the original history.

## The problem

An AI coding agent reads its operating rules from a prompt file, agrees with
them, and breaks them an hour later. The author ran long-lived and
short-lived agents against real infrastructure and kept writing the same
correction into prompts. Jeraptha started from one idea: a rule that matters
should be enforced by code at the moment the agent acts, with a refusal that
names the right command, not restated in a longer prompt.

## Timeline

| Date | Version | What changed |
|---|---|---|
| 2026-04-07 | v0.1.0 | First release: a bootstrap kit for one long-running OpenClaw agent, with hooks, slash commands (`/tasks`, `/score`) and a two-tier "self-surgery" rule (config file hard-blocked, workspace edits need approval plus a backup and changelog). |
| 2026-04-08 | v2.0 / v2.1 | Moved from OpenClaw managed hooks to a typed plugin. Blocking gates, a `/report` skill, one install script, a change SOP and a verification runbook. |
| 2026-04-20 | v2.4 | Gates ported from the author's earlier enforcement work: blocking malformed memory queries, injecting a skill index, a heartbeat gate. |
| 2026-05-17 | v2.5.3 | Sanitised for public release: internal addresses, emails, domains and names removed from strings and docs, with no code change. |
| 2026-05-20 | v3.0 to v3.1.3 | A 906-line `index.js` split into 21 gate modules with shared state; a contradiction gate and an anti-sycophancy gate added; structured leveled logging across all gates; three deadlock fixes. |
| 2026-10-13 | v4.0.0 | A rewrite for Claude Code: twelve rules, each a separately tested hook module, plus a worker-model benchmark harness. |

## Key design decisions

- **Plugin hooks, not managed hooks (v2.1).** All seven early hooks turned
  out never to fire: OpenClaw's managed hooks register through an internal
  path, but the tool-call and prompt-build events only dispatch through the
  typed plugin API. The fix moved everything to `api.on()` and was confirmed
  live. Lesson kept since: prove a hook fires before trusting it.
- **Approval instead of hard blocks where a person can decide (v2.1).** Five
  hard blocks became approval prompts, because the plugin could not see the
  conversation and kept refusing operations the operator had already
  approved. Hard blocks stayed for config edits, secret exposure and rate
  limits.
- **One module per rule (v3.0).** The monolith was split so each gate could
  be read, tested and disabled on its own. The registration layer shrank to
  81 lines.
- **Rules as small tested refusals (v4).** v4 drops the scorecard, heartbeat
  and task-file freshness gates. Nothing in v4 scores the agent. Each rule
  denies, rewrites or loads text and tells the agent what to run instead.
  Machine-specific roots and messages live in one file,
  `hooks/hooks/config.ts`.
- **Private rules left out (v4).** Three rules that only work inside the
  author's own fleet (a forge admin-token gate, a forge API wrapper gate and
  a handover tied to a private watcher) were removed from the public release
  rather than shipped half-working.

## How AI was used to build and check it

Most commits were written with Claude Opus as a pair programmer; the history
carries 31 co-author trailers. Review was done by groups of agents, and the
findings drove releases:

- v3.0 shipped after a five-agent review swarm reported 3 critical, 11 high,
  17 medium, 8 low and 10 informational findings, all fixed before merge.
- v3.1.0 came from a four-agent swarm that audited v3.0 against a new
  OpenClaw release. It found two gates that were dead code (they read
  messages from an event field that no longer existed) and several bypass
  routes in helper functions. Tests went from 226 to 240.
- v3.1.x fixed a per-turn flag that a later swarm pass caught persisting
  across turns.
- The 2026-10-13 public-readiness review produced one follow-up commit that
  clarified benchmark ids, Node versions and test counts, with no behaviour
  change.

The `bench/` harness is itself an AI evaluation: six tasks with known-good
references, re-run by five Claude settings (two rounds) and one Codex
setting (one round), scored by script with hidden checks. The 2026-10-03
results are in `bench/results/2026-10-03.md`. The most telling failure was a
task where the validator passes either way and weaker settings quietly
deleted the probes that prove a delete gate works; v4's assertion guard
refuses exactly that change.

## Testing

- v3.0: 227 tests across 23 files, up from none; 240 at v3.1.0.
- v4.0.0: every rule has a test file run by `claude plugin test .`, 864
  tests at release, plus `node --test` for the `rule-check` CLI.
- Known gap, recorded in the changelog: five compact-save tests fail on the
  Claude Code build used for the release because the test engine returns no
  result for two hook types. They are kept, not deleted.

## What did not work

- Hooks that were registered but never ran (v2.0), found only by checking
  for real firings.
- Hard blocks that trapped the agent on already-approved work (v2.1).
- Freshness gates that deadlocked: the gate blocked the command needed to
  update the file it was checking (v3.1.x, three separate fixes).
- Scoring the agent. The scorecard and heartbeat produced compliance work,
  not better behaviour, and were dropped in v4.

## Current state

v4.0.0 (2026-10-13) is the current release. The source issue tracker shows
setup-gap housekeeping in October 2026 and the removal of a retired runtime
on 2026-10-27, with no open issues.
