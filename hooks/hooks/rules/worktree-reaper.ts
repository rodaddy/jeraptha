import type { On, EngineInterface } from 'claude-code'

// Rico, 2026-10-04: "When shit gets put out there and then it's done, it's
// done, remove it." A linked worktree whose branch is pushed and that holds
// nothing unsaved is removed; the branch stays on Forge (`wt switch` reopens
// it for review fixes). Runs at the main agent's turn end (at most every 5
// minutes) and from compact-save's rollover just before /clear, because a
// fresh-session rollover may leave no handover to clean up at.
// Every check is deterministic (wt's JSON, git porcelain, lsof, symlinks and
// one file); any failure skips that worktree and never breaks the turn.

import { DEV_ROOT as DEV, TMP_ROOT as TMP } from '../config.ts'
// The only place the reaper removes from (the wt worktree root).
const WORKTREES = `${TMP}/_worktrees`
const TIMEOUT_MS = 5_000
export const THROTTLE_MS = 5 * 60 * 1000
export const MIN_AGE_MS = 10 * 60 * 1000
export const LAST_RUN = 'worktree-reaper.lastRun'

const under = (p: string, root: string) => p === root || p.startsWith(root + '/')
const strip = (p: string) => p.replace(/\/+$/, '') || '/'

/** True when porcelain holds only untracked node_modules entries (the wt pre-start symlink).
 * Copied from statusbar/hooks/lib/parse.ts onlyIgnorableUntracked, not imported. */
export function onlyIgnorableUntracked(porcelain: string): boolean {
  const lines = porcelain.split('\n').filter(l => l.length > 0)
  return lines.length > 0 && lines.every(l => /^\?\? (?:.*\/)?node_modules\/?$/.test(l))
}

/** The `n` lines of `lsof -a -d cwd -Fn`: each process's cwd. */
export function lsofCwds(out: string): string[] {
  return out.split('\n').filter(l => l.startsWith('n/')).map(l => strip(l.slice(1)))
}

/** True when `text` names `path` itself or a path under it (not a sibling sharing its prefix). */
export function mentions(text: string, path: string): boolean {
  const esc = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${esc}(?![A-Za-z0-9._-])`).test(text)
}

export type WtItem = {
  branch?: string | null
  worktree?: { path?: string; main?: boolean; detached?: boolean }
  upstream?: { remote?: string; branch?: string; ahead?: number } | null
}
export type WtList = { repo?: { default_branch?: string }; items?: WtItem[] }

export type Removal = { branch: string; path: string; merged: boolean }

/** The engine calls the reaper makes. A plugin's $ cannot cross an import (the
 * engine's load check), so each caller binds these to its own $: see ioOf below
 * and compact-save's rollover. */
export type ReaperIo = {
  cwd(): Promise<string>
  run(argv: string[], init: { timeoutMs: number }): Promise<{ exitCode: number; stdout: string }>
  pluginDirs(): Promise<string | undefined>
  home(): Promise<string | undefined>
  list(path: string): Promise<readonly { name: string; isLink: boolean }[]>
  stat(path: string, opts: { resolve: boolean }): Promise<{ kind: string; mtimeMs: number; isLink: boolean; realPath?: string }>
  read(path: string): Promise<string>
  now(): Promise<number>
  get(key: string): Promise<unknown>
  set(key: string, value: number): Promise<unknown>
  log(text: string): Promise<unknown>
  toast(text: string, opts: { timeoutMs: number }): Promise<unknown>
  // Optional: where the last run's report goes (~/.local/state/worktree-reaper/last.json).
  write?(path: string, text: string): Promise<unknown>
}

/** What the last run decided, written after each run so a quiet reaper can be read. */
type Report = { at: number; stage: string; kept: string[]; removed: string[] }
let report: Report = { at: 0, stage: 'not run', kept: [], removed: [] }

async function run(io: ReaperIo, argv: string[]): Promise<{ exitCode: number; stdout: string } | undefined> {
  try {
    return await io.run(argv, { timeoutMs: TIMEOUT_MS })
  } catch {
    return undefined
  }
}

/** Every path something loads from: CLAUDE_CODE_PLUGIN_DIRS, dev-mods and Pi extension
 * symlink targets. The Codex hooks file is returned as text (`codex`), matched by mention. */
async function loadedFrom(io: ReaperIo): Promise<{ paths: string[]; codex: string } | undefined> {
  try {
    const paths: string[] = []
    const dirs = (await io.pluginDirs()) ?? ''
    for (const d of dirs.split(':')) if (d.trim()) paths.push(strip(d.trim()))
    const home = await io.home()
    if (!home) return undefined
    const linksIn = async (dir: string) => {
      let entries: { name: string; isLink: boolean }[] = []
      try { entries = await io.list(dir) } catch { return }
      for (const ent of entries) {
        if (!ent.isLink) continue
        const s = await io.stat(`${dir}/${ent.name}`, { resolve: true }).catch(() => undefined)
        if (s?.realPath) paths.push(strip(s.realPath))
      }
    }
    let sessions: { name: string }[] = []
    try { sessions = await io.list(`${home}/.claude/dev-mods`) } catch { sessions = [] }
    for (const s of sessions) await linksIn(`${home}/.claude/dev-mods/${s.name}`)
    await linksIn(`${home}/.pi/agent/extensions`)
    let codex = ''
    try { codex = await io.read(`${home}/.codex/hooks.json`) } catch { codex = '' }
    return { paths, codex }
  } catch {
    return undefined
  }
}

/**
 * Finds the reapable linked worktrees of the session's repo. Nothing is removed.
 * Returns undefined when the repo, wt or lsof cannot be read (then nothing is reapable).
 */
export async function findReapable(io: ReaperIo): Promise<{ root: string; remote: string; base: string; items: Removal[] } | undefined> {
  const stop = (stage: string) => {
    report.stage = stage
    return undefined
  }
  const cwd = strip(await io.cwd())
  const top = await run(io, ['git', '-C', cwd, 'rev-parse', '--show-toplevel'])
  if (!top || top.exitCode !== 0 || !top.stdout.trim()) return stop(`no git toplevel for ${cwd}`)
  const listed = await run(io, ['wt', '-C', top.stdout.trim(), 'list', '--format=json'])
  if (!listed || listed.exitCode !== 0) return stop('wt list failed')
  let wt: WtList
  try { wt = JSON.parse(listed.stdout) } catch { return stop('wt list output is not JSON') }
  const items = wt.items ?? []
  const mainPath = items.find(i => i.worktree?.main)?.worktree?.path
  if (!mainPath) return stop('wt list has no main worktree')
  const root = strip(mainPath)

  const ls = await run(io, ['lsof', '-a', '-d', 'cwd', '-Fn'])
  if (!ls || lsofCwds(ls.stdout).length === 0) return stop('lsof gave no cwds')
  const cwds = [...lsofCwds(ls.stdout), cwd]
  const loads = await loadedFrom(io)
  if (!loads) return stop('could not read the load paths')
  const now = await io.now()
  report.stage = 'checked'

  const out: Removal[] = []
  let remote = 'origin'
  for (const it of items) {
    const path = it.worktree?.path ? strip(it.worktree.path) : ''
    const branch = it.branch ?? ''
    const keep = (why: string) => report.kept.push(`${branch || path}: ${why}`)
    try {
      // 1. A linked worktree on a branch, not the main checkout.
      if (!path || !branch || it.worktree?.main || it.worktree?.detached || path === root) continue
      // 1b. Only worktrees under _tmp/_worktrees are ever removed.
      if (!under(path, WORKTREES) || path === WORKTREES) { keep('outside _tmp/_worktrees'); continue }
      // 2. Pushed: an upstream and nothing ahead of it.
      if (!it.upstream || it.upstream.ahead !== 0) { keep('not pushed'); continue }
      // 4. No process (the session included) has its cwd in it.
      if (cwds.some(c => under(c, path))) { keep('a process cwd is inside'); continue }
      // 5. Nothing loads from it.
      if (loads.paths.some(p => under(p, path)) || mentions(loads.codex, path)) { keep('a plugin dir, link or hook points into it'); continue }
      // 6. Older than 10 minutes.
      const st = await io.stat(path, { resolve: false }).catch(() => undefined)
      if (!st || st.kind !== 'dir' || now - st.mtimeMs <= MIN_AGE_MS) { keep('folder under 10 minutes old or unreadable'); continue }
      // 6b. Last commit older than 10 minutes too: a lane that has just
      // pushed and keeps working must not lose its tree mid-lane (lane cwds
      // are not visible to lsof, so rule 4 cannot see them).
      const last = await run(io, ['git', '-C', path, 'log', '-1', '--format=%ct'])
      const at = Number(last?.stdout.trim()) * 1000
      if (!last || last.exitCode !== 0 || !Number.isFinite(at) || now - at <= MIN_AGE_MS) { keep('last commit under 10 minutes old or unreadable'); continue }
      // 3. Nothing unsaved (last: it is the costliest check). --untracked-files=all
      // overrides status.showUntrackedFiles=no, which would hide new files.
      const status = await run(io, ['git', '-C', path, 'status', '--porcelain=v1', '--untracked-files=all'])
      if (!status || status.exitCode !== 0) { keep('git status failed'); continue }
      if (status.stdout.trim() && !onlyIgnorableUntracked(status.stdout)) { keep('unsaved changes'); continue }
      remote = it.upstream.remote || remote
      out.push({ branch, path, merged: false })
    } catch (err) {
      // A worktree that cannot be read is never reaped.
      keep(`error: ${(err as Error)?.message ?? err}`)
    }
  }
  if (out.length) {
    const base = `${remote}/${wt.repo?.default_branch || 'main'}`
    const merged = await run(io, ['git', '-C', root, 'branch', '-r', '--merged', base])
    if (merged && merged.exitCode === 0) {
      const names = new Set(merged.stdout.split('\n').map(l => l.trim()).filter(Boolean))
      for (const r of out) r.merged = names.has(`${remote}/${r.branch}`)
    }
  }
  return { root, remote, base: `${remote}/${wt.repo?.default_branch || 'main'}`, items: out }
}

let running = false

/**
 * Removes every reapable worktree of the session's repo. `throttle` (the turn-end
 * path) runs at most once every 5 minutes. Never throws; returns the branches removed.
 */
export async function reapWorktrees(io: ReaperIo, opts: { throttle?: boolean } = {}): Promise<string[]> {
  if (running) return []
  running = true
  let ran = false
  try {
    const now = await io.now()
    if (opts.throttle) {
      const last = await io.get(LAST_RUN)
      if (typeof last === 'number' && now - last < THROTTLE_MS) return []
    }
    await io.set(LAST_RUN, now)
    ran = true
    report = { at: now, stage: 'started', kept: [], removed: [] }
    const found = await findReapable(io)
    if (!found) return []
    const removed: string[] = []
    for (const r of found.items) {
      // Removes the worktree only; -D also drops the local branch once merged. The
      // remote branch is never touched. --force only for the untracked symlink.
      const argv = r.merged
        ? ['wt', '-C', found.root, 'remove', '-D', '--force', '--yes', '--foreground', r.branch]
        : ['wt', '-C', found.root, 'remove', '--no-delete-branch', '--force', '--yes', '--foreground', r.branch]
      const res = await run(io, argv)
      if (!res || res.exitCode !== 0) {
        report.kept.push(`${r.branch}: wt remove failed (exit ${res?.exitCode ?? 'none'})`)
        continue
      }
      removed.push(r.branch)
      report.removed.push(r.branch)
      const reason = r.merged ? `merged into ${found.base}, local branch deleted` : 'pushed and clean, branch kept'
      try { await io.log(`worktree-reaper: removed ${r.branch} (${reason})`) } catch {}
    }
    if (removed.length) {
      try { await io.toast(`worktree-reaper: removed ${removed.length} finished worktree${removed.length === 1 ? '' : 's'}`, { timeoutMs: 8_000 }) } catch {}
    }
    return removed
  } catch (err) {
    report.stage = `error: ${(err as Error)?.message ?? err}`
    return []
  } finally {
    running = false
    if (ran && io.write) {
      try {
        const home = await io.home()
        if (home) {
          const dir = `${home}/.local/state/worktree-reaper`
          await io.run(['mkdir', '-p', dir], { timeoutMs: TIMEOUT_MS })
          await io.write(`${dir}/last.json`, JSON.stringify(report, null, 2) + '\n')
        }
      } catch (err) {
        try { await io.log(`worktree-reaper: report not written (${(err as Error)?.message ?? err})`) } catch {}
      }
    }
  }
}

function ioOf($: EngineInterface): ReaperIo {
  return {
    cwd: () => $.session.cwd(),
    run: (argv, init) => $.process.run(argv, init),
    pluginDirs: () => $.env.get('CLAUDE_CODE_PLUGIN_DIRS'),
    home: () => $.env.get('HOME'),
    list: path => $.fs.list(path),
    stat: (path, opts) => $.fs.stat(path, opts),
    read: path => $.fs.read(path),
    now: () => $.clock.now(),
    get: key => $.store.get(key),
    set: (key, value) => $.store.set(key, value),
    log: text => $.ui.log(text),
    toast: (text, opts) => $.ui.toast(text, opts),
    write: (path, text) => $.fs.write(path, text),
  }
}

export function worktreeReaper(on: On) {
  on('turn.complete', async ($, e, next) => {
    try {
      const cwd = strip(await $.session.cwd())
      // Heartbeat: proves the hook fired, with what it saw, even when the
      // run is skipped (subagent, outside Development, throttled).
      try {
        const home = await $.env.get('HOME')
        if (home) {
          const dir = `${home}/.local/state/worktree-reaper`
          await $.process.run(['mkdir', '-p', dir], { timeoutMs: TIMEOUT_MS })
          await $.fs.write(`${dir}/hook.json`, JSON.stringify({ at: await $.clock.now(), cwd, agentId: e.agentId ?? null }) + '\n')
        }
      } catch (err) {
        try { $.ui.log(`worktree-reaper: heartbeat not written (${(err as Error)?.message ?? err})`) } catch {}
      }
      // Scheduled, not awaited: removals can outlast the hook budget, and work
      // left running after a hook returns is not kept; a timer is (the same
      // pattern compact-save's rollover uses).
      if (!e.agentId && (under(cwd, DEV) || under(cwd, TMP)))
        $.clock.after(200, async () => {
          await reapWorktrees(ioOf($), { throttle: true })
        })
    } catch (err) {
      try { $.ui.log(`worktree-reaper: not scheduled (${(err as Error)?.message ?? err})`) } catch {}
    }
    return next(e)
  })
}
