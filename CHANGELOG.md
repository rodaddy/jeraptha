# Changelog

## v4.0.0 -- 2026-10-13 -- "Rulings as hooks"

A rewrite, not an upgrade. v3 was an OpenClaw plugin: 21 gates, a behavioral
scorecard and a heartbeat that kept one long-running agent on task. v4 targets
Claude Code and a different problem: an operator running many short-lived
agent sessions and workers, where a rule written in a prompt file gets read,
agreed with, and broken an hour later.

### Changed
- Runtime: Claude Code's plugin hook engine (`tool.call`, `prompt.compose`,
  `session.compact`, `turn.complete`, `attribution.text`) replaces OpenClaw's
  gateway hooks. Install is one entry in `CLAUDE_CODE_PLUGIN_DIRS`.
- Model: each rule is a small, separately tested module that denies, rewrites,
  or loads text, and names the right command in its refusal. The scorecard,
  heartbeat and TASKS.md freshness gates are gone; nothing in v4 scores the
  agent.
- Tests: every rule has a test file run by `claude plugin test .`
  (864 tests at release), plus `node --test` for the CLI.

### Added
- 12 rules: worktree, literal-word, identity, cluster, model-gate,
  visible-lanes, no-tmp, pr-bar, lane-budget, rulings, compact-save,
  worktree-reaper. See `hooks/SPEC.md`.
- `hooks/config.ts`: the roots and messages a user changes for their own
  machine.
- `hooks/bin/rule-check.ts`: the no-tmp decision as a CLI for Codex and Pi
  hooks.
- `bench/`: the worker-model benchmark harness and its 2026-10-03 results.

### Removed
- The v3 OpenClaw plugin, scorecard, heartbeat, task tracker and persona
  workspace files. They remain in the v3 tags of the old history.
- Three rules from the author's private set that only work inside his fleet:
  a forge admin-token gate, a forge API wrapper gate, and an LSP-memory
  handover that needs a private launchd watcher.

### Known issues
- 5 of the compact-save tests fail on the Claude Code build used for this
  release (turn abort and session append hooks in the test engine return no
  result). They fail the same way in the author's private copy; they are kept,
  not deleted.
