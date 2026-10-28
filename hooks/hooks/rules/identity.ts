import type { On } from 'claude-code'
import { commands, gitSubcommand } from '../lib/shell.ts'

// Operator ruling on: every agent commit says which
// harness, model and agent made it, and carries no session link. The engine's
// commit trailer is replaced with the Agent line, the PR footer is emptied
// (PR bodies already open with the `**agent:**` line), and a `git commit`
// whose message lacks the line, or still carries a Claude-Session link, is
// refused before the gates see it.

import { SCOPE_ROOTS as ROOTS } from '../config.ts'

export function inScope(cwd: string): boolean {
  return ROOTS.some(r => cwd === r || cwd.startsWith(r + '/'))
}

/** `Agent: claude-code · <model> · <cwd basename> head`. */
export function agentLine(model: string, cwd: string): string {
  const base = cwd.replace(/\/+$/, '').split('/').pop() || cwd
  return `Agent: claude-code · ${model} · ${base} head`
}

type Msg =
  | { kind: 'none' } // no message flag, or a reuse flag: git writes it, not us
  | { kind: 'unreadable' }
  | { kind: 'text'; parts: string[]; trailers: string[] }
  | { kind: 'file'; path: string; trailers: string[] }
  // `-m "$(cat <<'EOF' ...)"` whose body the tokenizer split (a quote inside
  // it): read the body from the line's one heredoc instead.
  | { kind: 'heredoc'; trailers: string[] }

/** `--trailer Key: x` / `Key=x` as the line git writes; a value that is not `Key[:=]x` is kept as-is. */
function trailer(value: string): string {
  const m = /^([A-Za-z0-9-]+)\s*[:=]\s*(.*)$/s.exec(value)
  return m ? `${m[1]}: ${m[2]}` : value
}

// commit's short options that take a value, attached (`-mx`) or next token.
const SHORT_VALUE = new Set(['m', 'F', 'C', 'c', 't'])
// optional attached value only (`-S<key>`, `-u<mode>`): the rest of the cluster.
const SHORT_OPTIONAL = new Set(['S', 'u'])
const LONG_VALUE = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date', '--cleanup', '--fixup', '--squash', '--trailer', '--pathspec-from-file'])

/** The message flags of one `git ... commit ...` argv. */
export function commitMessage(argv: string[]): Msg {
  let i = argv.indexOf('commit', 1)
  const parts: string[] = []
  const trailers: string[] = []
  let file: string | undefined
  let reuse = false
  const take = (flag: string, value: string | undefined) => {
    if (value === undefined) return
    if (flag === 'm') parts.push(value)
    else if (flag === 'F') file = value
    else if (flag === 'C' || flag === 'c') reuse = true
  }
  for (i++; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') break
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const name = eq < 0 ? a : a.slice(0, eq)
      if (!LONG_VALUE.has(name)) continue
      const value = eq < 0 ? argv[++i] : a.slice(eq + 1)
      if (name === '--message') take('m', value)
      else if (name === '--file') take('F', value)
      else if (name === '--reuse-message' || name === '--reedit-message') reuse = true
      // git appends every --trailer, so verdict must see every one (PR 911 review P1).
      else if (name === '--trailer' && value !== undefined) trailers.push(trailer(value))
      continue
    }
    if (!a.startsWith('-') || a === '-') continue
    for (let j = 1; j < a.length; j++) {
      const f = a[j]
      if (SHORT_OPTIONAL.has(f)) break
      if (SHORT_VALUE.has(f)) {
        take(f, j + 1 < a.length ? a.slice(j + 1) : argv[++i])
        break
      }
    }
  }
  if (reuse || (!parts.length && file === undefined)) return { kind: 'none' }
  if (file !== undefined) {
    if (parts.length) return { kind: 'unreadable' } // git refuses -m with -F
    return { kind: 'file', path: file, trailers }
  }
  const read: string[] = []
  for (const p of parts) {
    // `-m "$(cat <<'EOF' ... EOF)"`, the usual agent spelling: the body is literal.
    const doc = /^\$\(cat <<-?\s*(['"]?)(\w+)\1[ \t]*\n([\s\S]*?)\n[ \t]*\2[ \t]*\n?\s*\)$/.exec(p)
    if (doc) read.push(doc[3])
    else if (/^\$\(cat <<-?\s*['"]?\w+['"]?[ \t]*\n/.test(p)) return { kind: 'heredoc', trailers }
    else if (/[$`]/.test(p)) return { kind: 'unreadable' }
    else read.push(p)
  }
  return { kind: 'text', parts: read, trailers }
}

/** The body of the line's one heredoc, for `-F -`; undefined when not exactly one. */
function heredoc(line: string): string | undefined {
  const all = [...line.matchAll(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g)]
  return all.length === 1 ? all[0][3] : undefined
}

/** The `-C <dir>` git was given before the subcommand, for a relative `-F`. */
function gitDir(argv: string[]): string | undefined {
  let dir: string | undefined
  for (let i = 1; i < argv.length && argv[i] !== 'commit'; i++) {
    if (argv[i] !== '-C' || i + 1 >= argv.length) continue
    const v = argv[++i]
    // repeated -C options stack, as git applies them
    dir = !dir || v.startsWith('/') ? v : `${dir}/${v}`
  }
  return dir
}

/** `Agent: <harness> · <model> · <seat>`, the shape of agentLine, every field non-empty. */
export function isAgentLine(l: string): boolean {
  if (!l.startsWith('Agent: ')) return false
  const fields = l.slice('Agent: '.length).split(' · ')
  return fields.length === 3 && fields.every(f => f.trim() !== '')
}

export function verdict(text: string, line: string): string | undefined {
  const lines = text.split(/\r?\n/)
  const hasAgent = lines.some(isAgentLine)
  const hasSession = lines.some(l => l.trimStart().startsWith('Claude-Session:'))
  const why: string[] = []
  if (!hasAgent) why.push(`add this line to the commit message: \`${line}\``)
  if (hasSession) why.push('remove the `Claude-Session:` line (no session links)')
  if (!why.length) return undefined
  return `Commit refused (operator ruling, every agent commit names its harness, model and agent): ${why.join('; ')}.`
}

export function identity(on: On) {
  on('attribution.text', { kind: 'commit' }, async ($, e, next) => {
    const cwd = await $.session.cwd()
    if (!inScope(cwd)) return next(e)
    return { text: agentLine(await $.session.model(), cwd) }
  })
  on('attribution.text', { kind: 'pr' }, async ($, e, next) =>
    inScope(await $.session.cwd()) ? { text: '' } : next(e),
  )

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const commits = commands(e.command).filter(c => c.head === 'git' && gitSubcommand(c.argv) === 'commit')
    if (!commits.length) return next(e)
    const cwd = await $.session.cwd()
    if (!inScope(cwd)) return next(e)
    const line = agentLine(await $.session.model(), cwd)
    for (const c of commits) {
      const msg = commitMessage(c.argv)
      let text: string | undefined
      if (msg.kind === 'text') text = msg.parts.join('\n\n')
      else if (msg.kind === 'heredoc') text = heredoc(e.command)
      else if (msg.kind === 'file') {
        if (msg.path === '-' || msg.path === '/dev/stdin') text = heredoc(e.command)
        else {
          const dir = gitDir(c.argv)
          const path = dir && !msg.path.startsWith('/') ? `${dir}/${msg.path}` : msg.path
          text = await $.fs.read(path).then(t => t as string, () => undefined)
        }
      }
      // Cannot read it (dynamic, stdin, missing file): the gates decide.
      if (text === undefined) continue
      // git appends each --trailer to the message it writes.
      if (msg.kind !== 'none' && msg.kind !== 'unreadable' && msg.trailers.length) text = [text, ...msg.trailers].join('\n')
      const deny = verdict(text, line)
      if (deny) return { deny }
    }
    return next(e)
  })
}
