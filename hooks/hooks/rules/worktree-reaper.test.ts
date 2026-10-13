import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { onlyIgnorableUntracked, lsofCwds, mentions } from './worktree-reaper.ts'

// Loads the mod through hooks/register.ts. The test's hooks stand for the
// engine: the session cwd, every process (git, wt, lsof), the env, the file
// system, the clock, the store, and the log and toast. Nothing real runs.
const ROOT = '/work/dev'
const WTS = '/work/_tmp/_worktrees/claude/owner/development'
const A = `${WTS}/feat-done` // the reapable one in the default world
const HOME = '/Users/me'
const NOW = Date.UTC(2026, 9, 4, 12, 0, 0)

type Item = { branch: string; path: string; main?: boolean; upstream?: { remote: string; branch: string; ahead: number } | null }
type Opts = {
  cwd?: string
  items?: Item[]
  status?: Record<string, string>
  lsof?: string[]
  pluginDirs?: string
  devMods?: Record<string, string> // link name -> target
  piLinks?: Record<string, string>
  codex?: string
  mtime?: Record<string, number>
  // Last commit time (ms) per worktree path; default an hour ago.
  commit?: Record<string, number>
  merged?: string[]
  fail?: (argv: readonly string[]) => boolean
  // A non-zero exit code for a call that otherwise answers normally.
  exit?: (argv: readonly string[]) => number | undefined
  // Files git shows only with --untracked-files=all (status.showUntrackedFiles=no).
  hidden?: Record<string, string>
}
type World = { calls: string[][]; logs: string[]; toasts: string[]; reports: string[]; store: Map<string, unknown>; now: { v: number } }

const item = (branch: string, path: string, ahead: number | null = 0): Item => ({
  branch, path, upstream: ahead === null ? null : { remote: 'origin', branch, ahead },
})
const DEFAULT_ITEMS: Item[] = [{ branch: 'wip/2026-10-03', path: ROOT, main: true, upstream: { remote: 'origin', branch: 'wip/2026-10-03', ahead: 0 } }, item('feat/done', A)]

function wtJson(items: Item[]) {
  return JSON.stringify({
    schema: 2,
    repo: { default_branch: 'main' },
    items: items.map(i => ({
      branch: i.branch,
      worktree: { path: i.path, main: !!i.main, current: false, detached: false, changes: { staged: false, modified: false, untracked: false } },
      upstream: i.upstream ?? null,
    })),
  })
}

function world(on: On, o: Opts = {}): World {
  const w: World = { calls: [], logs: [], toasts: [], reports: [], store: new Map(), now: { v: NOW } }
  const items = o.items ?? DEFAULT_ITEMS
  const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode: exitCode || (o.exit?.(argv) ?? 0), stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('session.cwd', () => ({ value: o.cwd ?? ROOT }))
  let argv: readonly string[] = []
  on('process.run', (_$, e) => {
    const a = e.argv
    argv = a
    // The heartbeat and report folder: not a reaper decision, not counted.
    if (a[0] === 'mkdir') return ok('')
    w.calls.push([...a])
    if (o.fail?.(a)) throw new Error('timed out')
    if (a[0] === 'git' && a.includes('rev-parse')) return ok(`${a[2]}\n`)
    if (a[0] === 'wt' && a.includes('list')) return ok(wtJson(items))
    if (a[0] === 'wt' && a.includes('remove')) return ok('')
    if (a[0] === 'lsof') return ok(['p1', 'fcwd', 'n/', ...(o.lsof ?? []).flatMap((p, i) => [`p${i + 2}`, 'fcwd', `n${p}`])].join('\n') + '\n')
    if (a[0] === 'git' && a.includes('status')) return ok((o.status?.[a[2]] ?? '') + (a.includes('--untracked-files=all') ? o.hidden?.[a[2]] ?? '' : ''))
    if (a[0] === 'git' && a.includes('log')) return ok(`${Math.floor((o.commit?.[a[2]] ?? NOW - 60 * 60 * 1000) / 1000)}\n`)
    if (a[0] === 'git' && a.includes('--merged')) return ok(['  origin/HEAD -> origin/main', '  origin/main', ...(o.merged ?? []).map(b => `  origin/${b}`)].join('\n') + '\n')
    return ok('', 1)
  })
  const env: Record<string, string> = { HOME, CLAUDE_CODE_PLUGIN_DIRS: o.pluginDirs ?? `${ROOT}/jeraptha/hooks` }
  on('env.get', (_$, e) => ({ value: env[e.name] }) as never)
  const dm = `${HOME}/.claude/dev-mods`
  const pi = `${HOME}/.pi/agent/extensions`
  const links: Record<string, string> = {}
  for (const [n, t] of Object.entries(o.devMods ?? { 'dev-rules': `${ROOT}/jeraptha/hooks` })) links[`${dm}/s1/${n}`] = t
  for (const [n, t] of Object.entries(o.piLinks ?? {})) links[`${pi}/${n}`] = t
  on('fs.list', (_$, e) => {
    if (e.path === dm) return { value: [{ name: 's1', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }
    const pre = e.path + '/'
    const names = Object.keys(links).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
    if (!names.length && e.path !== `${dm}/s1` && e.path !== pi) throw new Error('ENOENT')
    return { value: names.map(k => ({ name: k.slice(pre.length), kind: 'other', size: 0, mtimeMs: 0, isLink: true })) }
  })
  on('fs.stat', (_$, e) => {
    if (e.path in links) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true, ...(e.resolve ? { realPath: links[e.path] } : {}) } }
    // Every worktree folder exists; made an hour ago unless the world says otherwise.
    return { value: { kind: 'dir', size: 0, mtimeMs: o.mtime?.[e.path] ?? NOW - 60 * 60 * 1000, isLink: false } }
  })
  on('fs.read', (_$, e) => {
    if (e.path === `${HOME}/.codex/hooks.json` && o.codex !== undefined) return { value: o.codex }
    throw new Error('ENOENT')
  })
  on('clock.now', () => ({ value: w.now.v }))
  // The turn-end hook schedules the reaper with $.clock.after: resolve at once.
  on('clock.after', () => ({ value: undefined }))
  on('fs.write', (_$, e) => { w.reports.push(e.text); return { value: undefined } })
  on('store.get', (_$, e) => ({ value: w.store.get(e.key) }))
  on('store.set', (_$, e) => { w.store.set(e.key, e.value); return { value: undefined } })
  on('ui.log', (_$, e) => { w.logs.push(e.text); return { value: undefined } })
  on('ui.toast', (_$, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('turn.complete', () => ({ text: 'ok' }))
  return w
}

const removes = (w: World) => w.calls.filter(c => c[0] === 'wt' && c.includes('remove'))

// The hook does not wait for the reaper: wait until no process call has come for a while.
async function quiet(w: World) {
  let n = -1
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 20))
    if (w.calls.length === n && n > 0) return
    n = w.calls.length
  }
}

async function turnEnd($: any, w: World, agentId?: string) {
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, ...(agentId ? { agentId } : {}) })
  await quiet(w)
}

test('a pushed, clean, idle, unloaded, old worktree is removed with wt remove, branch kept', async ($, on) => {
  const w = world(on)
  await turnEnd($, w)
  expect(removes(w)).toEqual([['wt', '-C', ROOT, 'remove', '--no-delete-branch', '--force', '--yes', '--foreground', 'feat/done']])
  expect(w.logs).toContain('worktree-reaper: removed feat/done (pushed and clean, branch kept)')
  expect(w.toasts).toEqual(['worktree-reaper: removed 1 finished worktree'])
})

test('a merged one is removed with -D (local branch only)', async ($, on) => {
  const w = world(on, { merged: ['feat/done'] })
  await turnEnd($, w)
  expect(removes(w)).toEqual([['wt', '-C', ROOT, 'remove', '-D', '--force', '--yes', '--foreground', 'feat/done']])
  expect(w.logs).toContain('worktree-reaper: removed feat/done (merged into origin/main, local branch deleted)')
  // Never a remote delete.
  expect(w.calls.some(c => c.includes('push') || c.includes('--delete'))).toBe(false)
})

test('only untracked node_modules counts as clean', async ($, on) => {
  const w = world(on, { status: { [A]: '?? node_modules\n' } })
  await turnEnd($, w)
  expect(removes(w).length).toBe(1)
})

const blocked: [string, Opts][] = [
  ['rule 1: the main checkout is never reaped', { items: [{ ...item('wip/2026-10-03', ROOT), main: true }] }],
  ['rule 2: no upstream', { items: [DEFAULT_ITEMS[0], item('feat/done', A, null)] }],
  ['rule 2: commits ahead of upstream', { items: [DEFAULT_ITEMS[0], item('feat/done', A, 2)] }],
  ['rule 3: unsaved changes', { status: { [A]: ' M hooks/x.ts\n?? node_modules\n' } }],
  ['rule 4: a process has its cwd inside', { lsof: [`${A}/_ob/mods`] }],
  ['rule 4: the session itself is inside it', { cwd: `${A}/_ob` }],
  ['rule 5: CLAUDE_CODE_PLUGIN_DIRS loads from it', { pluginDirs: `${ROOT}/jeraptha/hooks:${A}/_ob/mods/statusbar` }],
  ['rule 5: a dev-mods symlink points into it', { devMods: { statusbar: `${A}/_ob/mods/statusbar` } }],
  ['rule 5: a Pi extension symlink points into it', { piLinks: { _jev: `${A}/_ob/pi-extensions/_jev` } }],
  ['rule 5: the Codex hooks file names it', { codex: `{"command":"node ${A}/hooks/x.ts"}` }],
  ['rule 6: made under 10 minutes ago', { mtime: { [A]: NOW - 5 * 60 * 1000 } }],
  ['rule 6b: last commit under 10 minutes ago (a lane that just pushed)', { commit: { [A]: NOW - 3 * 60 * 1000 } }],
]
for (const [name, o] of blocked) {
  test(`${name}: nothing removed, silent`, async ($, on) => {
    const w = world(on, o)
    await turnEnd($, w)
    expect(removes(w).length).toBe(0)
    expect(w.toasts.length).toBe(0)
    expect(w.logs.filter(l => l.startsWith('worktree-reaper')).length).toBe(0)
  })
}

test('a session inside a linked worktree: wt runs from the main checkout, that worktree stays', async ($, on) => {
  const B = `${WTS}/feat-other`
  const w = world(on, { cwd: `${A}/hooks`, items: [...DEFAULT_ITEMS, item('feat/other', B)] })
  await turnEnd($, w)
  expect(removes(w).map(c => c[c.length - 1])).toEqual(['feat/other'])
  expect(removes(w)[0].slice(0, 3)).toEqual(['wt', '-C', ROOT])
})

test('a sibling whose name only shares the prefix does not block', async ($, on) => {
  const w = world(on, { lsof: [`${A}-two`], codex: `"${A}-two/x"` })
  await turnEnd($, w)
  expect(removes(w).length).toBe(1)
})

test('throttle: a second turn end within 5 minutes does nothing, after 5 it runs', async ($, on) => {
  const w = world(on, { status: { [A]: ' M x\n' } })
  await turnEnd($, w)
  const first = w.calls.length
  expect(first).toBeGreaterThan(0)
  w.now.v = NOW + 4 * 60 * 1000
  await turnEnd($, w)
  expect(w.calls.length).toBe(first)
  w.now.v = NOW + 6 * 60 * 1000
  await turnEnd($, w)
  expect(w.calls.length).toBeGreaterThan(first)
})

test('a subagent turn is ignored', async ($, on) => {
  const w = world(on)
  await turnEnd($, w, 'agent-1')
  expect(w.calls.length).toBe(0)
})

test('a session outside Development and _tmp is ignored', async ($, on) => {
  const w = world(on, { cwd: '/Users/me/elsewhere' })
  await turnEnd($, w)
  expect(w.calls.length).toBe(0)
})

for (const [what, fail] of [
  ['git rev-parse', (a: readonly string[]) => a.includes('rev-parse')],
  ['wt list', (a: readonly string[]) => a[0] === 'wt' && a.includes('list')],
  ['lsof', (a: readonly string[]) => a[0] === 'lsof'],
  ['git status', (a: readonly string[]) => a.includes('status')],
  ['wt remove', (a: readonly string[]) => a.includes('remove')],
] as const) {
  test(`a failing ${what} skips without throwing and the turn ends normally`, async ($, on) => {
    const w = world(on, { fail })
    const r = await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false })
    await quiet(w)
    expect(r.text).toBe('ok')
    expect(w.logs.filter(l => l.startsWith('worktree-reaper: removed')).length).toBe(0)
    expect(w.toasts.length).toBe(0)
  })
}

test('a failing merged check still removes, keeping the branch', async ($, on) => {
  const w = world(on, { fail: a => a.includes('--merged') })
  await turnEnd($, w)
  expect(removes(w).map(c => c[4])).toEqual(['--no-delete-branch'])
})

test('helpers: porcelain, lsof lines, path mentions', () => {
  expect(onlyIgnorableUntracked('?? node_modules\n?? a/node_modules/\n')).toBe(true)
  expect(onlyIgnorableUntracked('?? node_modules\n M x\n')).toBe(false)
  expect(lsofCwds('p1\nfcwd\nn/a/b/\np2\nfcwd\nn/c\n')).toEqual(['/a/b', '/c'])
  expect(mentions('x /a/b/c y', '/a/b')).toBe(true)
  expect(mentions('"/a/b"', '/a/b')).toBe(true)
  expect(mentions('/a/b-two', '/a/b')).toBe(false)
})

test('each run writes a report naming why every worktree was kept or removed', async ($, on) => {
  const w = world(on, { status: { [A]: ' M x.ts\n' } })
  await turnEnd($, w)
  const report = JSON.parse(w.reports[w.reports.length - 1] ?? '{}')
  expect(report.stage).toBe('checked')
  expect(report.kept.some((k: string) => k.endsWith('unsaved changes'))).toBe(true)
})

// Rule 1 on its own: a main checkout (a clone) under _tmp/_worktrees, the
// session elsewhere and nothing loading from it, so only rule 1 stands
// between it and removal.
test('rule 1 alone keeps the main checkout', async ($, on) => {
  const M = `${WTS}/a-clone`
  const w = world(on, { cwd: `${WTS}/somewhere`, pluginDirs: '', devMods: {}, items: [{ ...item('main', M), main: true }] })
  await turnEnd($, w)
  expect(removes(w).length).toBe(0)
})

test('an untracked file hidden by status.showUntrackedFiles=no keeps the worktree', async ($, on) => {
  const w = world(on, { hidden: { [A]: '?? new-work.ts\n' } })
  await turnEnd($, w)
  expect(removes(w).length).toBe(0)
})

test('a linked worktree outside _tmp/_worktrees is never reaped', async ($, on) => {
  const w = world(on, { items: [DEFAULT_ITEMS[0], item('feat/elsewhere', '/mnt/elsewhere/feat')] })
  await turnEnd($, w)
  expect(removes(w).length).toBe(0)
})

// The stub answers normally but exits non-zero: the exit-code guard alone keeps it.
for (const [what, exit] of [
  ['git rev-parse', (a: readonly string[]) => (a.includes('rev-parse') ? 128 : undefined)],
  ['wt list', (a: readonly string[]) => (a[0] === 'wt' && a.includes('list') ? 1 : undefined)],
  ['git log', (a: readonly string[]) => (a[0] === 'git' && a.includes('log') ? 128 : undefined)],
  ['git status', (a: readonly string[]) => (a[0] === 'git' && a.includes('status') ? 128 : undefined)],
] as const) {
  test(`a non-zero ${what} exit keeps the worktree`, async ($, on) => {
    const w = world(on, { exit })
    await turnEnd($, w)
    expect(removes(w).length).toBe(0)
  })
}

test('a non-zero wt remove exit is not reported as removed', async ($, on) => {
  const w = world(on, { exit: a => (a[0] === 'wt' && a.includes('remove') ? 1 : undefined) })
  await turnEnd($, w)
  expect(removes(w).length).toBe(1)
  expect(w.logs.filter(l => l.startsWith('worktree-reaper: removed')).length).toBe(0)
  expect(w.toasts.length).toBe(0)
  expect(JSON.parse(w.reports[w.reports.length - 1] ?? '{}').kept).toContain('feat/done: wt remove failed (exit 1)')
})
