# Benchmark run {{LANE}}

This is a controlled re-run of a finished task, to compare models. Do the
task below exactly as written, with these overrides:

- Your worktree is {{WORKTREE}} (branch {{BRANCH}}). Work only there.
- Your lane name is {{LANE}}: your commit message file is
  {{SCRATCH}}/msg/{{LANE}}.txt and your
  scratch directory is {{SCRATCH}}/{{LANE}}/ .
- Do not look at any other branch, worktree, commit or pull request for this
  task. Solve it from the task text and the code.
- Commit locally when done. Never push.

---

# Lane: replace a dead phrase in the docs

Read first: {{HARNESS}}/tasks/_common.md.

Decisions already made:
- Every instruction under `docs/` that still says "old phrase" becomes one
  line pointing at the live rule; do not restate the live rule.
- Touch nothing outside `docs/`.

Predicted size: 3-5 minutes. Past 20 tool calls, stop and report.

Commit: `docs: replace the dead phrase with a pointer to the live rule`.
