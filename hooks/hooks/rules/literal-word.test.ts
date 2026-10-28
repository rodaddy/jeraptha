import { test, expect } from 'claude-code/testing'

// Loads the mod folder as a session does: the rule must be wired in
// hooks/register.ts. An inline { plugins } register cannot import the rule
// (it closes over nothing of the test file).
const DEV = '/work/dev/jeraptha/hooks'

// The test's own hooks stand for the engine: a session in `cwd`, and a Bash
// tool that records the line that reached it.
function bash(on: any, cwd = DEV) {
  const seen: string[] = []
  on('session.cwd', () => ({ value: cwd }))
  on('tool.call', { tool: 'Bash' }, ($: unknown, e: { command: string }) => {
    seen.push(e.command)
    return { result: { stdout: 'ran', stderr: '', interrupted: false } }
  })
  return seen
}

for (const [command, expected, note] of [
  ['G=git; $G status', 'G=git; git status', 'rewrote $G to git'],
  ['G=git && ${G} log -1', 'G=git && git log -1', 'rewrote $G to git'],
  ['export K=kubectl; $K get pods', 'export K=kubectl; kubectl get pods', 'rewrote $K to kubectl'],
  ["P='/opt/homebrew/bin/rg'; $P -n x", "P='/opt/homebrew/bin/rg'; /opt/homebrew/bin/rg -n x", 'rewrote $P to /opt/homebrew/bin/rg'],
  ['A=git B=wt\n$A status\n$B list', 'A=git B=wt\ngit status\nwt list', 'rewrote $B to wt'],
  ['G=git; cd /r && FOO=1 $G push', 'G=git; cd /r && FOO=1 git push', 'rewrote $G to git'],
  ['G=git; $G status | $G hash-object --stdin', 'G=git; git status | git hash-object --stdin', 'rewrote $G to git'],
  ['G="a;b"; $G', "G=\"a;b\"; 'a;b'", 'rewrote $G to a;b'],
  // 912 round 15: a value shaped like an assignment or a reserved word is
  // quoted, so it stays the command word it was.
  ['G=A=b; $G x', "G=A=b; 'A=b' x", 'rewrote $G to A=b'],
  ['G=if; $G', "G=if; 'if'", 'rewrote $G to if'],
  ['G=done; $G x', "G=done; 'done' x", 'rewrote $G to done'],
  // A rewritten setter between still stops the later use.
  ['A=eval B=git\n$A "$S"\n$B status', 'A=eval B=git\neval "$S"\n$B status', 'rewrote $A to eval'],
] as const) {
  test(`rewrites: ${JSON.stringify(command)}`, async ($, on) => {
    const seen = bash(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
    expect(seen).toEqual([expected])
    expect((r.context ?? []).join('\n')).toContain(`${note}: write literal command words`)
  })
}

for (const command of [
  'git status',
  'G=git $G status', // prefix assignment: not standalone, $G expands to the old value
  'G=git; G=rm; $G -rf x', // assigned again before the use
  'G=git; read G; $G', // touched again before the use
  'G=git; unset G; $G',
  'G=git; : ${G:=rm}; $G',
  'G=$HOME/bin/x; $G', // value expands
  'G=`which git`; $G',
  'G=$(which git); $G',
  'G=~/bin/x; $G',
  'G=g*t; $G',
  "G='git status'; $G", // quoted space: zsh and bash disagree on splitting
  'G=; $G status', // empty value
  'G=git; echo $G', // not the command word
  'G=git; "$G" status', // quoted use
  'G=git; $G/x status', // not exactly $NAME
  '(G=git); $G status', // subshell assignment does not persist
  'G=git | $G status', // pipeline side runs in a subshell
  'G=git & $G status', // backgrounded
  'true && G=git; $G status', // conditional assignment
  'if true; then G=git; fi; $G status',
  'echo x # G=git; $G status', // comment
  'G=git; cat <<EOF\n$G status\nEOF', // heredoc body
  'H=git; $G status', // a different name
  // 912 round 15: a line break after && || | keeps the assignment conditional.
  'true &&\nG=git; $G status',
  'false ||\nG=git; $G status',
  'true |\nG=git; $G status',
  'true && # note\nG=git; $G status',
  // 912 round 15: a command between may set NAME without naming it.
  'G=git; eval "$S"; $G status',
  'G=git; source ./env; $G status',
  'G=git; . ./env; $G status',
  'G=git; read "$N"; $G status',
  'G=git; printf -v "$N" rm; $G status',
  'G=git; declare "$N=rm"; $G status',
  'G=git; builtin read "$N"; $G status',
  'G=git; $X; $G status', // the command between is itself not literal
  // 912 round 15: IFS set earlier splits $G in bash but not in the rewrite.
  'IFS=i; G=git; $G status',
  'G=git; IFS=i; $G status',
  // A declare before the assignment can make NAME a nameref or an integer.
  'declare -n G; G=K; $G status',
  'typeset -i G; G=1; $G status',
]) {
  test(`passes unchanged: ${JSON.stringify(command)}`, async ($, on) => {
    const seen = bash(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
    expect(seen).toEqual([command])
    expect(r.context).toBeUndefined()
  })
}

test('passes unchanged outside Development and _tmp', async ($, on) => {
  const seen = bash(on, '/Users/me/elsewhere')
  await $.tool.call({ tool: 'Bash', command: 'G=git; $G status' })
  expect(seen).toEqual(['G=git; $G status'])
})

test('rewrites under _tmp', async ($, on) => {
  const seen = bash(on, '/work/_tmp/x')
  await $.tool.call({ tool: 'Bash', command: 'G=git; $G status' })
  expect(seen).toEqual(['G=git; git status'])
})

// PR 912 P1: the mod as hooks/register.ts wires it rewrites the line BEFORE the
// gates run, so the worktree gate judges the literal `git worktree add`.
for (const command of ['G=git; $G worktree add /x', 'G=git; $G -C /r worktree add /x']) {
  test(`register order: the gates see the rewrite and deny ${JSON.stringify(command)}`, async ($, on) => {
    const seen = bash(on, '/work/dev/sub')
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('wt -C <repo> switch --create')
    expect(seen).toEqual([])
  })
}

test('passes unchanged when the engine has no session.cwd', async ($, on) => {
  const seen: string[] = []
  on('tool.call', { tool: 'Bash' }, ($: unknown, e: { command: string }) => {
    seen.push(e.command)
    return { result: { stdout: 'ran', stderr: '', interrupted: false } }
  })
  await $.tool.call({ tool: 'Bash', command: 'G=git; $G status' })
  expect(seen).toEqual(['G=git; $G status'])
})
