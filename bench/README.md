# Worker model benchmark

This is the benchmark that decided which model and effort the author's agent
fleet uses for worker lanes. It is run on demand, when a new model ships, not
on a schedule.

## What it measures

Which model and effort turns a decided worker brief into a correct, committed
change on the first pass, and how long it takes.

The method:

1. Take tasks your repo already finished, each with a known-good reference
   commit.
2. Freeze one start commit that predates all of them.
3. Write each task as a frozen brief (`tasks/<id>.md`): the same text for
   every model, with the decisions already made, so the run measures
   execution, not design.
4. Write a hidden check per task (`tasks.mjs`) that the worker never sees.
   Before trusting it, prove the scorer passes every reference and fails every
   start point.
5. Replay every task x setting from the start commit in its own worktree, one
   visible agent lane per cell, and score each run by script.

The scorer also reports whether the run committed and which files it touched
outside the task's scope, because a model that does the work but leaves it
uncommitted, or wanders, is a process miss even when the check passes.

## Layout

- `tasks/<id>.md`: the frozen brief per task, with `{{LANE}}`, `{{WORKTREE}}`,
  `{{BRANCH}}`, `{{SCRATCH}}`, `{{HARNESS}}` filled by `setup.zsh`.
  `tasks/example.md` is a template.
- `tasks/_common.md`: the lane rules the 2026-10-03 rounds ran under.
- `tasks.mjs`: the hidden checks, one entry per task id (scope regexes plus a
  `checks` function). Ships with one example.
- `score.mjs`: the scorer.
- `setup.zsh`, `cleanup.zsh`: make and tear down one round of worktrees.
- `results/2026-10-03.md`: the round that set the author's routing.

## Running a round

Needs `git`, `zsh`, Node 22 or later, `rg`, and
[worktrunk](https://github.com/max-sixty/worktrunk) (`wt`) for worktrees.

```sh
export BENCH_REPO=$HOME/src/your-repo   # the repo the tasks replay in
export BENCH_BASE=<start-commit>        # the frozen start commit
export BENCH_SCRATCH=$HOME/bench-scratch

./setup.zsh r1 opus-low opus-med sonnet-med
```

Each line printed is `lane  worktree  brief`. Then run one agent per line,
with model and effort pinned, given only: "Read the brief at <brief path> and
follow it exactly. Your final message is only the RESULTS block the common
rules define." Record lane, model, effort, wall time, tokens and tool calls.
Never cancel a run that already paid.

Score every run (the task id is read from the worktree name):

```sh
node score.mjs <worktree>...
```

Output per run: `run task pass checks committed files out_of_scope detail`.
Write `results/<date>.md`, then `./cleanup.zsh r1`: it saves each run's full
diff to `$BENCH_SCRATCH/bench-r1/patches/`, removes the worktree and deletes
the local branch.

## Adding a task

A task needs a reference commit, a brief in `tasks/<id>.md`, an entry in
`tasks.mjs`, and a check that the scorer fails at the start commit and passes
at the reference. When a task's files move on your main branch the replay
still starts at the frozen commit, so tasks do not go stale.

## 2026-10-03 result

Column headers are the task ids of the private benchmark set (see "What is
not here"). o = pass, x = fail; two characters = round 1, round 2. Full write-up,
including what each failure was: `results/2026-10-03.md`.

| Setting | Pass | 829 | 835 | 836 | 837 | 838 | 832 | Median s | p90 s | Calls/run |
|---|---|---|---|---|---|---|---|---|---|---|
| Opus medium | 11/12 | oo | oo | oo | xo | oo | oo | 106 | 147 | 17 |
| Fable medium | 10/12 | oo | xo | oo | oo | oo | ox | 235 | 317 | 17 |
| Opus low | 9/12 | oo | xx | xo | oo | oo | oo | 75 | 141 | 12 |
| Sonnet medium | 9/12 | oo | xx | oo | oo | oo | ox | 71 | 145 | 14 |
| Sonnet low | 7/12 | oo | xx | xo | oo | oo | xx | 65 | 102 | 11 |
| Sol high (Codex) | 4/6 | o | x | o | x | o | o | 605 | 937 | 25 |

## What is not here

The six 2026-10-03 tasks replay inside the author's private tooling repo, so
their briefs, issue texts and hidden tests are not published; the method,
the scorer, the round scripts and the results are. With one repo and two runs
per cell this is a small sample: it was enough to pick a routing, not to rank
models in general.
