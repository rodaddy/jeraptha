#!/usr/bin/env zsh
# Tear down one benchmark round made by setup.zsh: save each run's diff from
# the start commit (committed, staged, unstaged and untracked) to
# <scratch>/bench-<tag>/patches/<lane>.patch, then remove the worktree and
# delete its local branch. Score the round BEFORE running this.
# Usage: cleanup.zsh <round-tag>   (same BENCH_* environment as setup.zsh)
emulate -L zsh
setopt err_exit no_unset pipe_fail

if (( $# != 1 )); then
  print -u2 "usage: cleanup.zsh <round-tag>"
  exit 3
fi
tag=$1

repo=${BENCH_REPO:?set BENCH_REPO to the repo the tasks replay in}
base=${BENCH_BASE:?set BENCH_BASE to the frozen start commit}
patches=${BENCH_SCRATCH:-$HOME/bench-scratch}/bench-$tag/patches
mkdir -p $patches

# Collect worktree path + branch pairs for this round first; removing while
# reading the list would shift it.
typeset -a paths branches
wtpath=''
for line in ${(f)"$(git -C $repo worktree list --porcelain)"}; do
  [[ $line == worktree\ * ]] && wtpath=${line#worktree }
  if [[ $line == "branch refs/heads/bench-$tag/"* ]]; then
    paths+=($wtpath)
    branches+=(${line#branch refs/heads/})
  fi
done

if (( ${#paths} == 0 )); then
  print -u2 "cleanup.zsh: no worktrees on bench-$tag/* branches"
  exit 1
fi

for i in {1..${#paths}}; do
  p=$paths[$i]
  b=$branches[$i]
  lane=bench-$tag-${b#bench-$tag/}
  # Intent-to-add makes untracked files show in the diff; a node_modules link
  # a worktree hook creates is not the run's work.
  git -C $p add --intent-to-add -- . ':(exclude)**/node_modules'
  git -C $p diff --binary $base > $patches/$lane.patch
  wt -C "$repo" remove --yes --foreground --force -D "$b"
  print -r -- "$lane	removed	$patches/$lane.patch"
done
