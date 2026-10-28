import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

// Loads the mod folder as a session does: identity(on) must be wired in
// hooks/register.ts. An inline { plugins } register is serialized alone, so
// it cannot call the imported rule (the loader refuses it).
const ran = { result: { stdout: 'ran', stderr: '', interrupted: false } }
const DEV = '/work/dev/my-repo'
const MODEL = 'claude-opus-5-5'
const LINE = `Agent: claude-code · ${MODEL} · my-repo head`

/** The tool and the session beneath the plugin: cwd, model, and a few files. */
function seat(on: On, cwd = DEV, files: Record<string, string> = {}) {
  on('tool.call', { tool: 'Bash' }, () => ran)
  on('session.cwd', () => ({ value: cwd }))
  on('session.model', () => ({ value: MODEL }))
  on('fs.read', ($, e, next) => (e.path in files ? { value: files[e.path] } : next(e)))
}

const ok = `fix(x): thing\n\n${LINE}`
const heredocMsg = (body: string) => `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`

// attribution.text

test('commit trailer is the Agent line', async ($, on) => {
  seat(on)
  on('attribution.text', () => ({ text: 'Claude-Session: https://claude.ai/code/x' }))
  const r = await $.attribution.text({ kind: 'commit', text: 'Claude-Session: https://claude.ai/code/x' })
  expect(r.text).toBe(LINE)
})

test('PR footer is empty', async ($, on) => {
  seat(on)
  on('attribution.text', () => ({ text: 'https://claude.ai/code/x' }))
  const r = await $.attribution.text({ kind: 'pr', text: 'https://claude.ai/code/x' })
  expect(r.text).toBe('')
})

test('other attribution kinds pass through', async ($, on) => {
  seat(on)
  on('attribution.text', ($, e) => ({ text: e.text }))
  const r = await $.attribution.text({ kind: 'remedy', text: 'as composed' })
  expect(r.text).toBe('as composed')
})

test('outside Development the commit trailer passes through', async ($, on) => {
  seat(on, '/Users/me/elsewhere')
  on('attribution.text', ($, e) => ({ text: e.text }))
  const r = await $.attribution.text({ kind: 'commit', text: 'Claude-Session: x' })
  expect(r.text).toBe('Claude-Session: x')
})

// tool.call Bash: denies

for (const command of [
  'git commit -m "fix(x): thing"',
  'git commit -am "fix(x): thing"',
  "git commit --message='fix(x): thing'",
  'git -C /r commit --message "fix(x): thing" -m "body"',
  'cd /r && git add a && git commit -m "fix: a"',
  heredocMsg('fix(x): thing\n\nno agent line here'),
  'git commit -m "fix: x" -m "  Agent: indented does not count"',
  // PR 911 review P1: the prefix alone, or a line missing fields, is not the line.
  'git commit -m "fix: x\n\nAgent: "',
  'git commit -m "fix: x\n\nAgent: claude-code"',
  'git commit -m "fix: x\n\nAgent: claude-code · claude-opus-5-5"',
  'git commit -m "fix: x\n\nAgent: claude-code ·  · seat"',
  // P2: a quoted phrase in the heredoc body splits the -m token; the body is still read.
  heredocMsg('fix(x): thing\n\nsay "two words" here\nno agent line'),
  // P2: an empty --trailer is not the line.
  'git commit -m "fix: x" --trailer "Agent: "',
  'git commit -m "fix: x" --trailer=Agent:',
]) {
  test(`denies, no Agent line: ${command}`, async ($, on) => {
    seat(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain(LINE)
  })
}

for (const command of [
  `git commit -m "${ok}\nClaude-Session: https://claude.ai/code/session_x"`,
  heredocMsg(`${ok}\n\nClaude-Session: https://claude.ai/code/session_x`),
  // PR 911 review P1: git appends every --trailer, not only Agent.
  'git commit -m "fix: x" --trailer "Agent: claude-code · m · s" --trailer "Claude-Session: https://claude.ai/code/x"',
  'git commit -m "fix: x" --trailer "Agent: claude-code · m · s" --trailer=Claude-Session=https://claude.ai/code/x',
]) {
  test(`denies, session link: ${command}`, async ($, on) => {
    seat(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('Claude-Session:')
    expect(r.deny).not.toContain('add this line')
  })
}

test('denies both reasons at once', async ($, on) => {
  seat(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "x\n\nClaude-Session: y"' })
  expect(r.deny).toContain(LINE)
  expect(r.deny).toContain('remove the `Claude-Session:` line')
})

test('denies a -F file without the line, read through $.fs', async ($, on) => {
  seat(on, DEV, { '/r/msg.txt': 'fix: x\n' })
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -F /r/msg.txt' })
  expect(r.deny).toContain(LINE)
})

test('denies a relative --file under git -C', async ($, on) => {
  seat(on, DEV, { '/r/msg.txt': `${ok}\nClaude-Session: x\n` })
  const r = await $.tool.call({ tool: 'Bash', command: 'git -C /r commit --file=msg.txt' })
  expect(r.deny).toContain('Claude-Session:')
})

test('denies -F - fed by a heredoc without the line', async ($, on) => {
  seat(on)
  const r = await $.tool.call({ tool: 'Bash', command: "git commit -F - <<'EOF'\nfix: x\nEOF" })
  expect(r.deny).toContain(LINE)
})

test('the seat is the cwd basename under _tmp too', async ($, on) => {
  seat(on, '/work/_tmp/dev/repo')
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  expect(r.deny).toContain(`Agent: claude-code · ${MODEL} · repo head`)
})

// tool.call Bash: allows

for (const command of [
  `git commit -m "${ok}"`,
  `git commit -m "fix(x): thing" -m "${LINE}"`,
  heredocMsg(ok),
  heredocMsg(`fix(x): thing\n\nsay "two words" here\n\n${LINE}`),
  'git commit -m "fix: x\n\nAgent: codex · gpt-6.1-sol · fix-911 lane"',
  'git commit -m "fix: x" --trailer "Agent: claude-code · m · s"',
  'git commit -m "fix: x" --trailer="Agent=claude-code · m · s"',
  'git commit -m "fix: x" --trailer "Agent: claude-code · m · s" --trailer "Refs: #911"',
  'git commit --amend --no-edit',
  'git commit -C HEAD',
  'git commit -c ORIG_HEAD',
  'git commit --reuse-message=HEAD',
  'git commit',
  'git commit -m "$MSG"',
  'git commit -F -',
  'git commit -F /missing/file',
  'git -c commit.gpgsign=false log -m',
  'git log --grep "Claude-Session:"',
  'echo git commit -m x',
  'rg -n "git commit -m" /r',
]) {
  test(`allows: ${command}`, async ($, on) => {
    seat(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

test('allows a -F file with the line', async ($, on) => {
  seat(on, DEV, { '/r/msg.txt': `${ok}\n` })
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -F /r/msg.txt' })
  expect(r.deny).toBeUndefined()
})

test('allows -F - fed by a heredoc with the line', async ($, on) => {
  seat(on)
  const r = await $.tool.call({ tool: 'Bash', command: `git commit -F - <<'EOF'\n${ok}\nEOF` })
  expect(r.deny).toBeUndefined()
})

test('allows any commit outside Development and _tmp', async ($, on) => {
  seat(on, '/Users/me/elsewhere')
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "x\n\nClaude-Session: y"' })
  expect(r.deny).toBeUndefined()
})
