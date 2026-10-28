import type { EngineInterface, On } from 'claude-code'
import { reapWorktrees, type ReaperIo } from './worktree-reaper.ts'

// Rico, 2026-10-03: work keeps going through a compaction instead of ending.
// Before the main conversation compacts, a fork of it writes a detailed
// handoff to TEMP scratch (never the repo, never a .gitignore); right after,
// one user-role note tells the model to read it. The handoff is model prose,
// so its first line says it is unverified, except its opening section, Rico's
// ask, which the hook copies verbatim. A compaction is never blocked.

import { DEV_ROOT as DEV, TMP_ROOT as TMP } from '../config.ts'

export const HEADER =
  '# Pre-compaction handoff (model-written, unverified: check claims against git, Forge and the files before acting)'

// Copied from the starter-kit mod auto-handoff
// (claude-mods-starter-kit/plugins/auto-handoff/hooks/auto-handoff.mjs,
// HANDOFF_PROMPT): its 10 sections and its no-secrets rule. The first
// paragraph is ours. The fork sends this as a user message, so without it the
// fork recorded "Do not call any tools" as Rico's instruction; and mid-turn
// the fork sees only the main thread's last request, so it never sees the
// tool calls that ran after the last user message (rollover probe,
// 2026-10-04). Those the rule records itself (cutTurnSection).
export const HANDOFF_PROMPT = `This message comes from the dev-rules plugin, not from the user, and is not part of the work: do not record it, or its no-tools rule, as a user request or instruction. The session may have been cut in the middle of a turn: tool calls that ran after the last user message are not in what you see, so do not say that request was skipped or not started. The plugin appends its own record of those calls.

Write a cold-start handoff for this session, so a new agent with no access to this conversation can pick up the work exactly where it stands. Do not call any tools. Answer with the document only.

Line 1 must be exactly "LATEST: " followed by one sentence on where the session landed. Then a blank line, then the handoff in markdown with these sections, each as a "##" heading:

## 1. Session intent
The goal and what the user actually wanted.
## 2. The back-and-forth
The meaningful requests, responses and pivots, in order, and why they happened.
## 3. Tools and skills used
Each material tool or skill used and what it accomplished.
## 4. Research, data, and sources
Outside information brought in and the findings that shaped decisions. "None" if none.
## 5. Iterations and generations
Versions, generated assets and what changed each pass. "None" if none.
## 6. Decisions locked
Settled decisions and why each was made. List unresolved decisions separately.
## 7. Current state
What is done, in progress or blocked. Say plainly what was verified (tests run, output seen) and what was not.
## 8. Asset map
Every file created, changed or important to the work, with its path and what it is for.
## 9. Open threads and next steps
Open questions, then the exact next steps in order, with the commands to run where they matter.
## 10. For the next agent
What to read first and the traps a cold start is likely to hit.

Rules: use only facts from this conversation and mark anything assumed. Include exact paths, commands, branch names, ports and test results when they matter. Never include passwords, API keys, tokens or other secrets. Do not use em dashes.`

const under = (p: string, root: string) => p === root || p.startsWith(root + '/')

export function inScope(cwd: string): boolean {
  return under(cwd, DEV) || under(cwd, TMP)
}

/**
 * `/work/_tmp/<project>/<repo>/_handoff` for a cwd and its git
 * root (or none). Never a new top-level folder under _tmp other than
 * `_handoff`; project and repo are lower-cased as
 * the workspace-path helper does.
 */
export function handoffDir(cwd: string, gitRoot: string | undefined): string {
  const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p
  const at = (project: string, repo: string) => `${TMP}/${project.toLowerCase()}/${repo.toLowerCase()}/_handoff`
  if (under(cwd, DEV)) return at('development', base(gitRoot ?? cwd))
  const shared = `${TMP}/_handoff/${base(gitRoot ?? cwd)}`
  if (!under(cwd, TMP)) return shared
  const seg = cwd.slice(TMP.length + 1).split('/').filter(Boolean)
  // A lane worktree: _worktrees/<harness>/<project>/<repo>/<purpose>/...
  if (seg[0] === '_worktrees') return seg.length >= 5 ? at(seg[2], seg[3]) : shared
  // Outside any git repo (a scratch cwd, say): the shared bucket.
  if (!gitRoot) return shared
  // A clone inside an existing project area: _tmp/<project>/<repo>/...
  return seg.length >= 2 && !seg[0].startsWith('_') ? at(seg[0], seg[1]) : shared
}

/** Local `YYYY-MM-DD-HHMMSS`, as auto-handoff stamps its files. */
export function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function noteText(path: string): string {
  return `A compaction just ran. Before continuing, read ${path}: it holds the detail the compaction summary dropped. It is model-written and unverified; check what it calls done against git, Forge and the files.`
}

// Rico, 2026-10-05: a rollover handoff listed every open PR as the
// work and dropped his ask, and the next session ran the inflated scope.
// Every handoff now opens with his ask, verbatim, copied by this hook (never
// the model): the first prompt that is not a bare "continue", plus the last
// three. Recorded at prompt.submit, where the engine stamps the origin, so a
// plugin's, a peer's or a notification's prompt is never taken for his.
export const ASK_HEADING = "## Rico's ask (verbatim)"

export type Ask = { text: string; at?: string }

// The user's own gesture: Enter at the terminal, Remote Control, the SDK host.
const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
const BARE = /^(continue|keep going)[.!]*$/i
// Transcript user rows that are not Rico typing (the fallback path only).
const NOT_ASKED = [
  /^<(system-reminder|command-|local-command|task-notification)/,
  /^This session is being continued from a previous conversation/,
  /^A compaction just ran\. Before continuing, read /,
  /^Read \S+ first: it is the pre-rollover handoff /,
]

/** The first ask that is not a bare "continue"/"keep going", then the last three, in order. */
export function pickAsks(asks: readonly Ask[]): Ask[] {
  const keep = new Set<number>()
  const first = asks.findIndex(a => !BARE.test(a.text.trim()))
  if (first >= 0) keep.add(first)
  for (let i = Math.max(0, asks.length - 3); i < asks.length; i++) keep.add(i)
  return [...keep].sort((a, b) => a - b).map(i => asks[i])
}

/** Rico's messages as the compacted transcript holds them: no tool results, no system text. */
export function fromTranscript(messages: readonly { role: string; text: string; toolResults?: readonly unknown[] }[]): Ask[] {
  const out: Ask[] = []
  for (const m of messages) {
    if (m.role !== 'user' || m.toolResults?.length) continue
    const text = m.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
    if (text && !NOT_ASKED.some(r => r.test(text))) out.push({ text })
  }
  return out
}

/** The handoff's opening section; each message fenced longer than any backtick run in it. */
export function askSection(asks: readonly Ask[], recorded: boolean): string {
  const lines = [
    ASK_HEADING,
    recorded
      ? 'Copied by the compact-save hook from the prompts Rico submitted, not written by the model. This is the scope; everything below is context.'
      : 'Copied by the compact-save hook from the compacted transcript (no prompt was recorded in this process, so no times), not written by the model. This is the scope; everything below is context.',
  ]
  if (!asks.length) lines.push('', 'No message from Rico was found in this session.')
  asks.forEach((a, i) => {
    const runs = a.text.match(/`+/g) ?? []
    const fence = '`'.repeat(Math.max(3, ...runs.map(r => r.length + 1)))
    lines.push('', `${i === 0 ? 'First ask' : 'Recent'}, ${a.at ?? 'time not recorded'}:`, fence, a.text.endsWith('\n') ? a.text.slice(0, -1) : a.text, fence)
  })
  return lines.join('\n')
}

const ROLLOVER_GAP_MS = 5 * 60 * 1000

// Rico, 2026-10-08: "Pause at three handoffs after the third handoff. It
// shouldn't be allowed to continue without my approval." The third rollover in
// a chain clears the session but submits nothing; Rico's next prompt resumes.
export const MAX_HANDOFFS = 3

export function pausedText(path: string, count = MAX_HANDOFFS): string {
  return `compact-save: paused after ${count} handoffs (operator ruling 2026-10-08). Nothing runs until Rico sends a prompt. Handoff: ${path}`
}

// Rico, 2026-10-12: every pause, the cap's and the idle one's, offers a menu
// ($.ui.ask): a full handover to a brand new session, or a few more rollovers
// in this chain.
export const FULL_HANDOVER = 'Full handover'
export const RUN_MORE = { 'Run 2 more': 2, 'Run 3 more': 3, 'Run 4 more': 4 } as const
export const MENU_HEADER = 'Rollover'

export function menuQuestion(count: number, path: string, idle = false): string {
  const why = idle ? `Paused, ${IDLE_REASON}; the handoff is ${path}.` : `Paused after ${count} handoffs; the latest is ${path}.`
  return `${why} Do a full handover to a brand new session, or run more rollovers in this chain?`
}

export function handoverPrompt(path: string): string {
  return `Rico chose "${FULL_HANDOVER}" from the compact-save pause menu. Read ${path} first: it is the pre-rollover handoff from the previous session (model-written, unverified; check its claims against git, Forge and the files). Do NOT continue the work it describes. Instead run the handover-author skill now, with the full drain exactly as the skill states, using that handoff and its "Rico's ask (verbatim)" section as input. End on the kickoff paste for a brand new session.`
}

// Rico, 2026-10-08 ("Roll over before expiry"): a large session left idle
// comes back to a cold prompt cache and re-reads everything at full price. So
// after a main turn ends, one timer waits until shortly before the cache
// expires; if no turn ran since and the context is large, the session hands
// over, clears and pauses as the cap does. It neither counts toward the cap
// nor resets it.
export const IDLE_REASON = 'idle near cache expiry'

export function idlePausedText(path: string): string {
  return `compact-save: paused, ${IDLE_REASON} (operator ruling 2026-10-08). Nothing runs until Rico sends a prompt. Handoff: ${path}`
}

export function idleWhy(minutes: number): string {
  return `This session is being handed over because it sat idle for ${minutes} minutes and its prompt cache is about to expire.`
}

export const IDLE_CANCELLED = 'compact-save: idle rollover cancelled: activity'

const DEFAULT_TTL_S = 3600
const DEFAULT_MARGIN_S = 600
const DEFAULT_MIN_TOKENS = 150000

/** The idle timer's settings: TTL > 0, 0 < margin < TTL, min tokens >= 1000;
 * a bad value falls back to the defaults, with one log line naming it. */
export function idleConfig(env: { ttl?: string; margin?: string; minTokens?: string }, log: (text: string) => void) {
  const set = (v: string | undefined) => v !== undefined && v.trim() !== ''
  const bad = (name: string, v: string | undefined) => log(`compact-save: ${name}=${v} is not valid, using the defaults`)
  let ttl = DEFAULT_TTL_S
  let margin = DEFAULT_MARGIN_S
  const t = Number(env.ttl)
  const m = Number(env.margin)
  if (set(env.ttl) && !(Number.isFinite(t) && t > 0)) bad('DEVRULES_CACHE_TTL_S', env.ttl)
  else if (set(env.ttl)) ttl = t
  if (set(env.margin) && !(Number.isFinite(m) && m > 0 && m < ttl)) bad('DEVRULES_CACHE_MARGIN_S', env.margin)
  else if (set(env.margin)) margin = m
  if (margin >= ttl) {
    if (!set(env.margin)) bad('DEVRULES_CACHE_TTL_S', env.ttl)
    ttl = DEFAULT_TTL_S
    margin = DEFAULT_MARGIN_S
  }
  let minTokens = DEFAULT_MIN_TOKENS
  const k = Number(env.minTokens)
  if (set(env.minTokens) && !(Number.isFinite(k) && k >= 1000)) bad('DEVRULES_CACHE_ROLL_MIN_TOKENS', env.minTokens)
  else if (set(env.minTokens)) minTokens = k
  return { waitMs: (ttl - margin) * 1000, minTokens }
}

export function rolloverPrompt(path: string): string {
  return `Read ${path} first: it is the pre-rollover handoff from the previous session (model-written, unverified; check its claims against git, Forge and the files). Then continue the work it describes; a turn it lists as cut was stopped by the rollover, not by the user, so resume it where it stopped.`
}

export type CutCall = { tool: string; input: string; outcome: 'ok' | 'error' | 'denied' }

const PATH_KEYS = ['file_path', 'notebook_path', 'path'] as const

/**
 * A label for a tool call that carries none of its arguments, which can hold
 * credentials or private content: a file tool's path; Bash
 * its own description only, never a word of the command (a quoted
 * `AUTH="Bearer x"` splits on its space); anything else
 * nothing. One line, cut at 200.
 */
export function callInput(e: Record<string, unknown>): string {
  let label = ''
  const path = PATH_KEYS.map(k => e[k]).find(v => typeof v === 'string')
  if (typeof path === 'string') label = path
  else if (e.tool === 'Bash' && typeof e.description === 'string') label = e.description
  const one = label.replace(/\s+/g, ' ').trim()
  return one.length > 200 ? `${one.slice(0, 200)}...` : one
}

/** The plugin's own record of a turn the compaction cut, appended to the handoff; none when no call ran. */
export function cutTurnSection(calls: readonly CutCall[]): string {
  if (!calls.length) return ''
  const lines = calls.map((c, i) => `${i + 1}. ${c.tool}${c.input ? ` \`${c.input.replace(/`/g, "'")}\`` : ''}: ${c.outcome}`)
  return [
    '## Turn cut by the compaction (recorded by the dev-rules plugin, not the model)',
    'The main thread was mid-turn. These tool calls ran in it after the last user message, in order, and the handoff above was written without seeing them. Arguments and outputs are not recorded: a file tool shows its path, Bash its description.',
    '',
    ...lines,
  ].join('\n')
}

export function rolloverSkip(path: string): string {
  return `compact-save: handoff written to ${path}; starting a fresh session`
}

type TranscriptMessages = Parameters<typeof fromTranscript>[0]

/** The engine calls the handoff and rollover make. A plugin's $ cannot cross
 * an import (the engine's load check), so each caller binds these to its own $
 * (rollIo below; lsp-handover). */
export type RollIo = ReaperIo & {
  id(): Promise<string>
  exists(path: string): Promise<boolean>
  write(path: string, text: string): Promise<unknown>
  after(ms: number, fn: () => Promise<void>): unknown
  fork(prompt: string): Promise<{ isAnswered: true; text: string } | { isAnswered: false; reason: string }>
  abort(turnId: string): Promise<unknown>
  clear(): Promise<unknown>
  submit(text: string): Promise<unknown>
  /** A user-role note in the current session; optional, so lsp-handover's binding stands. */
  append?(text: string): Promise<unknown>
  /** The pause menu ($.ui.ask): the chosen label or free text; rejects when dismissed. Optional, as append. */
  ask?(question: string, options: string[]): Promise<string>
}

/** Writes a handoff naming `why`, then rolls over to a fresh session on it, as
 * an auto compaction does; resolves the path, or throws when it will not. */
export type RollOver = (io: RollIo, opts: { reason: string; why: string }) => Promise<string>

// Set by compactSave(on): the engine refuses keeping a value it returns, and
// the rollover's state lives in its closure.
let shared: RollOver | undefined
export const rollOver: RollOver = (io, opts) => (shared ? shared(io, opts) : Promise.reject(new Error('compact-save is not loaded')))

function rollIo($: EngineInterface): RollIo {
  return {
    cwd: () => $.session.cwd(),
    run: (argv, init) => $.process.run(argv, init),
    pluginDirs: () => $.env.get('CLAUDE_CODE_PLUGIN_DIRS'),
    home: () => $.env.get('HOME'),
    list: p => $.fs.list(p),
    stat: (p, opts) => $.fs.stat(p, opts),
    read: p => $.fs.read(p),
    now: () => $.clock.now(),
    get: key => $.store.get(key),
    set: (key, value) => $.store.set(key, value),
    log: text => $.ui.log(text),
    toast: (text, opts) => $.ui.toast(text, opts),
    id: () => $.session.id(),
    exists: p => $.fs.exists(p),
    write: (p, text) => $.fs.write(p, text),
    after: (ms, fn) => $.clock.after(ms, fn),
    fork: prompt => $.model.fork({ prompt }),
    abort: turnId => $.turn.abort({ turnId }),
    clear: () => $.command.run({ command: 'clear', args: '' }),
    submit: text => $.prompt.submit({ text }),
    append: text => $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }),
    ask: (question, options) => $.ui.ask(question, { options, header: MENU_HEADER }),
  }
}

export function compactSave(on: On) {
  // The main loop's running turn. /clear is queued until the session is idle,
  // so an auto compaction mid-turn (inside a tool loop) waited for the turn to
  // end, and the next auto compaction beat it (2026-10-04 17:01, session
  // ca94e5cc). The rollover ends that turn first. Only main turns raise
  // turn.start; the last one's id is kept (turn.complete is the reaper's hook),
  // and aborting a turn that already ended is refused, logged and harmless.
  let lastTurn: string | undefined
  // When this process last rolled over. /clear keeps the process and the
  // module (no session.start, no reload), so a variable survives it; $.store
  // is shared by every session and let one session's rollover turn another's
  // into a compaction for 5 minutes.
  let lastRollover: number | undefined
  // The main thread's tool calls since the last turn.start. An auto compaction
  // fires before a model request, so inside a turn: these are the calls the
  // fork cannot see. A manual or plugin one runs between turns, where the
  // fork saw them all, so only an auto trigger appends them (turn.complete is
  // the reaper's hook, and a plugin holds one unmatched hook per event).
  let cutCalls: CutCall[] = []
  // The idle timer (IDLE_REASON): a generation counter, bumped by every turn
  // start, prompt and compaction, so a pending timer whose generation moved on
  // does nothing. `running` holds while a main turn runs; `rolling` from the
  // start of a handoff's writing to the end of its rollover (or to the end of
  // the writing when no rollover follows), so no second one starts.
  let generation = 0
  let running = false
  let rolling = false
  let idleCfg: { waitMs: number; minTokens: number } | undefined
  let sizeUnreadLogged = false
  let noAskLogged = false
  on('turn.start', ($, e, next) => {
    lastTurn = e.turnId
    cutCalls = []
    generation++
    running = true
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!e.agentId) {
      const outcome = ran.deny !== undefined ? 'denied' : ran.isError ? 'error' : 'ok'
      cutCalls.push({ tool: e.tool, input: callInput(e as Record<string, unknown>), outcome })
    }
    return ran
  })

  // Rico's prompts this session, bounded by pickAsks. /clear keeps the module,
  // so they are keyed to the session id: a session Rico cleared starts empty,
  // one this hook rolled over (carry) keeps them, so the ask survives rollovers.
  let asks: Ask[] = []
  let asksSession: string | undefined
  let carry = false
  // Rollovers in the current chain, and the handoff a pause holds (Rico,
  // 2026-10-08). Module variables, so they survive /clear as lastRollover does.
  // Reset only by Rico: a prompt in a session he started, or his accepted
  // answer to a pause. While paused, a prompt from anyone else is dropped.
  let handoffs = 0
  // The count that pauses this chain: MAX_HANDOFFS, raised by "Run N more".
  let limit = MAX_HANDOFFS
  let paused: string | undefined
  // The pause Rico's own prompt is resuming while it is accepted; a menu
  // answer that lands then is stale.
  let resuming: string | undefined
  // An idle pause (IDLE_REASON) resumes the same way but leaves the count alone.
  let pausedIdle = false
  on('prompt.submit', async ($, e, next) => {
    generation++
    const user = USER_ORIGINS.has(e.origin.kind)
    let result: Awaited<ReturnType<typeof next>>
    const held = paused
    if (held !== undefined && !user) {
      // Paused: nothing but Rico starts a turn (a peer, a plugin, a notification).
      const drop = pausedIdle ? idlePausedText(held) : pausedText(held, handoffs)
      $.ui.log(`${drop} (dropped a ${e.origin.kind} prompt)`)
      return { drop } as Awaited<ReturnType<typeof next>>
    }
    if (held !== undefined && e.text.trim() && !e.text.trim().startsWith('/')) {
      // Rico's prompt is the approval: the fresh session reads the handoff
      // first. The pause clears only once the prompt is accepted; a slash
      // command or an empty prompt passes through and leaves it set.
      resuming = held
      try {
        result = await next({ ...e, text: `${rolloverPrompt(held)}\n\nRico: ${e.text}` })
      } finally {
        resuming = undefined
      }
      if (result.drop === undefined && paused === held) {
        paused = undefined
        if (pausedIdle) pausedIdle = false
        else {
          handoffs = 0
          limit = MAX_HANDOFFS
        }
      }
    } else {
      result = await next(e)
    }
    if (result.drop === undefined && user && e.text.trim()) {
      try {
        const id = await $.session.id()
        if (id !== asksSession) {
          if (!carry) {
            asks = []
            handoffs = 0
            limit = MAX_HANDOFFS
          }
          carry = false
          asksSession = id
        }
        asks = pickAsks([...asks, { text: e.text, at: new Date(await $.clock.now()).toISOString() }])
      } catch (err) {
        $.ui.log(`compact-save: prompt not recorded for the handoff (${(err as Error)?.message ?? err})`)
      }
    }
    return result
  })

  const writeHandoff = async (io: RollIo, cwd: string, prompt: string, messages: TranscriptMessages, auto: boolean) => {
    let written: string | undefined
    try {
      const reply = await io.fork(prompt)
      if (!reply.isAnswered) {
        io.log(`compact-save: no handoff written, the fork returned ${reply.reason}`)
      } else if (!reply.text.trim()) {
        io.log('compact-save: no handoff written, the fork reply was empty')
      } else {
        // Walk up from the cwd to the git root; none: the cwd itself.
        let gitRoot: string | undefined
        for (let d = cwd; d && d !== '/'; d = d.slice(0, d.lastIndexOf('/')) || '/') {
          if (await io.exists(`${d}/.git`)) { gitRoot = d; break }
        }
        const dir = handoffDir(cwd, gitRoot)
        const name = `handoff-${stamp(await io.now())}.md`
        const recorded = asks.length > 0 && (carry || asksSession === (await io.id()))
        const ask = askSection(pickAsks(recorded ? asks : fromTranscript(messages)), recorded)
        const cut = auto ? cutTurnSection(cutCalls) : ''
        // $.fs.write creates the folder as needed.
        await io.write(`${dir}/${name}`, `${HEADER}\n\n${ask}\n\n${reply.text.trim()}\n${cut ? `\n${cut}\n` : ''}`)
        // The handoff is on disk: keep its path even if LATEST.md fails.
        written = `${dir}/${name}`
        await io.write(`${dir}/LATEST.md`, `${name}\n`)
      }
    } catch (err) {
      io.log(`compact-save: writing the handoff failed (${(err as Error)?.message ?? err})`)
    }
    return written
  }

  // The pause menu. Started detached, so the rollover (and `rolling`) ends as
  // before; an answer acts only on the pause it was asked for.
  const menu = async (io: RollIo, path: string, count: number, idle: boolean) => {
    if (!io.ask) {
      io.log(`compact-save: no pause menu (no ask binding), stays paused; handoff ${path}`)
      return
    }
    let answer: string
    try {
      answer = await io.ask(menuQuestion(count, path, idle), [FULL_HANDOVER, ...Object.keys(RUN_MORE)])
    } catch (err) {
      io.log(`compact-save: pause menu not answered (${(err as Error)?.message ?? err}), stays paused; handoff ${path}`)
      return
    }
    if (paused !== path || resuming === path) return
    const more = Object.hasOwn(RUN_MORE, answer) ? RUN_MORE[answer as keyof typeof RUN_MORE] : undefined
    if (answer !== FULL_HANDOVER && more === undefined) {
      io.log(`compact-save: pause menu answered "${answer}", not a menu option, stays paused; handoff ${path}`)
      return
    }
    // Cleared first: prompt.submit drops a non-user prompt while paused.
    const was = { handoffs, limit, idle: pausedIdle }
    paused = undefined
    pausedIdle = false
    if (more !== undefined) limit = handoffs + more
    else {
      handoffs = 0
      limit = MAX_HANDOFFS
    }
    let refused: string | undefined
    try {
      const r = await io.submit(more !== undefined ? rolloverPrompt(path) : handoverPrompt(path))
      const drop = typeof r === 'object' && r !== null ? (r as { drop?: unknown }).drop : undefined
      if (drop !== undefined) refused = String(drop)
    } catch (err) {
      refused = `${(err as Error)?.message ?? err}`
    }
    if (refused !== undefined) {
      // Not run: the pause stands as it was; Rico's next prompt resumes.
      paused = path
      pausedIdle = was.idle
      handoffs = was.handoffs
      limit = was.limit
      io.log(`compact-save: pause menu "${answer}", its prompt was refused (${refused}), stays paused; handoff ${path}`)
    }
  }

  // Rico, 2026-10-04: an auto compaction rolls over to a fresh session
  // instead, but only once the handoff is on disk and non-empty; without one
  // a rollover loses the session, so it compacts as before. /clear runs only
  // from a later event, so it is scheduled; $.prompt.submit in the same
  // callback lands as the fresh session's first prompt.
  // A fresh session that hits the threshold again within ROLLOVER_GAP_MS
  // (its own start already too big) compacts instead of looping.
  // Throws when it will not roll over.
  // `idle`: the idle rollover (IDLE_REASON). No turn to end, no count, and it
  // always pauses.
  const rollOverTo = async (io: RollIo, path: string, idle = false) => {
    const back = await io.read(path)
    if (typeof back !== 'string' || !back.trim()) throw new Error('the handoff reads back empty')
    const now = await io.now()
    if (lastRollover !== undefined && now - lastRollover < ROLLOVER_GAP_MS) throw new Error('the last rollover was under 5 minutes ago')
    const prevRollover = lastRollover
    lastRollover = now
    carry = true
    generation++
    const gen = generation
    const oldId = await io.id()
    const afterRoll = async () => {
      const turnId = lastTurn
      if (turnId && !idle) {
        try {
          await io.abort(turnId)
        } catch (err) {
          io.log(`compact-save: turn ${turnId} not ended, /clear waits for idle (${(err as Error)?.message ?? err})`)
        }
      }
      // Finished worktrees go before the session does (Rico, 2026-10-04):
      // the fresh session may leave no handover to clean up at. The reaper
      // never throws.
      await reapWorktrees(io)
      // A prompt or turn since the idle rollover began wins: no /clear, the
      // handoff stays on disk, the session stays as it is.
      if (idle && (gen !== generation || running || paused !== undefined)) {
        carry = false
        lastRollover = prevRollover
        io.log(`${IDLE_CANCELLED} (handoff kept at ${path})`)
        return
      }
      try {
        await io.clear()
      } catch (err) {
        carry = false
        io.log(`compact-save: /clear failed, no fresh session (${(err as Error)?.message ?? err}); handoff at ${path}`)
        return
      }
      // Only a rollover whose /clear went through counts toward the pause;
      // the idle one never does.
      if (!idle) handoffs++
      if (idle || handoffs >= limit) {
        paused = path
        pausedIdle = idle
        const text = idle ? idlePausedText(path) : pausedText(path, handoffs)
        try { await io.toast(text, { timeoutMs: 30_000 }) } catch {}
        io.log(text)
        // The reason and the path stay on screen in the fresh session.
        try {
          await io.append?.(text)
        } catch (err) {
          io.log(`compact-save: pause note not appended (${(err as Error)?.message ?? err})`)
        }
        // Not awaited: the menu must not hold the rollover open.
        menu(io, path, handoffs, idle).catch(() => {})
        return
      }
      try {
        await io.submit(rolloverPrompt(path))
      } catch (err) {
        io.log(`compact-save: fresh session started, its first prompt was refused (${(err as Error)?.message ?? err}); read ${path}`)
      }
    }
    io.after(300, async () => {
      try { await afterRoll() } finally { rolling = false }
    })
    io.log(`compact-save: rollover from session ${oldId}, handoff ${path}`)
  }

  // The same sequence for another rule (lsp-handover): no compaction to veto
  // or fall back to, and the turn already ended, so no cut-turn record.
  shared = async (io, { reason, why }) => {
    const cwd = (await io.cwd()).replace(/\/+$/, '') || '/'
    if (!inScope(cwd)) throw new Error(`${cwd} is out of scope`)
    if (lastRollover !== undefined && (await io.now()) - lastRollover < ROLLOVER_GAP_MS) throw new Error('the last rollover was under 5 minutes ago')
    if (rolling) throw new Error('a rollover is in flight')
    rolling = true
    let handed = false
    try {
      const path = await writeHandoff(io, cwd, `${HANDOFF_PROMPT}\n\nThis session is being handed over because ${why}.`, [], false)
      if (!path) throw new Error('no handoff written')
      await rollOverTo(io, path)
      handed = true
      io.log(`compact-save: rollover reason ${reason}`)
      return path
    } finally {
      if (!handed) rolling = false
    }
  }

  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute' || e.agentId) return next(e)
    generation++
    const cwd = (await $.session.cwd()).replace(/\/+$/, '') || '/'
    if (!inScope(cwd)) return next(e)
    if (rolling) {
      $.ui.log('compact-save: a rollover is in flight, compacting without a handoff')
      return next(e)
    }
    const io = rollIo($)
    rolling = true
    let handed = false
    let written: string | undefined
    try {
      written = await writeHandoff(io, cwd, HANDOFF_PROMPT, e.messages, e.trigger === 'auto')
      if (e.trigger === 'auto' && written) {
        try {
          await rollOverTo(io, written)
          handed = true
          return { skip: rolloverSkip(written) }
        } catch (err) {
          $.ui.log(`compact-save: no rollover, compacting instead (${(err as Error)?.message ?? err})`)
        }
      }
    } finally {
      if (!handed) rolling = false
    }

    // Tell the summarizer what must survive (d.ts session.compact `instructions`).
    const keep =
      'Keep exact: open PRs and branches with links, in-flight lanes, what is verified versus written, and every action still waiting on Rico.' +
      (written ? ` The full pre-compaction handoff is at ${written}; name that path in the summary.` : '')
    const result = await next({ ...e, instructions: e.instructions ? `${e.instructions}\n${keep}` : keep })
    if (!result?.skip && written) {
      // The compaction already stands; a refused note is logged, never thrown.
      try {
        await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: noteText(written) }] } })
      } catch (err) {
        $.ui.log(`compact-save: note for ${written} not appended (${(err as Error)?.message ?? err})`)
      }
    }
    return result
  })

  // The idle rollover (IDLE_REASON). Matched by a RegExp on every reason: the
  // plugin's one unmatched turn.complete is the worktree reaper's.
  on('turn.complete', { reason: /^(answer|aborted|refusal|error)$/ }, async ($, e, next) => {
    // In a finally: a throwing hook below cannot leave `running` stuck, and
    // the timer is armed all the same.
    try {
      return await next(e)
    } finally {
      if (!e.agentId) {
        running = false
        try {
          if (!idleCfg) {
            const log = (text: string) => $.ui.log(text)
            idleCfg = idleConfig({
              ttl: await $.env.get('DEVRULES_CACHE_TTL_S'),
              margin: await $.env.get('DEVRULES_CACHE_MARGIN_S'),
              minTokens: await $.env.get('DEVRULES_CACHE_ROLL_MIN_TOKENS'),
            }, log)
          }
          const { waitMs, minTokens } = idleCfg
          const armed = generation
          const moved = () => armed !== generation || running || paused !== undefined
          $.clock.after(waitMs, async () => {
            if (moved() || rolling) return
            try {
              const cwd = (await $.session.cwd()).replace(/\/+$/, '') || '/'
              if (!inScope(cwd)) return
              const tokens = (await $.session.usage()).context?.tokens
              if (typeof tokens !== 'number' || !Number.isFinite(tokens)) {
                if (!sizeUnreadLogged) $.ui.log('compact-save: no idle rollover, the context size is not readable')
                sizeUnreadLogged = true
                return
              }
              if (tokens < minTokens) return
              // A handoff without Rico's ask loses his request.
              if (!asks.length) {
                if (!noAskLogged) $.ui.log('compact-save: no idle rollover, no ask from Rico is recorded')
                noAskLogged = true
                return
              }
              // A subagent still working: not idle. Background shells and monitors
              // are not visible to a plugin.
              const agents = await $.agent.list()
              if (agents.some(a => a.status === 'pending' || a.status === 'running' || a.status === 'waiting')) return
              if (moved() || rolling) return
              rolling = true
              let handed = false
              try {
                const io = rollIo($)
                const path = await writeHandoff(io, cwd, `${HANDOFF_PROMPT}\n\n${idleWhy(Math.round(waitMs / 60000))}`, [], false)
                if (!path) return
                // A turn or prompt that came while the handoff was written wins.
                if (moved()) {
                  $.ui.log(`${IDLE_CANCELLED} (handoff kept at ${path})`)
                  return
                }
                await rollOverTo(io, path, true)
                handed = true
                $.ui.log(`compact-save: rollover reason ${IDLE_REASON} (${tokens} tokens)`)
              } finally {
                if (!handed) rolling = false
              }
            } catch (err) {
              $.ui.log(`compact-save: no idle rollover (${(err as Error)?.message ?? err})`)
            }
          })
        } catch (err) {
          $.ui.log(`compact-save: idle timer not armed (${(err as Error)?.message ?? err})`)
        }
      }
    }
  })
}
