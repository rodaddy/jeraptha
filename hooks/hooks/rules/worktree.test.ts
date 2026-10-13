import { test, expect } from 'claude-code/testing'

const ran = { result: { stdout: 'ran', stderr: '', interrupted: false } }

for (const command of [
  'git worktree add /x -b y origin/main',
  'git -C /work/dev/my-repo worktree add /x',
  'git -c core.x=1 --git-dir=/r/.git worktree remove /x',
  'cd /r && git worktree prune',
  'sudo -u rico git worktree list',
  "bash -lc 'git -C /r worktree move a b'",
  'FOO=1 git worktree add /x',
  "cat > notes.md <<'EOF'\nhello\nEOF\ngit worktree add /x",
  "git -C /r worktree add /x <<'EOF'\nbody\nEOF",
  // PR 916 round 5: a body fed to a shell runs; an unquoted body still expands.
  "bash <<'EOF'\ngit worktree add /x\nEOF",
  "cat <<'EOF' | sudo sh\ngit worktree prune\nEOF",
  'ssh box1 <<EOF\ngit worktree list\nEOF',
  // PR 911 review (sf-chang): the executor must be in the heredoc's own pipeline.
  "cat <<'EOF' | bash\ngit worktree list\nEOF",
  'bash -c : && cat <<EOF | bash\ngit worktree list\nEOF',
  'cat <<EOF |\ngit worktree list\nEOF\nbash',
  'cat <<EOF \\\n| bash\ngit worktree list\nEOF',
  '{ cat <<EOF; } | bash\ngit worktree list\nEOF',
  '(cat <<EOF) | bash\ngit worktree list\nEOF',
  'cat > notes.md <<EOF\n$(git worktree add /x)\nEOF',
  'cat > notes.md <<EOF\nsee `git worktree prune`\nEOF',
  // Arithmetic and parameter expansion are not heredocs.
  'echo $((1<<2))\ngit worktree add /x',
  '((y = 1<<2))\ngit worktree add /x',
  'let z=1<<2\ngit worktree add /x',
  'echo ${x//<</}\ngit worktree add /x',
  // PR 911 review: wrappers, eval, git options that take a value.
  'timeout 30 git worktree add /x',
  'echo /x | xargs git worktree add',
  'eval "git worktree add /x"',
  'git --attr-source HEAD worktree add /x',
  // PR 911 review: a substitution inside double quotes still runs.
  'echo "$(git worktree list)"',
  'p="$(git worktree add ../x -b f)"',
  'echo "`git worktree add ../x`"',
  'WT="$(git worktree list --porcelain)"',
  'echo "$(git worktree add /x -b y)"',
  'echo "`git worktree prune`"',
  'echo $(git worktree list)',
  // PR 911 lead verdict P2: `time` options, sudo/env option values and
  // split-string payloads, and a quoted `)` inside a substitution.
  'time -p git worktree list',
  'time -o /dev/null -p git worktree list',
  'sudo -nu rico git worktree list',
  'sudo -uroot git worktree list',
  'sudo --user=x git worktree list',
  'sudo --user rico git worktree list',
  'sudo -g g -u u git worktree list',
  "env -S 'git worktree list'",
  'env -S "git worktree list"',
  "env --split-string='git worktree list'",
  "env -S'FOO=1 git worktree list'",
  "env -i -S 'sudo -u x git worktree prune'",
  `echo "$(echo ')'; git worktree list)"`,
  `echo "$(printf ')'; git worktree list)"`,
  `echo "$(echo "a)b"; git worktree list)"`,
  // PR 928 review P1: an apostrophe in a heredoc body or a `#` comment inside
  // `"$(...)"` is literal and must not swallow the rest of the line.
  "git commit -m \"$(cat <<'EOF'\nfix: don't drop it\nEOF\n)\" && git worktree list",
  "git commit -m \"$(cat <<'EOF'\nfix: don't drop it\nEOF\n)\"; git worktree add /x -b y",
  "git commit -m \"$(cat <<'EOF'\nfix: don't drop it\nEOF\n)\"\ngit worktree prune",
  'echo "$(true # it\'s\n)"; git worktree list',
  "git commit -m \"$(cat <<'EOF'\nfix: do not drop it\nEOF\n)\" && git worktree list",
  "git commit -m \"$(cat <<-EOF\n\tfix: don't drop it\n\tEOF\n)\" && git worktree list",
  "git commit -m \"$(cat <<'EOF'\nfix: don't drop it\nEOF\n)\" && echo 'x' && git worktree list",
  // PR 928 review (34dca59) P1: `<<` in a nested `$((...))` or `${...}` is not a heredoc.
  'echo "$(echo $((1<<2))\n)"; git worktree list',
  'echo "$(echo ${x//<</}\n)"; git worktree list',
  'echo $(echo $((1<<2))\n); git worktree list',
  'echo $(echo ${x//<</}\n); git worktree list',
  // PR 928 review (a4e6c4f) P1: a `<<` is a heredoc only when its terminator line exists.
  'x="$( (( n = 1<<2 )); echo\n)"; git worktree list',
  'x="$(\n((n = 1<<2))\n)" && git worktree add /x -b y',
  'x="$(for ((i=1<<2; i<0; i++)); do :; done\n)"; git worktree list',
  'x="$(echo $[1<<2]\n)"; git worktree list',
  'cat <<EOF\ngit worktree list',
  // PR 928 review (18cd497c): an arithmetic command or `$[...]` hides no heredoc,
  // even when a later line equals the junk delimiter.
  'x="$( (( n = 1<<2 )); echo\n)"; git worktree list\n2',
  'x="$(for ((i=1<<2; i<0; i++)); do :; done\n)"; git worktree list\n2',
  'x="$(echo $[1<<2]\n)"; git worktree list\n2]',
  // PR 928 review (b2900bb): `((` after any command-start keyword is arithmetic.
  'if ((1<<2)); then :; fi\ngit worktree list\n2',
  'until ((1<<2)); do :; done\ngit worktree add /x -b y\n2',
  'if false; then :; elif ((1<<2)); then :; fi\ngit worktree list\n2',
  'if (( n << step )); then :; fi\ngit worktree list\nstep',
  'time ((1<<2))\ngit worktree list\n2',
  'x="$(if ((n=1<<2)); then :; fi\ngit worktree list\n2\n)"',
  '! ((1<<2)) && :\ngit worktree list\n2',
  // PR 928 review (5e5d3c3): every `((` is arithmetic, wherever it starts.
  'case a in a) ((1<<2));; esac\ngit worktree list\n2',
  'f() ((1<<2))\ngit worktree list\n2',
  'time -p ((1<<2))\ngit worktree list\n2',
  'coproc ((1<<2))\ngit worktree list\n2',
  'x="$(f() ((1<<2))\ngit worktree list\n2\n)"',
  'x="$(time -p ((1<<2))\ngit worktree list\n2\n)"',
  // PR 928 review (1c592dc): a `$(...)` inside `((...))` is shell text, so its
  // `#` comment or heredoc body holds a literal apostrophe.
  "(( x = $(echo 1 # it's\n) )) ; echo ' )) ) <<Z #'\ngit worktree list\nZ",
  "(( x = $(cat <<'E'\ndon't\nE\n) )) ; echo ' )) ) <<Z #'\ngit worktree list\nZ",
  "f() (( x = $(echo 1 # it's\n) )) ; echo ' )) ) <<Z #'\ngit worktree list\nZ",
  "cat <((echo $(echo 1 # it's\n) ) ) ; echo ' )) ) <<Z #'\ngit worktree list\nZ",
  // D1.3/1 (PR 928 P1 at 5bde972): a backtick inside `((...))`, `${...}` or
  // `$((...))` is shell text too; its `#` comment's apostrophe is literal.
  "(( x = `echo 1 # it's` )) ; echo ' )) ) <<Z #'\ngit worktree add x\nZ",
  "echo ${x:-`echo 1 # it's`} ; echo ' } ) <<Z #'\ngit worktree add x\nZ",
  "echo $(( `echo 1 # it's` )) ; echo ' )) ) <<Z #'\ngit worktree add x\nZ",
  "x=\"$( (( x = `echo 1 # it's` )) ; echo ' )) ) <<Z #'\ngit worktree add x\nZ\n)\"",
  // PR 928 final pass: a `case` pattern's `)` inside `"$(...)"` ends the pattern,
  // not the substitution (raised as pre-existing in the 5e5d3c3 and 1c592dc reviews).
  'x="$(case $1 in a) git worktree list;; *) git worktree list;; esac)"',
  'x="$(case $y in a) ((1<<2));; esac\ngit worktree list\n2\n)"',
  'x="$(case a in a) :;; esac; git worktree list)"',
  'x="$(case $y in (a) echo A;; *) echo B;; esac; git worktree list)"',
  'x="$(case $y in\n  a) echo A ;;\n  *) echo B ;;\nesac\ngit worktree list\n)"',
  // PR 928 final pass: an ANSI-C `$'...'` string ends at its unescaped quote, so a
  // `\'` inside it does not open a quote that hides the rest of the line.
  "git commit -m $'fix: don\\'t' && git worktree list",
  "x=$'don\\'t'; git worktree list",
]) {
  test(`denies: ${command}`, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('wt -C <repo> switch --create')
  })
}

for (const command of [
  'wt -C /r switch --create b --no-cd',
  'git status --short',
  'rg -n "git worktree" /r/AGENTS.md',
  'git log --grep worktree',
  'echo git worktree',
  // A heredoc body is data round 12).
  "git commit -F - <<'EOF'\ndocs: git worktree add is refused\nEOF",
  'git commit -F - <<EOF\ngit -C /r worktree add /x\nEOF',
  'cat > notes.md <<-EOF\n\tgit worktree prune\n\tEOF',
  "git commit -m \"$(cat <<'EOF'\ngit worktree add /x\nEOF\n)\"",
  "cat > notes.md <<'EOF'\n$(git worktree add /x)\nEOF",
  "cat > notes.md ${x}<<'EOF'\ngit worktree add /x\nEOF",
  // PR 911 review (sf-chang): an executor in a separate `&&`, `;`, `||` or `&`
  // command does not run the heredoc body.
  "bash -c : && cat <<'EOF'\ngit worktree list\nEOF",
  'ssh h true; cat <<EOF\ngit worktree add /x\nEOF',
  "sh -c x || cat <<'EOF'\ngit worktree prune\nEOF",
  "bash -c : & cat <<'EOF'\ngit worktree list\nEOF",
  "cat <<'EOF' 2>&1 && bash -c :\ngit worktree list\nEOF",
  // Single-quoted text is literal.
  "echo '$(git worktree list)'",
  "echo '`git worktree prune`'",
  // PR 911 lead verdict P2: the surrounding behaviour stays allowed.
  'time -p ls',
  'sudo -u x ls',
  'sudo -uroot ls',
  "env -S 'FOO=1 ls'",
  `echo "$(echo ')')"`,
  `echo "$(echo ')') git worktree"`,
  // PR 928 final pass: `esac` hands the next `)` back to the substitution; `$'...'` is one word.
  'x="$(case $y in a) echo A;; *) echo B;; esac) git worktree"',
  'x="$(case $y in (a) echo A;; *) echo B;; esac)"; echo "$x"',
  "msg=$'fix: don\\'t drop it'; git commit -m \"$msg\"",
  "echo $'git worktree list'",
]) {
  test(`allows: ${command}`, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

// Rico ruling 2026-10-03: `git worktree` is denied everywhere, not only in
// Development and _tmp (SPEC.md, Scope: the worktree rule is global).
test('denies git worktree from a cwd outside Development', async ($, on) => {
  on('session.cwd', () => ({ value: '/Users/me/src/other-repo' }))
  on('tool.call', { tool: 'Bash' }, () => ran)
  const r = await $.tool.call({ tool: 'Bash', command: 'git worktree list' })
  expect(r.deny).toContain('worktrunk')
})

test('denies EnterWorktree from a cwd outside Development', async ($, on) => {
  on('session.cwd', () => ({ value: '/Users/me/src/other-repo' }))
  on('tool.call', { tool: 'EnterWorktree' }, () => ran)
  const r = await $.tool.call({ tool: 'EnterWorktree', name: 'x' } as never)
  expect(r.deny).toContain('worktrunk')
})

test('denies the EnterWorktree tool', async ($, on) => {
  on('tool.call', { tool: 'EnterWorktree' }, () => ran)
  const r = await $.tool.call({ tool: 'EnterWorktree', name: 'x' } as never)
  expect(r.deny).toContain('worktrunk')
})
