// node --test bin/rule-check.spec.ts -- runs the CLI as Codex and Pi would.
// Named .spec.ts, not .test.ts: `claude plugin test .` loads every *.test.ts
// under the mod as a hooks module, which may not import node: modules.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'rule-check.ts')
const DEV = '/work/dev/my-repo'
const OUT = '/work/dev'

function run(harness: string, stdin: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [CLI, '--harness', harness], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: '/work/_tmp/Development/_scratch', ...env },
  })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}
const codex = (p: unknown) => run('codex', JSON.stringify(p))
const pi = (p: unknown) => run('pi', JSON.stringify(p))
const patch = (...lines: string[]) => `*** Begin Patch\n${lines.join('\n')}\n*** End Patch\n`

function blockedCodex(r: ReturnType<typeof run>) {
  assert.equal(r.code, 0)
  const out = JSON.parse(r.stdout)
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /\/tmp is denied/)
}
function allowed(r: ReturnType<typeof run>) {
  assert.equal(r.code, 0)
  assert.equal(r.stdout, '')
}

// Codex PreToolUse
for (const [label, p] of [
  ['Bash redirect', { tool_name: 'Bash', cwd: DEV, tool_input: { command: 'echo hi > /tmp/x' } }],
  ['exec_command', { tool_name: 'exec_command', cwd: DEV, tool_input: { cmd: 'ls | tee /private/tmp/ls.txt' } }],
  ['functions.exec_command', { tool_name: 'functions.exec_command', cwd: DEV, tool_input: { command: 'cp a /tmp/' } }],
  ['Shell argv', { tool_name: 'Shell', cwd: DEV, tool_input: { command: ['bash', '-lc', 'echo hi > /tmp/x'] } }],
  ['apply_patch Add', { tool_name: 'apply_patch', cwd: DEV, tool_input: { input: patch('*** Add File: /tmp/x', '+hi') } }],
  ['apply_patch Update', { tool_name: 'functions.apply_patch', cwd: DEV, tool_input: { patch: patch('*** Update File: /private/tmp/y.ts', '@@', '-a', '+b') } }],
  ['apply_patch Delete', { tool_name: 'apply_patch', cwd: DEV, tool_input: patch('*** Delete File: /tmp/z') }],
  ['apply_patch through the shell', { tool_name: 'exec_command', cwd: DEV, tool_input: { cmd: `apply_patch <<'EOF'\n${patch('*** Add File: /tmp/x', '+hi')}EOF` } }],
  ['Write', { tool_name: 'Write', cwd: DEV, tool_input: { file_path: '/tmp/x.md', content: 'x' } }],
  // PR 914 f367c3b review (D1.3/9 carried findings).
  ['apply_patch argv through the shell tool', { tool_name: 'exec_command', cwd: DEV, tool_input: { command: ['apply_patch', patch('*** Add File: /tmp/x', '+hi')] } }],
  ['applypatch heredoc', { tool_name: 'exec_command', cwd: DEV, tool_input: { cmd: `applypatch <<'EOF'\n${patch('*** Add File: /tmp/x', '+hi')}EOF` } }],
  ['Move to /tmp', { tool_name: 'apply_patch', cwd: DEV, tool_input: { input: patch('*** Update File: src/a.ts', '*** Move to: /tmp/x', '@@', '-a', '+b') } }],
  ['relative write in a /tmp workdir', { tool_name: 'exec_command', cwd: DEV, tool_input: { cmd: 'echo hi > x', workdir: '/tmp' } }],
  ['relative patch path in a /tmp workdir', { tool_name: 'exec_command', cwd: DEV, tool_input: { command: ['apply_patch', patch('*** Add File: x', '+hi')], workdir: '/tmp' } }],
  ['zsh -c argv', { tool_name: 'Shell', cwd: DEV, tool_input: { command: ['/bin/zsh', '-c', 'echo hi > /tmp/x'] } }],
  ['plain argv writing /tmp', { tool_name: 'Shell', cwd: DEV, tool_input: { command: ['tee', '/tmp/x'] } }],
  ['relative patch path from a cwd under /tmp', { tool_name: 'apply_patch', cwd: '/work/_tmp/../../../tmp', tool_input: { input: patch('*** Add File: x', '+hi') } }],
] as const) {
  test(`codex denies: ${label}`, () => blockedCodex(codex(p)))
}

for (const [label, p] of [
  ['Bash read of /tmp', { tool_name: 'Bash', cwd: DEV, tool_input: { command: 'cat /tmp/x' } }],
  ['Bash write in the repo', { tool_name: 'Bash', cwd: DEV, tool_input: { command: 'echo hi > out.txt' } }],
  ['apply_patch inside the worktree', { tool_name: 'apply_patch', cwd: DEV, tool_input: { input: patch('*** Add File: src/x.ts', '+hi', '*** Update File: /work/_tmp/d/r/y.md') } }],
  ['own TMPDIR under _tmp', { tool_name: 'Bash', cwd: DEV, tool_input: { command: 'echo hi > $TMPDIR/x' } }],
  // round 12: a heredoc body is data, not a write.
  ['quoted heredoc body naming /tmp', { tool_name: 'Bash', cwd: DEV, tool_input: { command: "cat > docs/example.md <<'EOF'\necho hi > /tmp/example\nEOF" } }],
  // PR 914 review: patch text in a documentation heredoc is not an executed apply_patch.
  ['patch example in a documentation heredoc', { tool_name: 'exec_command', cwd: DEV, tool_input: { cmd: "cat > docs/patch-example.md <<'EOF'\n*** Begin Patch\n*** Add File: /tmp/example\n+hello\n*** End Patch\nEOF" } }],
  ['/tmp write outside the scope',{ tool_name: 'Bash', cwd: '/Users/me/elsewhere', tool_input: { command: 'echo hi > /tmp/x' } }],
  ['Write in the repo', { tool_name: 'Write', cwd: OUT, tool_input: { file_path: `${OUT}/x.md` } }],
  // A non-shell argv is words, never re-parsed as shell (PR 914 review).
  ['argv word holding a redirect', { tool_name: 'Shell', cwd: DEV, tool_input: { command: ['echo', 'hi > /tmp/x'] } }],
  ['python -c is not a shell script', { tool_name: 'Shell', cwd: DEV, tool_input: { command: ['python3', '-c', 'echo hi > /tmp/x'] } }],
] as const) {
  test(`codex allows: ${label}`, () => allowed(codex(p)))
}

// Pi tool_call, as the extension sends it
for (const [label, p] of [
  ['bash redirect', { toolName: 'bash', cwd: DEV, input: { command: 'echo hi > /tmp/x' } }],
  ['bash cd then relative', { toolName: 'bash', cwd: DEV, input: { command: 'cd /tmp && echo hi > f' } }],
  ['heredoc header writing /tmp', { toolName: 'bash', cwd: DEV, input: { command: "cat > /tmp/example <<'EOF'\nhello\nEOF" } }],
  ['write', { toolName: 'write', cwd: DEV, input: { path: '/tmp/x.md', content: 'x' } }],
  ['edit', { toolName: 'edit', cwd: DEV, input: { path: '/private/tmp/x.ts', oldText: 'a', newText: 'b' } }],
  // Pi path spellings (PR 914 review): @-prefixed and file:// URLs.
  ['write @/tmp/x', { toolName: 'write', cwd: DEV, input: { path: '@/tmp/x', content: 'x' } }],
  ['write file:///tmp/x', { toolName: 'write', cwd: DEV, input: { path: 'file:///tmp/x', content: 'x' } }],
] as const) {
  test(`pi denies: ${label}`, () => {
    const r = pi(p)
    assert.equal(r.code, 2)
    assert.match(r.stdout, /\/tmp is denied/)
  })
}

for (const [label, p] of [
  ['bash read', { toolName: 'bash', cwd: DEV, input: { command: 'rg foo /tmp/log' } }],
  ['write in the repo', { toolName: 'write', cwd: DEV, input: { path: 'src/x.ts', content: 'x' } }],
  ['read tool', { toolName: 'read', cwd: DEV, input: { path: '/tmp/x' } }],
  // The verdict's case round 12): only docs/example.md is written.
  ['quoted heredoc body naming /tmp', { toolName: 'bash', cwd: DEV, input: { command: "cat > docs/example.md <<'EOF'\necho hi > /tmp/example\nEOF" } }],
] as const) {
  test(`pi allows: ${label}`, () => allowed(pi(p)))
}

test('pi denies: write ~/x when HOME is under /tmp', () => {
  const r = run('pi', JSON.stringify({ toolName: 'write', cwd: DEV, input: { path: '~/x', content: 'x' } }), { HOME: '/private/tmp/home' })
  assert.equal(r.code, 2)
  assert.match(r.stdout, /\/tmp is denied/)
})

// A dangling link denies, as in the Claude hook: realpathSync throws on it.
test('pi denies: write through a dangling link', t => {
  const dir = mkdtempSync(join(dirname(CLI), '.spec-link-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  symlinkSync('/tmp/rule-check-spec-missing/new.txt', join(dir, 'out.txt'))
  const r = pi({ toolName: 'write', cwd: DEV, input: { path: join(dir, 'out.txt'), content: 'x' } })
  assert.equal(r.code, 2)
  assert.match(r.stdout, /leads nowhere/)
})

// Fail open
for (const [label, harness, stdin] of [
  ['malformed JSON (codex)', 'codex', '{not json'],
  ['malformed JSON (pi)', 'pi', 'nope'],
  ['empty stdin', 'codex', ''],
  ['JSON array', 'pi', '[1,2]'],
  ['unknown tool', 'codex', JSON.stringify({ tool_name: 'WebFetch', cwd: DEV, tool_input: { url: 'x' } })],
  ['bash without a command', 'pi', JSON.stringify({ toolName: 'bash', cwd: DEV, input: {} })],
  ['unknown harness', 'claude', JSON.stringify({ tool_name: 'Bash', cwd: DEV, tool_input: { command: 'echo > /tmp/x' } })],
] as const) {
  test(`fails open: ${label}`, () => {
    const r = run(harness, stdin)
    allowed(r)
    assert.equal(r.stderr.trim().split('\n').length, 1)
    assert.match(r.stderr, /^rule-check: .*\(allowed\)/)
  })
}
