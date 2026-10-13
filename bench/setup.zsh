#!/usr/bin/env zsh
# Create one benchmark round: a worktree per task x setting, from the frozen
# start commit, plus one brief per run.
# Usage: setup.zsh <round-tag> <setting...>
#   e.g. setup.zsh r3 opus-low opus-med sonnet-med
# Environment:
#   BENCH_REPO     the repo the tasks replay in (required)
#   BENCH_BASE     the frozen start commit every run starts from (required)
#   BENCH_SCRATCH  where briefs, commit-message files and lane scratch go
#                  (default: $HOME/bench-scratch)
#   BENCH_TASKS    task ids, space-separated; each needs tasks/<id>.md and an
#                  entry in tasks.mjs (default: every tasks/*.md but _common)
# Worktrees: branch bench-<tag>/<task>-<setting>, placed by wt (worktrunk).
emulate -L zsh
setopt err_exit no_unset pipe_fail

if (( $# < 2 )); then
  print -u2 "usage: setup.zsh <round-tag> <setting...>"
  exit 3
fi
tag=$1
shift
settings=("$@")

harness=${0:A:h}
repo=${BENCH_REPO:?set BENCH_REPO to the repo the tasks replay in}
base=${BENCH_BASE:?set BENCH_BASE to the frozen start commit}
round=${BENCH_SCRATCH:-$HOME/bench-scratch}/bench-$tag
tasks=(${=BENCH_TASKS:-${${(f)"$(print -l $harness/tasks/*.md(N:t:r))"}:#_common}})
mkdir -p $round/briefs $round/msg

# Path of the worktree that has refs/heads/<branch> checked out.
worktree_of() {
  local want="branch refs/heads/$1" line wtpath=''
  for line in ${(f)"$(git -C $repo worktree list --porcelain)"}; do
    [[ $line == worktree\ * ]] && wtpath=${line#worktree }
    [[ $line == $want ]] && { print -r -- $wtpath; return 0 }
  done
  return 1
}

for task in $tasks; do
  for setting in $settings; do
    lane=bench-$tag-$task-$setting
    branch=bench-$tag/$task-$setting
    wt -C $repo switch --create $branch --base $base --no-cd
    wtpath=$(worktree_of $branch)
    mkdir -p $round/$lane
    body=$(<$harness/tasks/$task.md)
    body=${body//'{{LANE}}'/$lane}
    body=${body//'{{WORKTREE}}'/$wtpath}
    body=${body//'{{BRANCH}}'/$branch}
    body=${body//'{{SCRATCH}}'/$round}
    body=${body//'{{HARNESS}}'/$harness}
    print -r -- $body > $round/briefs/$lane.md
    print -r -- "$lane	$wtpath	$round/briefs/$lane.md"
  done
done
