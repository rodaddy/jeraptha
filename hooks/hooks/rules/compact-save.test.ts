import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { noteText, handoffDir, inScope, rolloverPrompt, rolloverSkip, HANDOFF_PROMPT, callInput, cutTurnSection, pausedText, MAX_HANDOFFS, idlePausedText, idleWhy, IDLE_CANCELLED, handoverPrompt, menuQuestion } from './compact-save.ts'

// Loads the mod folder as a session does: compactSave(on) is wired in
// hooks/register.ts. The test's hooks stand for the engine: the cwd, a file
// system that records writes, the fork, the log, the timer, /clear, the
// prompt box, and the compaction itself.
// session.append cannot be faked in this kit: a test hook that answers
// without next is skipped, and nothing sits beneath next. So the append is
// seen as the rule's logged refusal naming the handoff path, and the note's
// text is tested through the pure helper.
const REPO = '/work/dev/my-repo'
const DIR = '/work/_tmp/development/my-repo/_handoff'
const HEADER = '# Pre-compaction handoff (model-written, unverified: check claims against git, Forge and the files before acting)'
const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// A compaction runs over, and leaves, at least one message.
const MSGS = [{ role: 'user' as const, text: 'hi', toolUses: [] }]

type World = {
  writes: { path: string; text: string }[]
  logs: string[]
  compacted: number
  forks: number
  timers: number[]
  commands: string[]
  submits: string[]
  entered: string[]
  order: string[]
  instructions: (string | undefined)[]
  now: number
  sessionId: string
  idle: (() => void)[]
  prompts: string[]
  forkHeld: (() => void)[]
  promptHeld: (() => void)[]
}
// The idle timer at the defaults: a 3600 s cache TTL less a 600 s margin.
const IDLE_MS = (3600 - 600) * 1000
const appends = (w: World) => w.logs.filter(l => l.startsWith('compact-save: note for '))

// The scheduled callback runs once the timer dispatch resolves; let it finish.
async function settle(w: World, want: number) {
  for (let i = 0; i < 200 && w.submits.length + w.logs.filter(l => l.includes('/clear failed')).length < want; i++) {
    await new Promise(r => setTimeout(r, 5))
  }
}

function world(
  on: On,
  opts: { cwd?: string; gitDirs?: string[]; answered?: boolean; forkText?: string; readBack?: string; skip?: boolean; writeFails?: boolean; latestFails?: boolean; clearFails?: boolean; abortFails?: boolean; dropIf?: string; holdIf?: string; store?: Record<string, unknown>; tokens?: number | null; holdIdle?: boolean; holdFork?: boolean; env?: Record<string, string>; agents?: { status: string }[] } = {},
): World {
  const w: World = { writes: [], logs: [], compacted: 0, forks: 0, timers: [], commands: [], submits: [], entered: [], order: [], instructions: [], now: Date.UTC(2026, 9, 3, 12, 0, 0), sessionId: 'old-session-1', idle: [], prompts: [], forkHeld: [], promptHeld: [] }
  // The live context size; null: the engine reports none.
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: opts.tokens === null ? undefined : (opts.tokens ?? 1000), window: 1_000_000 }, rateLimits: [], cost: { usd: 0 } } }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('env.get', (_$, e) => ({ value: opts.env?.[e.name] }))
  on('agent.list', () => ({ value: opts.agents ?? [] }) as never)
  const gitDirs = opts.gitDirs ?? [REPO]
  on('ui.log', (_$, e) => { w.logs.push(e.text); return { value: undefined } })
  on('session.cwd', () => ({ value: opts.cwd ?? `${REPO}/hooks/rules` }))
  on('session.id', () => ({ value: w.sessionId }))
  on('fs.exists', (_$, e) => ({ value: gitDirs.some(d => e.path === `${d}/.git`) }))
  on('fs.write', (_$, e) => {
    if (opts.writeFails || (opts.latestFails && e.path.endsWith('/LATEST.md'))) throw new Error('disk full')
    w.writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('fs.read', (_$, e) => {
    const hit = [...w.writes].reverse().find(x => x.path === e.path)
    if (!hit) throw new Error(`ENOENT ${e.path}`)
    return { value: opts.readBack ?? hit.text }
  })
  on('clock.now', () => ({ value: w.now }))
  const store = new Map<string, unknown>(Object.entries(opts.store ?? {}))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('clock.after', (_$, e) => {
    w.timers.push(e.ms)
    // holdIdle: the idle timer fires only when the test releases it.
    if (opts.holdIdle && e.ms === IDLE_MS) return new Promise(r => w.idle.push(() => r({ value: undefined }))) as never
    return { value: undefined }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.abort', (_$, e) => {
    w.order.push(`abort:${e.turnId}`)
    if (opts.abortFails) throw new Error('not the running turn')
    return undefined as never
  })
  on('command.run', (_$, e) => {
    w.commands.push(e.command)
    w.order.push(e.command)
    if (opts.clearFails) throw new Error('busy')
    return { text: '' }
  })
  // The worktree reaper runs in the rollover path; its git call fails here, so
  // it removes nothing, and its first process call marks where it ran.
  on('process.run', (_$, e) => {
    w.order.push(`run:${e.argv[0]}`)
    return { value: { exitCode: 128, stdout: '', stderr: 'not a repo', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.submit', async (_$, e) => {
    // dropIf: a hook beneath this rule refuses the prompt (K2).
    if (opts.dropIf && e.text.includes(opts.dropIf)) return { drop: 'refused below' } as never
    // holdIf: the prompt is being accepted until the test releases it.
    if (opts.holdIf && e.text.includes(opts.holdIf)) await new Promise<void>(r => w.promptHeld.push(r))
    w.entered.push(e.text)
    if (e.origin.kind === 'plugin') w.submits.push(e.text)
    return { text: e.text, origin: e.origin }
  })
  on('model.fork', async (_$, e) => {
    w.forks++
    w.prompts.push(e.prompt)
    // holdFork: the handoff is being written until the test releases it.
    if (opts.holdFork) await new Promise<void>(r => w.forkHeld.push(r))
    return {
      value: opts.answered === false
        ? { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded_error', usage }
        : { isAnswered: true, text: opts.forkText ?? 'LATEST: lane landed.\n\n## 1. Session intent\nkeep going', usage },
    }
  })
  on('session.compact', (_$, e) => {
    w.compacted++
    w.instructions.push(e.instructions)
    return opts.skip ? { skip: 'blocked by a PreCompact hook' } : { messages: MSGS }
  })
  return w
}

test('auto + handoff written: vetoes the compaction, schedules /clear then the prompt', async ($, on) => {
  const w = world(on)
  const r = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(w.compacted).toBe(0)
  expect(w.writes.length).toBe(2)
  const [file, latest] = w.writes
  expect(file.path).toMatch(/^\/work\/_tmp\/development\/my-repo\/_handoff\/handoff-\d{4}-\d{2}-\d{2}-\d{6}\.md$/)
  expect(file.text.startsWith(HEADER + '\n')).toBe(true)
  expect(latest.path).toBe(`${DIR}/LATEST.md`)
  expect(r.skip).toBe(rolloverSkip(file.path))
  expect(w.timers).toEqual([300])
  await settle(w, 1)
  expect(w.commands).toEqual(['clear'])
  // The worktree reaper ran (its first call: git rev-parse) before the /clear.
  expect(w.order).toEqual(['run:git', 'clear'])
  expect(w.submits).toEqual([rolloverPrompt(file.path)])
  expect(w.logs).toContain(`compact-save: rollover from session old-session-1, handoff ${file.path}`)
  expect(appends(w).length).toBe(0)
})

// /clear queues until idle; mid-turn the next auto compaction beat it
// (2026-10-04 17:01). The rollover ends the running turn first.
test('mid-turn rollover ends the running turn before the reaper and /clear', async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'go', turnId: 't-1' })
  const r = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(r.skip).toBeDefined()
  await settle(w, 1)
  expect(w.order).toEqual(['abort:t-1', 'run:git', 'clear'])
  expect(w.submits).toEqual([rolloverPrompt(w.writes[0].path)])
})

// Mid-turn the fork sees only the main thread's last request, so the calls
// after the last user message are missing from its handoff (rollover probe,
// 2026-10-04: "round 2 ran no cats" after cat f1.txt had run).
const ran = { result: { stdout: 'ran', stderr: '', interrupted: false } }

test('mid-turn: the handoff ends with the tool calls the fork could not see', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Bash' }, () => ran)
  on('tool.call', { tool: 'Read' }, () => ({ deny: 'no' }))
  await $.turn.start({ text: 'go', turnId: 't-1' })
  await $.tool.call({ tool: 'Bash', command: 'cat f1.txt', description: 'Print f1.txt' })
  await $.tool.call({ tool: 'Read', file_path: '/r/x.md' } as never)
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  const text = w.writes[0].text
  expect(text.endsWith(`${cutTurnSection([
    { tool: 'Bash', input: 'Print f1.txt', outcome: 'ok' },
    { tool: 'Read', input: '/r/x.md', outcome: 'denied' },
  ])}\n`)).toBe(true)
  expect(text).toContain('1. Bash `Print f1.txt`: ok')
  // Ticket 6's verbatim ask still opens the handoff, ahead of the cut record.
  expect(text.indexOf("## Rico's ask (verbatim)")).toBeLessThan(text.indexOf('## Turn cut by the compaction'))
})

// a command's arguments can carry a credential.
test('no tool argument reaches the handoff', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Bash' }, () => ran)
  await $.turn.start({ text: 'go', turnId: 't-1' })
  // Assembled at run time so the secret scanner does not read a fixture as a leak.
  const header = ['Author', 'ization: Bearer ', 'REVIEW_TEST_SECRET'].join('')
  await $.tool.call({ tool: 'Bash', command: `curl -H "${header}" https://x` })
  await $.tool.call({ tool: 'Bash', command: 'TOKEN=REVIEW_TEST_SECRET2 gh api x' })
  // Round 2: a quoted value with a space split across words leaked its tail.
  await $.tool.call({ tool: 'Bash', command: 'AUTH="Bearer REVIEW_TEST_SECRET3" gh api x' })
  await $.tool.call({ tool: 'Bash', command: "PGPASSWORD='a REVIEW_TEST_SECRET4' psql -h db" })
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  const text = w.writes[0].text
  expect(text).not.toContain('REVIEW_TEST_SECRET')
  expect(text).toContain('1. Bash: ok')
  expect(text).toContain('4. Bash: ok')
})

// a call a dev-rules gate refuses is recorded too,
// because the recorder is registered ahead of the gates (here model-gate).
test('a call refused by a dev-rules gate is in the cut-turn record', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Bash' }, () => ran)
  await $.turn.start({ text: 'go', turnId: 't-1' })
  await $.tool.call({ tool: 'Bash', command: 'cat f1.txt', description: 'Print f1' })
  const r = await $.tool.call({ tool: 'Bash', command: 'claude -p x', description: 'Run a headless claude' })
  expect(r.deny).toContain('claude -p is never run')
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  const text = w.writes[0].text
  expect(text).toContain('1. Bash `Print f1`: ok')
  expect(text).toContain('2. Bash `Run a headless claude`: denied')
})

test('a subagent tool call is not in the cut-turn record', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Bash' }, () => ran)
  await $.turn.start({ text: 'go', turnId: 't-1' })
  await $.tool.call({ tool: 'Bash', command: 'cat f1.txt', description: 'Sub call', agentId: 'a-1' } as never)
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(w.writes[0].text).not.toContain('Turn cut by the compaction')
})

test('a manual compaction (between turns) adds no cut-turn record', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Bash' }, () => ran)
  await $.turn.start({ text: 'go', turnId: 't-1' })
  await $.tool.call({ tool: 'Bash', command: 'cat f1.txt' })
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  expect(w.writes[0].text).not.toContain('Turn cut by the compaction')
})

test('a new turn starts the record over', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Bash' }, () => ran)
  await $.turn.start({ text: 'go', turnId: 't-1' })
  await $.tool.call({ tool: 'Bash', command: 'cat f1.txt' })
  await $.turn.start({ text: 'again', turnId: 't-2' })
  await $.tool.call({ tool: 'Bash', command: 'cat f2.txt' })
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(w.writes[0].text).toContain('1. Bash: ok')
  expect(w.writes[0].text).not.toContain('2. Bash')
})

test('the handoff prompt says it is the plugin, not the user, and the turn may be cut', () => {
  expect(HANDOFF_PROMPT.startsWith('This message comes from the dev-rules plugin, not from the user')).toBe(true)
  expect(HANDOFF_PROMPT).toContain('do not say that request was skipped or not started')
  expect(rolloverPrompt('/x/h.md')).toContain('stopped by the rollover, not by the user')
})

test('callInput: a path or a Bash description, never a word of the command', () => {
  expect(callInput({ tool: 'Bash', command: 'cat \\\n  f1.txt', tool_use_id: 'u1' })).toBe('')
  expect(callInput({ tool: 'Bash', command: 'A=1 B=2 git push', description: 'Push\n the branch' })).toBe('Push the branch')
  expect(callInput({ tool: 'Bash', command: 'AUTH="Bearer x y" git push origin x' })).toBe('')
  expect(callInput({ tool: 'Read', file_path: '/r/x', agentId: 'a' })).toBe('/r/x')
  expect(callInput({ tool: 'Grep', pattern: 'hunter2', path: '/r' })).toBe('/r')
  expect(callInput({ tool: 'Write', file_path: '/r/y', content: 'hunter2' })).toBe('/r/y')
  expect(callInput({ tool: 'WebFetch', url: 'https://x/?token=hunter2' })).toBe('')
  expect(callInput({ tool: 'Bash', command: 'x', description: 'd'.repeat(300) })).toBe(`${'d'.repeat(200)}...`)
  expect(cutTurnSection([{ tool: 'WebFetch', input: '', outcome: 'ok' }])).toContain('1. WebFetch: ok')
  expect(cutTurnSection([])).toBe('')
})

test('no turn seen yet: nothing to abort', async ($, on) => {
  const w = world(on)
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  await settle(w, 1)
  expect(w.order).toEqual(['run:git', 'clear'])
})

test('a refused abort (the turn already ended) is logged and /clear still queues', async ($, on) => {
  const w = world(on, { abortFails: true })
  await $.turn.start({ text: 'go', turnId: 't-1' })
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  await settle(w, 1)
  expect(w.order).toEqual(['abort:t-1', 'run:git', 'clear'])
  expect(w.logs.some(l => l.startsWith('compact-save: turn t-1 not ended'))).toBe(true)
  expect(w.submits.length).toBe(1)
})

test('a second auto compaction within 5 minutes compacts instead of looping', async ($, on) => {
  const w = world(on)
  const first = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(first.skip).toBeDefined()
  // Once the first rollover's /clear has run: past the in-flight guard.
  await settle(w, 1)
  const second = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(second.skip).toBeUndefined()
  expect(w.compacted).toBe(1)
  expect(w.timers).toEqual([300])
  expect(w.logs).toContain('compact-save: no rollover, compacting instead (the last rollover was under 5 minutes ago)')
})

test("another session's rollover (the old shared store key) does not block this one", async ($, on) => {
  const w = world(on, { store: { 'compact-save.lastRollover': Date.UTC(2026, 9, 3, 12, 0, 0) } })
  const r = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(r.skip).toBeDefined()
  expect(w.compacted).toBe(0)
})

test('the rollover texts name the handoff and say it is unverified', () => {
  const p = `${DIR}/handoff-2026-10-04-120000.md`
  expect(rolloverSkip(p)).toBe(`compact-save: handoff written to ${p}; starting a fresh session`)
  expect(rolloverPrompt(p)).toBe(`Read ${p} first: it is the pre-rollover handoff from the previous session (model-written, unverified; check its claims against git, Forge and the files). Then continue the work it describes; a turn it lists as cut was stopped by the rollover, not by the user, so resume it where it stopped.`)
})

test('a failed /clear submits nothing and logs the handoff path', async ($, on) => {
  const w = world(on, { clearFails: true })
  const r = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(r.skip).toBeDefined()
  await settle(w, 1)
  expect(w.commands).toEqual(['clear'])
  expect(w.submits.length).toBe(0)
  expect(w.logs.some(l => l.startsWith('compact-save: /clear failed') && l.includes(w.writes[0].path))).toBe(true)
})

test('auto + unanswered fork: no veto, compacts, appends nothing', async ($, on) => {
  const w = world(on, { answered: false })
  const r = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(r.skip).toBeUndefined()
  expect(w.forks).toBe(1)
  expect(w.writes.length).toBe(0)
  expect(w.timers.length).toBe(0)
  expect(appends(w).length).toBe(0)
  expect(w.logs).toContain('compact-save: no handoff written, the fork returned api-error')
  expect(w.compacted).toBe(1)
})

test('auto + handoff write failed: no veto, compacts as before', async ($, on) => {
  const w = world(on, { writeFails: true })
  const r = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(r.skip).toBeUndefined()
  expect(w.compacted).toBe(1)
  expect(w.timers.length).toBe(0)
  expect(w.commands.length).toBe(0)
  expect(w.logs.some(l => l.startsWith('compact-save: writing the handoff failed'))).toBe(true)
})

test('manual: writes the handoff and LATEST.md under _tmp, compacts, then appends the note', async ($, on) => {
  const w = world(on)
  const r = await $.session.compact({ trigger: 'manual', messages: MSGS })
  expect(r.skip).toBeUndefined()
  expect(w.compacted).toBe(1)
  expect(w.timers.length).toBe(0)
  expect(w.writes.length).toBe(2)
  const [file, latest] = w.writes
  expect(file.path).toMatch(/^\/work\/_tmp\/development\/my-repo\/_handoff\/handoff-\d{4}-\d{2}-\d{2}-\d{6}\.md$/)
  expect(file.text.startsWith(HEADER + '\n')).toBe(true)
  expect(file.text).toContain('## 1. Session intent')
  expect(latest.path).toBe(`${DIR}/LATEST.md`)
  expect(latest.text.split('\n')[0]).toBe(file.path.slice(DIR.length + 1))
  expect(appends(w).length).toBe(1)
  expect(appends(w)[0]).toContain(`note for ${file.path} `)
})

test('plugin trigger compacts in place too', async ($, on) => {
  const w = world(on)
  const r = await $.session.compact({ trigger: 'plugin', messages: MSGS })
  expect(r.skip).toBeUndefined()
  expect(w.compacted).toBe(1)
  expect(w.timers.length).toBe(0)
  expect(appends(w).length).toBe(1)
})

test('the note names the handoff and says it is unverified', () => {
  const text = noteText(`${DIR}/handoff-2026-10-03-120000.md`)
  expect(text).toBe(`A compaction just ran. Before continuing, read ${DIR}/handoff-2026-10-03-120000.md: it holds the detail the compaction summary dropped. It is model-written and unverified; check what it calls done against git, Forge and the files.`)
})

test('handoffDir: Development project, git root basename, else cwd basename', () => {
  expect(handoffDir(`${REPO}/hooks`, REPO)).toBe(DIR)
  expect(handoffDir('/work/_tmp/p/r', undefined)).toBe('/work/_tmp/_handoff/r')
  expect(handoffDir('/Users/me/scratch', undefined)).toBe('/work/_tmp/_handoff/scratch')
  expect(inScope('/work/dev-old')).toBe(false)
})

// Review of 49aa7a7 (Adams, slice 2): a git root under _tmp made a new
// top-level _tmp/<branch>/ folder per worktree.
const T = '/work/_tmp'
const WT = `${T}/_worktrees/claude/development/development/fix-x`
const ROWS: [string, string, string | undefined, string][] = [
  ['worktree root', WT, WT, `${T}/development/development/_handoff`],
  ['nested cwd in a worktree', `${WT}/_ob/mods`, WT, `${T}/development/development/_handoff`],
  ['codex worktree', `${T}/_worktrees/codex/acme/infra/feat-y`, `${T}/_worktrees/codex/acme/infra/feat-y`, `${T}/acme/infra/_handoff`],
  ['review clone in a project area', `${T}/development/_reviews/development-pr923`, `${T}/development/_reviews/development-pr923`, `${T}/development/_reviews/_handoff`],
  ['scratch, no git root', `${T}/scratch/live2`, undefined, `${T}/_handoff/live2`],
  ['workspace root, repo is its basename', '/work/dev', '/work/dev', `${T}/development/dev/_handoff`],
  ['mixed-case worktree', `${T}/_worktrees/claude/Owner/MixedCase/x/src`, `${T}/_worktrees/claude/Owner/MixedCase/x`, `${T}/owner/mixedcase/_handoff`],
  ['git root in an _-prefixed area', `${T}/_scratch/clone`, `${T}/_scratch/clone`, `${T}/_handoff/clone`],
  // Recut D1.3/6: pin the two length guards at their edge.
  ['_worktrees path one segment short of a purpose', `${T}/_worktrees/claude/development/development`, `${T}/_worktrees/claude/development/development`, `${T}/_handoff/development`],
  ['git root one segment under _tmp', `${T}/solo`, `${T}/solo`, `${T}/_handoff/solo`],
  ['clone at a project/repo pair', `${T}/proj/repo`, `${T}/proj/repo`, `${T}/proj/repo/_handoff`],
  ['nested cwd in a project area clone', `${T}/development/development/notes`, `${T}/development/development`, `${T}/development/development/_handoff`],
  ['git repo outside Development and _tmp', '/Users/me/code/app/src', '/Users/me/code/app', `${T}/_handoff/app`],
]
for (const [name, cwd, root, want] of ROWS) {
  test(`handoffDir under _tmp: ${name}`, () => {
    expect(handoffDir(cwd, root)).toBe(want)
  })
}

test('a compaction in a nested worktree cwd writes under the project, not _tmp/<branch>', async ($, on) => {
  const w = world(on, { cwd: `${WT}/_ob/mods`, gitDirs: [WT] })
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  expect(w.writes.map(x => x.path.slice(0, x.path.lastIndexOf('/')))).toEqual([`${T}/development/development/_handoff`, `${T}/development/development/_handoff`])
})

test('a failed LATEST.md write keeps the handoff path for the summarizer and the note', async ($, on) => {
  const w = world(on, { latestFails: true })
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  expect(w.writes.length).toBe(1)
  expect(w.instructions[0]).toContain(w.writes[0].path)
  expect(appends(w)[0]).toContain(`note for ${w.writes[0].path} `)
})

test('auto + blank fork reply: no write, compacts, no skip', async ($, on) => {
  const w = world(on, { forkText: '   ' })
  const r = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(r.skip).toBeUndefined()
  expect(w.writes.length).toBe(0)
  expect(w.compacted).toBe(1)
  expect(w.logs).toContain('compact-save: no handoff written, the fork reply was empty')
})

test('auto + handoff reads back empty: no rollover, compacts', async ($, on) => {
  const w = world(on, { readBack: '' })
  const r = await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(r.skip).toBeUndefined()
  expect(w.compacted).toBe(1)
  expect(w.timers.length).toBe(0)
  expect(w.logs).toContain('compact-save: no rollover, compacting instead (the handoff reads back empty)')
})

test('summarizer instructions name the handoff, after what the user typed', async ($, on) => {
  const w = world(on)
  await $.session.compact({ trigger: 'manual', messages: MSGS, instructions: 'keep the port list' })
  const got = w.instructions[0] ?? ''
  expect(got.startsWith('keep the port list\n')).toBe(true)
  expect(got).toContain(`The full pre-compaction handoff is at ${w.writes[0].path};`)
})

test('the 5-minute window: blocked at 4 minutes, a rollover again past 5', async ($, on) => {
  const w = world(on)
  expect((await $.session.compact({ trigger: 'auto', messages: MSGS })).skip).toBeDefined()
  await settle(w, 1)
  w.now += 4 * 60 * 1000
  expect((await $.session.compact({ trigger: 'auto', messages: MSGS })).skip).toBeUndefined()
  w.now += 60 * 1000 + 1
  expect((await $.session.compact({ trigger: 'auto', messages: MSGS })).skip).toBeDefined()
  expect(w.timers).toEqual([300, 300])
})

test('two turns: the rollover aborts the latest one', async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'one', turnId: 't-1' })
  await $.turn.start({ text: 'two', turnId: 't-2' })
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  await settle(w, 1)
  expect(w.order[0]).toBe('abort:t-2')
})

test('no git root: one shared _tmp/_handoff bucket, never a new top-level folder', async ($, on) => {
  const w = world(on, { cwd: '/work/_tmp/scratchy', gitDirs: [] })
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  expect(w.writes[0].path.startsWith('/work/_tmp/_handoff/scratchy/handoff-')).toBe(true)
})

test('never writes into the repo or a .gitignore', async ($, on) => {
  const w = world(on)
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  for (const { path } of w.writes) {
    expect(path.startsWith(DIR + '/')).toBe(true)
    expect(path).not.toContain('.gitignore')
  }
})

test('a precompute writes nothing', async ($, on) => {
  const w = world(on)
  await $.session.compact({ trigger: 'precompute', messages: MSGS })
  expect(w.forks).toBe(0)
  expect(w.writes.length).toBe(0)
  expect(appends(w).length).toBe(0)
  expect(w.compacted).toBe(1)
})

test('a subagent compaction writes nothing and never rolls over', async ($, on) => {
  const w = world(on)
  await $.session.compact({ trigger: 'auto', agentId: 'a1', messages: MSGS })
  expect(w.forks).toBe(0)
  expect(w.writes.length).toBe(0)
  expect(w.timers.length).toBe(0)
  expect(appends(w).length).toBe(0)
  expect(w.compacted).toBe(1)
})

for (const cwd of ['/Users/me/elsewhere', '/work/dev-old/x', '/work/_tmpfoo']) {
  test(`out of scope writes nothing: ${cwd}`, async ($, on) => {
    const w = world(on, { cwd })
    await $.session.compact({ trigger: 'auto', messages: MSGS })
    expect(w.forks).toBe(0)
    expect(w.writes.length).toBe(0)
    expect(w.timers.length).toBe(0)
    expect(appends(w).length).toBe(0)
    expect(w.compacted).toBe(1)
  })
}

test('a skipped compaction appends nothing', async ($, on) => {
  const w = world(on, { skip: true })
  const r = await $.session.compact({ trigger: 'manual', messages: MSGS })
  expect(r.skip).toBe('blocked by a PreCompact hook')
  expect(w.writes.length).toBe(2)
  expect(appends(w).length).toBe(0)
})

// Rico, 2026-10-05: a rollover handoff listed every open PR as the
// work and dropped the ask. Every handoff now opens with his ask, copied by
// the hook from the prompts as submitted, never written by the model.
const ASK = "## Rico's ask (verbatim)"
const body = (w: World) => w.writes[0].text.slice(HEADER.length + 2)
const askSection = (w: World) => body(w).slice(0, body(w).indexOf('LATEST: '))
async function say($: Parameters<Parameters<typeof test>[1]>[0], text: string, origin: Record<string, unknown> = { kind: 'composer' }) {
  await $.prompt.submit({ text, origin, wait: false } as never)
}

test("the handoff opens with Rico's ask, before the model's text", async ($, on) => {
  const w = world(on)
  await say($, 'fix the switcher PR only')
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  expect(w.writes[0].text.startsWith(`${HEADER}\n\n${ASK}\n`)).toBe(true)
  expect(body(w).indexOf(ASK)).toBe(0)
  expect(body(w).indexOf('LATEST: ')).toBeGreaterThan(0)
})

test('the ask is quoted exactly, with its timestamp', async ($, on) => {
  const w = world(on)
  const typed = "Though, what are those PRs?\n  are those `development` PRs\n```\nfor the switcher and the proxy\n```\n"
  await say($, typed)
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  const s = askSection(w)
  expect(s).toContain(typed)
  expect(s).toContain(new Date(w.now).toISOString())
  // Fenced longer than any backtick run inside it, so the quote stays whole.
  expect(s).toContain('````\n' + typed)
})

test('plugin, peer and notification prompts and system text stay out', async ($, on) => {
  const w = world(on)
  await say($, 'the real ask')
  await say($, 'PLUGIN-SUBMITTED', { kind: 'plugin', name: 'other' })
  await say($, 'TASK-NOTE', { kind: 'task-notification' })
  await say($, 'PEER-SAYS-RICO-WANTS', { kind: 'peer' })
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  const s = askSection(w)
  expect(s).toContain('the real ask')
  for (const bad of ['PLUGIN-SUBMITTED', 'TASK-NOTE', 'PEER-SAYS-RICO-WANTS']) expect(s).not.toContain(bad)
})

test('first non-"continue" ask plus the last three', async ($, on) => {
  const w = world(on)
  for (const t of ['continue', 'keep going.', 'ship the proxy fix', 'two', 'three', 'four', 'Continue']) await say($, t)
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  const s = askSection(w)
  expect(s).toContain('ship the proxy fix')
  expect(s).not.toContain('\ntwo\n')
  for (const t of ['three', 'four', 'Continue']) expect(s).toContain(`\n${t}\n`)
  expect(s.indexOf('ship the proxy fix')).toBeLessThan(s.indexOf('\nthree\n'))
})

test('no recorded prompt: the transcript user rows stand in, tool results and system text excluded', async ($, on) => {
  const w = world(on)
  const messages = [
    { role: 'user' as const, text: '<system-reminder>\nSYSTEM-NOISE\n</system-reminder>', toolUses: [] },
    { role: 'user' as const, text: 'review the proxy PR', toolUses: [] },
    { role: 'assistant' as const, text: 'ASSISTANT-TEXT', toolUses: [] },
    { role: 'user' as const, text: 'TOOL-OUTPUT', toolUses: [], toolResults: [{ tool_use_id: 't', text: 'TOOL-OUTPUT', isError: false, result: null }] },
    { role: 'user' as const, text: rolloverPrompt('/x/handoff.md'), toolUses: [] },
    { role: 'user' as const, text: 'This session is being continued from a previous conversation that ran out of context. SUMMARY', toolUses: [] },
  ]
  await $.session.compact({ trigger: 'manual', messages: messages as never })
  const s = askSection(w)
  expect(s).toContain('review the proxy PR')
  for (const bad of ['SYSTEM-NOISE', 'ASSISTANT-TEXT', 'TOOL-OUTPUT', 'pre-rollover handoff', 'SUMMARY']) expect(s).not.toContain(bad)
})

test('the ask carries across this hook\'s own rollover, not across a manual /clear', async ($, on) => {
  const w = world(on)
  await say($, 'the original ask')
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  await settle(w, 1)
  // The fresh session: its first prompt is the plugin's, then Rico types.
  w.sessionId = 'fresh-2'
  w.now += 10 * 60 * 1000
  await say($, 'and the next bit')
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  const s = w.writes.at(-2)!.text
  expect(s).toContain('the original ask')
  expect(s).toContain('and the next bit')
  // A /clear Rico typed starts a new ask.
  w.sessionId = 'cleared-3'
  await say($, 'unrelated new work')
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  const t = w.writes.at(-2)!.text
  expect(t).toContain('unrelated new work')
  expect(t).not.toContain('the original ask')
})

// Rico, 2026-10-08: the third handoff in a chain pauses until he answers.
async function chain($: Parameters<Parameters<typeof test>[1]>[0], w: World, n: number) {
  for (let i = 0; i < n; i++) {
    w.now += 10 * 60 * 1000
    await $.session.compact({ trigger: 'auto', messages: MSGS })
    await new Promise(r => setTimeout(r, 50))
    w.sessionId = `fresh-${w.sessionId}`
  }
}
function toasts(on: On) {
  const t: string[] = []
  on('ui.toast', (_$, e) => { t.push(e.text); return { value: undefined } })
  return t
}

test('rollovers 1 and 2 submit the prompt; rollover 3 pauses and toasts', async ($, on) => {
  const w = world(on)
  const t = toasts(on)
  await say($, 'the ask')
  await chain($, w, 2)
  expect(w.submits.length).toBe(2)
  await chain($, w, 1)
  expect(w.commands).toEqual(['clear', 'clear', 'clear'])
  expect(w.submits.length).toBe(2)
  const path = w.writes.at(-2)!.path
  expect(t).toContain(pausedText(path))
  expect(w.logs).toContain(pausedText(path))
  expect(MAX_HANDOFFS).toBe(3)
})

test('while paused a non-user prompt is dropped; a user prompt resumes with the handoff', async ($, on) => {
  const w = world(on)
  toasts(on)
  const seen = w.entered
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  const before = seen.length
  for (const [text, origin] of [
    ['PEER', { kind: 'peer' }],
    ['TASK-NOTE', { kind: 'task-notification' }],
    ['PLUGIN-SAYS', { kind: 'plugin', name: 'other' }],
  ] as const) {
    const r = await $.prompt.submit({ text, origin, wait: false } as never)
    expect((r as { drop?: string }).drop).toBe(pausedText(path))
  }
  expect(seen.length).toBe(before)
  expect(w.logs.filter(l => l.startsWith(pausedText(path)) && l.includes('dropped a ')).length).toBe(3)
  await say($, 'go on')
  expect(seen.at(-1)).toBe(`${rolloverPrompt(path)}\n\nRico: go on`)
  // The count reset: two more rollovers submit, the third pauses again.
  await chain($, w, 2)
  expect(w.submits.length).toBe(4)
  await chain($, w, 1)
  expect(w.submits.length).toBe(4)
})

test('a prompt in a session Rico started resets the count; one in a rolled-over session does not', async ($, on) => {
  const w = world(on)
  const t = toasts(on)
  await say($, 'the ask')
  await chain($, w, 2)
  // Rico types inside the rolled-over session: no reset, the next one pauses.
  await say($, 'more')
  await chain($, w, 1)
  expect(w.submits.length).toBe(2)
  expect(t.length).toBe(1)
})

test('a /clear Rico typed starts a new chain', async ($, on) => {
  const w = world(on)
  const t = toasts(on)
  await say($, 'the ask')
  await chain($, w, 2)
  // Rico types in the rolled-over session (no reset), then clears it himself.
  await say($, 'more')
  w.sessionId = 'cleared-by-rico'
  await say($, 'new work')
  await chain($, w, 2)
  expect(w.submits.length).toBe(4)
  expect(t.length).toBe(0)
})

test('a slash command or an empty prompt while paused passes through and keeps the pause', async ($, on) => {
  const w = world(on)
  toasts(on)
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  await say($, '/model')
  expect(w.entered.at(-1)).toBe('/model')
  await say($, '   ')
  // Still paused: a peer is dropped, and Rico's next prompt resumes.
  const r = await $.prompt.submit({ text: 'PEER', origin: { kind: 'peer' }, wait: false } as never)
  expect((r as { drop?: string }).drop).toBe(pausedText(path))
  await say($, 'go on')
  expect(w.entered.at(-1)).toBe(`${rolloverPrompt(path)}\n\nRico: go on`)
})

test('a resume dropped beneath the rule keeps the pause; an accepted one clears it', async ($, on) => {
  const opts = { dropIf: 'Rico: blocked' }
  const w = world(on, opts)
  toasts(on)
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  await say($, 'blocked')
  const r = await $.prompt.submit({ text: 'PEER', origin: { kind: 'peer' }, wait: false } as never)
  expect((r as { drop?: string }).drop).toBe(pausedText(path))
  await say($, 'go on')
  expect(w.entered.at(-1)).toBe(`${rolloverPrompt(path)}\n\nRico: go on`)
  // Cleared: a peer prompt now enters.
  await say($, 'PEER-2', { kind: 'peer' })
  expect(w.entered.at(-1)).toBe('PEER-2')
})

test('a rollover whose /clear failed does not count toward the pause', async ($, on) => {
  const opts = { clearFails: true }
  const w = world(on, opts)
  const t = toasts(on)
  await say($, 'the ask')
  await chain($, w, 2)
  expect(w.logs.filter(l => l.includes('/clear failed')).length).toBe(2)
  opts.clearFails = false
  await chain($, w, 2)
  expect(w.submits.length).toBe(2)
  expect(t.length).toBe(0)
  await chain($, w, 1)
  expect(t.length).toBe(1)
})

test('the pause appends a note naming the reason and the handoff', async ($, on) => {
  const w = world(on)
  toasts(on)
  const notes: string[] = []
  on('session.append', (_$, e, next) => {
    const c = (e as { message: { content: { text: string }[] } }).message.content
    notes.push(c.map(x => x.text).join(''))
    return next(e)
  })
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  expect(notes).toEqual([pausedText(path)])
})

// Rico, 2026-10-12: the cap pause asks, through $.ui.ask (an AskUserQuestion
// tool.call), for a full handover or more rollovers. Each answer in turn;
// null: the menu is dismissed.
// A promise: the answer is held until the test resolves it.
function menu(on: On, answers: (string | null | Promise<string | null>)[]) {
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as unknown as { questions: { question: string }[] }).questions[0].question
    asked.push(q)
    const a = await answers.shift()
    return (a == null ? { deny: 'dismissed' } : { result: { answers: { [q]: a } } }) as never
  })
  return asked
}

test('Run 2 more at the cap: two more rollovers submit, the next pauses with the menu again', async ($, on) => {
  const w = world(on)
  toasts(on)
  const asked = menu(on, ['Run 2 more', null])
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  await until(() => w.submits.length === 3)
  expect(w.submits.at(-1)).toBe(rolloverPrompt(path))
  await chain($, w, 1)
  expect(w.submits.length).toBe(4)
  await chain($, w, 1)
  await until(() => asked.length === 2)
  expect(asked.length).toBe(2)
  expect(w.submits.length).toBe(4)
})

test('Full handover submits the handover prompt and the next chain gets the full 3', async ($, on) => {
  const w = world(on)
  const t = toasts(on)
  menu(on, ['Full handover'])
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  await until(() => w.submits.length === 3)
  expect(w.submits.at(-1)).toBe(handoverPrompt(path))
  await chain($, w, 2)
  expect(w.submits.length).toBe(5)
  await chain($, w, 1)
  expect(w.submits.length).toBe(5)
  expect(t.length).toBe(2)
})

test('a dismissed menu keeps the pause: no submit, a peer prompt is dropped', async ($, on) => {
  const w = world(on)
  toasts(on)
  const asked = menu(on, [null])
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  await until(() => w.logs.some(l => l.startsWith('compact-save: pause menu not answered')))
  expect(asked.length).toBe(1)
  expect(w.submits.length).toBe(2)
  const r = await $.prompt.submit({ text: 'PEER', origin: { kind: 'peer' }, wait: false } as never)
  expect((r as { drop?: string }).drop).toBe(pausedText(path))
})

function held() {
  let resolve!: (a: string | null) => void
  const p = new Promise<string | null>(r => { resolve = r })
  return { p, resolve }
}

test('a menu answer after Rico resumed the pause is ignored', async ($, on) => {
  const w = world(on)
  toasts(on)
  const answer = held()
  const asked = menu(on, [answer.p])
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  await until(() => asked.length === 1)
  await say($, 'go on')
  answer.resolve('Full handover')
  await new Promise(r => setTimeout(r, 50))
  expect(w.submits).not.toContain(handoverPrompt(path))
})

test('a menu answer while Rico\'s resume is being accepted is ignored', async ($, on) => {
  const opts: { holdIf?: string } = {}
  const w = world(on, opts)
  toasts(on)
  const answer = held()
  const asked = menu(on, [answer.p])
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  await until(() => asked.length === 1)
  opts.holdIf = 'Rico: go on'
  const resumed = say($, 'go on')
  await until(() => w.promptHeld.length > 0)
  answer.resolve('Full handover')
  await new Promise(r => setTimeout(r, 50))
  w.promptHeld[0]()
  await resumed
  expect(w.submits).not.toContain(handoverPrompt(path))
})

test('Rico resuming after Run N more puts the cap back to 3', async ($, on) => {
  const w = world(on)
  const t = toasts(on)
  const asked = menu(on, ['Run 2 more', null])
  await say($, 'the ask')
  await chain($, w, 3)
  await until(() => w.submits.length === 3)
  await chain($, w, 2)
  await until(() => asked.length === 2)
  await say($, 'go on')
  await chain($, w, 2)
  expect(w.submits.length).toBe(6)
  await chain($, w, 1)
  expect(w.submits.length).toBe(6)
  expect(t.length).toBe(3)
})

test('a refused menu prompt keeps the pause', async ($, on) => {
  const opts: { dropIf?: string } = {}
  const w = world(on, opts)
  toasts(on)
  const answer = held()
  const asked = menu(on, [answer.p])
  await say($, 'the ask')
  await chain($, w, 3)
  const path = w.writes.at(-2)!.path
  await until(() => asked.length === 1)
  opts.dropIf = rolloverPrompt(path)
  answer.resolve('Run 2 more')
  await until(() => w.logs.some(l => l.includes('its prompt was refused')))
  const r = await $.prompt.submit({ text: 'PEER', origin: { kind: 'peer' }, wait: false } as never)
  expect((r as { drop?: string }).drop).toBe(pausedText(path))
})

// Rico, 2026-10-08 ("Roll over before expiry"): a large session idle until
// shortly before its prompt cache expires hands over, clears and pauses.
async function idleTurn($: Parameters<Parameters<typeof test>[1]>[0], w: World, id = 't-idle') {
  w.now += 50 * 60 * 1000
  // No turn.start: a later auto rollover would abort that turn, which this fake cannot answer.
  await $.turn.complete({ turnId: id, reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false } as never)
}
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5))
}

test('idle past TTL less margin with a big context: handoff, /clear, paused, no submit; Rico resumes', async ($, on) => {
  const w = world(on, { tokens: 200_000 })
  const t = toasts(on)
  await say($, 'the ask')
  await idleTurn($, w)
  await until(() => t.length > 0)
  expect(w.timers).toContain(IDLE_MS)
  expect(w.commands).toEqual(['clear'])
  expect(w.submits).toEqual([])
  const path = w.writes.at(-2)!.path
  expect(w.writes.at(-2)!.text).toContain('the ask')
  expect(t).toEqual([idlePausedText(path)])
  expect(w.logs).toContain(idlePausedText(path))
  const r = await $.prompt.submit({ text: 'PEER', origin: { kind: 'peer' }, wait: false } as never)
  expect((r as { drop?: string }).drop).toBe(idlePausedText(path))
  await say($, 'go on')
  expect(w.entered.at(-1)).toBe(`${rolloverPrompt(path)}\n\nRico: go on`)
  expect(idleWhy(50)).toContain('sat idle for 50 minutes')
})

test('the idle pause asks the menu too: Run 2 more submits the rollover prompt', async ($, on) => {
  const w = world(on, { tokens: 200_000 })
  toasts(on)
  const asked = menu(on, ['Run 2 more'])
  await say($, 'the ask')
  await idleTurn($, w)
  await until(() => w.submits.length === 1)
  const path = w.writes.at(-2)!.path
  expect(asked).toEqual([menuQuestion(0, path, true)])
  expect(w.submits).toEqual([rolloverPrompt(path)])
})

test('a refused menu prompt at the idle pause keeps the idle pause', async ($, on) => {
  const opts: { tokens: number; dropIf?: string } = { tokens: 200_000 }
  const w = world(on, opts)
  const t = toasts(on)
  const answer = held()
  const asked = menu(on, [answer.p])
  await say($, 'the ask')
  await idleTurn($, w)
  await until(() => asked.length === 1)
  const path = w.writes.at(-2)!.path
  opts.dropIf = rolloverPrompt(path)
  answer.resolve('Run 2 more')
  await until(() => w.logs.some(l => l.includes('its prompt was refused')))
  const r = await $.prompt.submit({ text: 'PEER', origin: { kind: 'peer' }, wait: false } as never)
  expect((r as { drop?: string }).drop).toBe(idlePausedText(path))
  expect(t.length).toBe(1)
})

test('the idle rollover neither counts toward the 3-handoff cap nor resets it', async ($, on) => {
  const w = world(on, { tokens: 200_000 })
  const t = toasts(on)
  await say($, 'the ask')
  await chain($, w, 2)
  expect(w.submits.length).toBe(2)
  await idleTurn($, w)
  await until(() => t.length > 0)
  await say($, 'go on')
  // Two before, none from the idle one: the next rollover is the third and pauses.
  await chain($, w, 1)
  await until(() => t.length > 1)
  expect(w.submits.length).toBe(2)
  expect(t.at(-1)).toBe(pausedText(w.writes.at(-2)!.path))
})

test('a turn between arming and firing: no idle rollover', async ($, on) => {
  const w = world(on, { tokens: 200_000, holdIdle: true })
  await idleTurn($, w, 't-1')
  await $.turn.start({ text: 'more', turnId: 't-2' })
  w.idle[0]()
  await new Promise(r => setTimeout(r, 50))
  expect(w.forks).toBe(0)
  expect(w.commands).toEqual([])
})

test('a small context: no idle rollover', async ($, on) => {
  const w = world(on, { tokens: 149_999 })
  await idleTurn($, w)
  await new Promise(r => setTimeout(r, 50))
  expect(w.forks).toBe(0)
  expect(w.commands).toEqual([])
})

test('an unreadable context size: no idle rollover, logged', async ($, on) => {
  const w = world(on, { tokens: null })
  await idleTurn($, w)
  await until(() => w.logs.some(l => l.includes('context size is not readable')))
  expect(w.forks).toBe(0)
  expect(w.commands).toEqual([])
  expect(w.logs).toContain('compact-save: no idle rollover, the context size is not readable')
})

test('the idle reason reaches the fork prompt', async ($, on) => {
  const w = world(on, { tokens: 200_000 })
  await say($, 'the ask')
  await idleTurn($, w)
  await until(() => w.commands.length > 0)
  expect(w.prompts[0]).toBe(`${HANDOFF_PROMPT}\n\n${idleWhy(50)}`)
})

test('a prompt while the idle handoff is written: no /clear, handoff kept, no pause', async ($, on) => {
  const w = world(on, { tokens: 200_000, holdFork: true })
  await say($, 'the ask')
  await idleTurn($, w)
  await until(() => w.forkHeld.length > 0)
  await say($, 'one more thing')
  w.forkHeld[0]()
  await until(() => w.logs.some(l => l.startsWith(IDLE_CANCELLED)))
  expect(w.commands).toEqual([])
  expect(w.writes.length).toBe(2)
  // Not paused: a peer's prompt goes through.
  await say($, 'PEER', { kind: 'peer' })
  expect(w.entered.at(-1)).toBe('PEER')
})

test('a rollover in flight blocks a second one', async ($, on) => {
  const w = world(on, { tokens: 200_000, holdFork: true })
  await say($, 'the ask')
  await idleTurn($, w)
  await until(() => w.forkHeld.length > 0)
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  expect(w.forks).toBe(1)
  expect(w.compacted).toBe(1)
  expect(w.logs).toContain('compact-save: a rollover is in flight, compacting without a handoff')
})

test('an out-of-scope cwd: no idle rollover', async ($, on) => {
  const w = world(on, { tokens: 200_000, cwd: '/Users/me/elsewhere' })
  await say($, 'the ask')
  await idleTurn($, w)
  await new Promise(r => setTimeout(r, 50))
  expect(w.forks).toBe(0)
})

test('paused when the idle timer fires: no idle rollover', async ($, on) => {
  const w = world(on, { tokens: 200_000 })
  await say($, 'the ask')
  await chain($, w, MAX_HANDOFFS)
  const forks = w.forks
  await idleTurn($, w)
  await new Promise(r => setTimeout(r, 50))
  expect(w.forks).toBe(forks)
  expect(w.commands.length).toBe(MAX_HANDOFFS)
})

test('no recorded ask: the idle rollover is skipped, logged', async ($, on) => {
  const w = world(on, { tokens: 200_000 })
  await idleTurn($, w)
  await until(() => w.logs.some(l => l.includes('no ask from Rico')))
  expect(w.forks).toBe(0)
})

test('a bad cache env value falls back to the defaults, logged', async ($, on) => {
  const w = world(on, { tokens: 1000, env: { DEVRULES_CACHE_MARGIN_S: '9000' } })
  await idleTurn($, w)
  expect(w.timers).toContain(IDLE_MS)
  expect(w.logs).toContain('compact-save: DEVRULES_CACHE_MARGIN_S=9000 is not valid, using the defaults')
})
