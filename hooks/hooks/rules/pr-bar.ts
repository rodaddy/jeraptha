import type { On } from 'claude-code'
import { commands, type Cmd } from '../lib/shell.ts'

// Operator ruling 2026-10-05: sessions do not open poor PRs; a PR below the
// bar is rejected. The PR opener in config.ts applies the
// intake bar before a PR opens; this rule denies the other
// ways a session opens a Forge PR: `tea pr create`, a curl POST to
// /repos/<o>/<r>/pulls, and an AGit push (Forgejo opens a PR from `git push`
// to `refs/for/<base>`, or with a `-o title=`/`description=` push option).
// Merges, reviews and comments on a PR are untouched.
import { inScope, PR_OPENER } from '../config.ts'

export const PR_BAR_DENY =
  `open PRs through ${PR_OPENER}, which checks the bar (operator ruling 2026-10-05: sessions do not create poor PRs)`

/** The create-pulls endpoint itself, never /pulls/<n>/... */
const PULLS_URL = /\/repos\/[^/\s]+\/[^/\s]+\/pulls\/?(?:[?#].*)?$/
const TEA_PR = new Set(['pr', 'pull', 'pulls'])
const TEA_CREATE = new Set(['create', 'c'])
const DATA = /^(?:-d.*|--data(?:-[a-z]+)?(?:=.*)?|--json(?:=.*)?)$/

function teaCreatesPr(argv: string[]): boolean {
  const words = argv.slice(1).filter(a => !a.startsWith('-'))
  return TEA_PR.has(words[0] ?? '') && TEA_CREATE.has(words[1] ?? '')
}

/** The method curl sends: an explicit -X/--request wins, then -G, then data means POST. */
export function curlMethod(argv: string[]): string {
  let method = ''
  let data = false
  let get = false
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-X' || a === '--request') method = (argv[++i] ?? '').toUpperCase()
    else if (a.startsWith('--request=')) method = a.slice('--request='.length).toUpperCase()
    else if (/^-X./.test(a)) method = a.slice(2).toUpperCase()
    else if (a === '-G' || a === '--get') get = true
    else if (DATA.test(a)) data = true
  }
  if (method) return method
  if (get) return 'GET'
  return data ? 'POST' : 'GET'
}

function curlOpensPr(argv: string[]): boolean {
  return curlMethod(argv) === 'POST' && argv.slice(1).some(a => PULLS_URL.test(a.replace(/^--url=/, '')))
}

/** git's subcommand: the first word after its global options (`-C <dir>`, `-c <k=v>` take a value). */
function gitSub(argv: string[]): [string, string[]] {
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-C' || a === '-c' || a === '--git-dir' || a === '--work-tree' || a === '--namespace') i++
    else if (!a.startsWith('-')) return [a, argv.slice(i + 1)]
  }
  return ['', []]
}

const AGIT_OPTION = /^(?:title|description)=/
const REMOTE_PUSH = /^remote\..+\.push$/i
const PUSH_OPTION = /^push\.pushoption$/i

/** A config key and value that make a later push AGit: a remote push refspec to refs/for/, or a title/description push option. */
const agitConfig = (key: string, value: string) =>
  (REMOTE_PUSH.test(key) && value.includes('refs/for/')) || (PUSH_OPTION.test(key) && AGIT_OPTION.test(value))

/** The `-c k=v` / `-ck=v` pairs before git's subcommand. */
function gitConfigArgs(argv: string[]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    const kv = a === '-c' ? argv[++i] ?? '' : a.startsWith('-c') && a.length > 2 ? a.slice(2) : undefined
    if (kv !== undefined) {
      const eq = kv.indexOf('=')
      if (eq > 0) out.push([kv.slice(0, eq), kv.slice(eq + 1)])
    } else if (a === '-C' || a === '--git-dir' || a === '--work-tree' || a === '--namespace') i++
    else if (!a.startsWith('-')) break
  }
  return out
}

/** `git config ... <key> <value>` (any scope flags, --add, or the `set`/`add` subcommand) writing AGit config. */
function configWritesAgit(rest: string[]): boolean {
  const words = rest.filter(a => !a.startsWith('-'))
  return words.some((k, i) => words.slice(i + 1).some(v => agitConfig(k, v)))
}

/** An AGit push: a refspec to refs/for/, or a title/description push option, given on the line or by `-c`;
 * or a `git config` that persists either. Config already persisted is out of the hook's sight (server side). */
export function agitOpensPr(argv: string[]): boolean {
  const [sub, rest] = gitSub(argv)
  if (sub === 'config') return configWritesAgit(rest)
  if (sub !== 'push') return false
  if (gitConfigArgs(argv).some(([k, v]) => agitConfig(k, v))) return true
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (/(?:^\+?|:)refs\/for\//.test(a)) return true
    if ((a === '-o' || a === '--push-option') && AGIT_OPTION.test(rest[i + 1] ?? '')) return true
    if (/^(?:--push-option=|-o)/.test(a) && AGIT_OPTION.test(a.replace(/^(?:--push-option=|-o)/, ''))) return true
  }
  return false
}

const opensPr = (c: Cmd) => (c.head === 'tea' && teaCreatesPr(c.argv)) || (c.head === 'curl' && curlOpensPr(c.argv))
  || (c.head === 'git' && agitOpensPr(c.argv))

/** True when the line opens a Forge PR other than through forge-pr-open. */
export function isRawPrOpen(line: string): boolean {
  return commands(line).some(opensPr)
}

export function prBar(on: On) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!isRawPrOpen(e.command)) return next(e)
    if (!inScope(await $.session.cwd())) return next(e)
    return { deny: PR_BAR_DENY }
  })
}
