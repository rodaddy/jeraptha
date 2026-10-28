// Threat model: this rule guards against an agent changing the cluster by
// mistake from the wrong seat. It reads shell text, so it cannot be complete
// against deliberate evasion (a name built by concatenation or escapes,
// positional or special parameters, eval); those shapes are out of scope and
// graded P2. Reads must stay open: a false deny on an ordinary read is a defect.
import type { On } from 'claude-code'
import { commands } from '../lib/shell.ts'

// Operator ruling 2026-10-03: cluster changes live in one seat. Reads
// stay open everywhere; kubectl/helm changes only from the infra sessions.
import { CLUSTER_DENY, INFRA_SEAT, PORT_FORWARD_NAMESPACES, SCOPE_ROOTS as SCOPE, TMP_ROOT } from '../config.ts'
export { CLUSTER_DENY }

const KUBECTL_READ = new Set(['get', 'describe', 'logs', 'top', 'explain', 'api-resources', 'api-versions', 'version', 'cluster-info', 'events', 'diff'])
const KUBECTL_READ_SUB: Record<string, Set<string>> = {
  config: new Set(['view', 'get-contexts', 'current-context', 'get-clusters', 'get-users']),
  auth: new Set(['can-i', 'whoami']),
}
const HELM_READ = new Set(['list', 'ls', 'status', 'get', 'history', 'show', 'template', 'search', 'version', 'env', 'lint'])
const HELM_READ_SUB: Record<string, Set<string>> = {
  repo: new Set(['list']),
  dependency: new Set(['list']),
}

// Global options, from `kubectl options` and `helm --help` (2026-10-04).
// WITH_VALUE takes the next word as its value, so that word is not read as the
// verb; a short one may also carry its value attached (`-nweb`, `-v6`). FLAG
// takes none. Any other option before the verb (or before the
// subverb of a verb that has one) fails closed: it reads as a change, because
// we cannot tell whether it swallows the next word (PR 911 review).
const KUBECTL = {
  withValue: new Set([
    '-n', '--namespace', '--context', '--kubeconfig', '--kuberc', '--cluster', '--user', '-s', '--server',
    '--token', '--as', '--as-group', '--as-uid', '--cache-dir', '--certificate-authority',
    '--client-certificate', '--client-key', '--request-timeout', '-v', '--v', '--vmodule', '--tls-server-name',
    '--username', '--password', '--profile', '--profile-output', '--chunk-size', '--log-file',
    '--log-file-max-size', '--log-flush-frequency', '--log-dir', '--log-backtrace-at', '--stderrthreshold',
  ]),
  flag: new Set([
    '-h', '--help', '--insecure-skip-tls-verify', '--match-server-version', '--warnings-as-errors',
    '--disable-compression', '--add-dir-header', '--alsologtostderr', '--logtostderr', '--one-output',
    '--skip-headers', '--skip-log-headers',
  ]),
  reads: KUBECTL_READ,
  subs: KUBECTL_READ_SUB,
}
const HELM = {
  withValue: new Set([
    '-n', '--namespace', '--kube-context', '--kubeconfig', '--registry-config', '--repository-config',
    '--repository-cache', '--content-cache', '--kube-apiserver', '--kube-as-user', '--kube-as-group',
    '--kube-token', '--kube-ca-file', '--kube-tls-server-name', '--burst-limit', '--qps', '--color', '--colour',
  ]),
  flag: new Set(['-h', '--help', '--debug', '--kube-insecure-skip-tls-verify']),
  reads: HELM_READ,
  subs: HELM_READ_SUB,
}
type Tool = typeof KUBECTL

/** The verb and subverb past the tool's own options; null when an unknown
 *  option stands where it could hide them. */
function words(argv: string[], t: Tool): string[] | null {
  const out: string[] = []
  for (let i = 1; i < argv.length && out.length < 2; i++) {
    const a = argv[i]
    const guarded = out.length === 0 || t.subs[out[0]] !== undefined
    if (t.withValue.has(a)) i++
    else if (!a.startsWith('-')) out.push(a)
    else if (!a.startsWith('--') && a.length > 2 && t.withValue.has(a.slice(0, 2))) continue // -nweb, -v6: value attached (PR 926 review)
    else if (guarded && a !== '-' && !a.includes('=') && !t.flag.has(a)) return null
  }
  return out
}

// Operator ruling 2026-10-06: a port-forward into the browser
// pool is a read. Exactly one namespace, browser-pool, and any --address on
// loopback; every other port-forward stays a change.
const LOOPBACK = new Set(['localhost', '127.0.0.1'])
const unquote = (s: string) => s.replace(/^(['"])(.*)\1$/s, '$2')
function browserPoolForward(argv: string[]): boolean {
  const ns: string[] = []
  const addr: string[] = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-n' || a === '--namespace') ns.push(argv[++i] ?? '')
    else if (a.startsWith('--namespace=')) ns.push(a.slice(12))
    else if (a.startsWith('-n') && !a.startsWith('--') && a.length > 2) ns.push(a.slice(2))
    else if (a === '--address') addr.push(argv[++i] ?? '')
    else if (a.startsWith('--address=')) addr.push(a.slice(10))
  }
  return ns.length === 1 && PORT_FORWARD_NAMESPACES.includes(unquote(ns[0])) && addr.every(v => unquote(v).split(',').every(h => LOOPBACK.has(h)))
}

function isRead(t: Tool, argv: string[]): boolean {
  const w = words(argv, t)
  if (w === null) return false // unknown option: fail closed
  const [verb, sub] = w
  if (verb === undefined) return true // bare `kubectl`/`helm` prints help
  if (t === KUBECTL && verb === 'port-forward') return browserPoolForward(argv)
  if (t.reads.has(verb)) return true
  return sub !== undefined && (t.subs[verb]?.has(sub) ?? false)
}

// Wrappers that run the command after them, and their options that take the
// next word as a value (an attached `--user=x` does not). Any other option is
// read as a flag, so the next word is read as the tool: the safe direction.
// `@sudo`, `@env` and `@xargs` are a raw `sudo`, `env` and `xargs` (see RAW_WORD).
const SUDO_VALUE = new Set([
  '-u', '--user', '-g', '--group', '-C', '--close-from', '-h', '--host', '-p', '--prompt',
  '-D', '--chdir', '-r', '--role', '-t', '--type', '-T', '--command-timeout', '-U', '--other-user',
])
const ENV_VALUE = new Set(['-u', '--unset', '-C', '--chdir'])
const XARGS_VALUE = new Set([
  '-n', '-I', '-P', '-L', '-d', '-E', '-s', '-a', '--max-args', '--max-lines', '--max-procs', '--replace',
  '--delimiter', '--eof', '--max-chars', '--arg-file',
])
const WRAPPERS: Record<string, Set<string>> = {
  time: new Set(),
  sudo: SUDO_VALUE,
  '@sudo': SUDO_VALUE,
  doas: new Set(['-u', '-C']),
  env: ENV_VALUE,
  '@env': ENV_VALUE,
  nohup: new Set(),
  nice: new Set(['-n', '--adjustment']),
  ionice: new Set(['-c', '-n', '-p']),
  timeout: new Set(['-s', '--signal', '-k', '--kill-after']),
  stdbuf: new Set(['-i', '-o', '-e']),
  xargs: XARGS_VALUE,
  '@xargs': XARGS_VALUE,
  command: new Set(),
  exec: new Set(['-a']),
}
// `env -S '<line>'`: the value is split into the command line it runs. The
// `S` may close a short-option cluster (`-iS`, 0719435 review).
const ENV_SPLIT = /^(?:-[a-zA-Z]*S|--split-string(?:=|$))/
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const TOOL_WORD = /\b(?:kubectl|helm)\b/
// shell.ts strips `sudo` but knows only its short value options, so
// `sudo --user rico kubectl` leaves `rico` as the command word, and it drops
// `env -S` with its value; it knows only short xargs value options, so
// `xargs --max-args 1 kubectl` leaves `1`. Renaming the word to
// `@sudo`/`@env`/`@xargs` keeps it, and its options, in argv for strip() and
// changes() below.
const RAW_WORD = /(^|[\s;&|(`])((?:[^\s;&|(`]*\/)?)(sudo|env|xargs)(?=[ \t])/g

const base = (w: string) => w.split('/').pop() ?? w

/** argv past leading wrappers and the options shell.ts left behind (`time -p`).
 *  An `env -S` stays in argv, from the `env`, for changes() to split. */
function strip(argv: string[]): string[] {
  let i = 0
  while (i < argv.length) {
    if (argv[i].startsWith('-') || ASSIGN.test(argv[i])) {
      i++
      continue
    }
    const w = base(argv[i])
    const value = WRAPPERS[w]
    if (!value) break
    const start = i++
    while (i < argv.length && (argv[i].startsWith('-') || ASSIGN.test(argv[i]))) {
      if (argv[i] === '--') {
        i++
        break
      }
      if (value === ENV_VALUE && ENV_SPLIT.test(argv[i])) return argv.slice(start)
      i += value.has(argv[i]) ? 2 : 1
    }
    if (w === 'timeout') i++ // its duration
  }
  return argv.slice(i)
}

/** The line an `env -S <value> args...` runs: the value, split, then the args. */
function envSplit(argv: string[]): string | null {
  const k = argv.findIndex(a => ENV_SPLIT.test(a))
  if (k < 0) return null
  const a = argv[k]
  const at = a.startsWith('--') ? a.indexOf('=') + 1 : a.indexOf('S') + 1
  const attached = at > 0 && at < a.length
  const value = attached ? a.slice(at) : (argv[k + 1] ?? '')
  return [value, ...argv.slice(k + (attached ? 1 : 2))].join(' ')
}

/** Index of the `)` closing the `(` at `open`, or the line's end. */
function close(s: string, open: number): number {
  let depth = 0
  for (let j = open; j < s.length; j++) {
    if (s[j] === '(') depth++
    else if (s[j] === ')' && --depth === 0) return j
  }
  return s.length
}

/** End of the shell word starting at `i`: quotes, `$(...)` and backticks kept whole. */
function wordEnd(s: string, i: number): number {
  while (i < s.length && !/[\s;&|<>()]/.test(s[i])) {
    const c = s[i]
    if (c === "'" || c === '`') {
      const e = s.indexOf(c, i + 1)
      i = e < 0 ? s.length : e + 1
    } else if (c === '"') {
      i++
      while (i < s.length && s[i] !== '"') i += s[i] === '\\' ? 2 : 1
      i++
    } else if (c === '\\') i += 2
    else if (c === '$' && s[i + 1] === '(') i = close(s, i + 1) + 1
    else i++
  }
  return Math.min(i, s.length)
}

type Assign = { name: string; at: number; end: number; value: string; append: boolean }
/** Every `NAME=value` / `NAME+=value` in the line, quoted text included (loose). */
function assigns(line: string): Assign[] {
  return [...line.matchAll(/(?<=^|[\s;&|(`'"])([A-Za-z_][A-Za-z0-9_]*)(\+?)=/g)].map(m => {
    const end = wordEnd(line, m.index + m[0].length)
    return { name: m[1], at: m.index, end, value: line.slice(m.index + m[0].length, end), append: m[2] === '+' }
  })
}

/** True when `at` starts a top-level statement: nothing but blanks since the
 *  line start or a `;`/newline outside quotes, parens, braces and comments. */
function statementStart(line: string, at: number): boolean {
  let clean = true
  let depth = 0
  for (let i = 0; i < at; i++) {
    const c = line[i]
    if (c === ' ' || c === '\t') continue
    if (depth === 0 && (c === ';' || c === '\n')) {
      clean = true
      continue
    }
    clean = false
    if (c === "'" || c === '"' || c === '`') {
      i = wordEnd(line, i) - 1
      if (i >= at) return false
    } else if (c === '\\') i++
    else if (c === '(' || c === '{') depth++
    else if (c === ')' || c === '}') depth--
    else if (c === '#' && (i === 0 || /[\s;&|()]/.test(line[i - 1]))) {
      const e = line.indexOf('\n', i)
      if (e < 0 || e >= at) return false
      i = e - 1
    }
  }
  return clean && depth === 0
}

const VAR_WORD = /^\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})$/
// A value the shell takes literally: one quoted string or one plain word. Any
// expansion, escape, partial quoting (`kub"ectl"`) or glob is not resolved.
const STATIC = /^(?:'[^']*'|"[^"$`\\]*"|[^\s;&|()<>'"$`\\]*)$/
const GLOB = /[*?[]/

/**
 * The value `$NAME`/`${NAME}` holds where the line uses it (PR 929 review),
 * or null: fail closed. It resolves only when NAME has exactly one plain
 * assignment, standing alone as a top-level statement before every use, and
 * no other mention (`read K`, `K+=x`, a prefix `K=v cmd`) can change it.
 */
function resolve(word: string, line: string): string | null {
  const m = VAR_WORD.exec(word)
  if (!m) return null
  const name = m[1] ?? m[2]
  const sets = assigns(line).filter(a => a.name === name)
  if (sets.length !== 1) return null
  const [set] = sets
  const uses = [...line.matchAll(new RegExp(String.raw`\$(?:${name}(?![A-Za-z0-9_])|\{${name}\})`, 'g'))]
  const mentions = [...line.matchAll(new RegExp(String.raw`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'g'))]
  if (mentions.length !== uses.length + 1 || uses.some(u => u.index < set.end)) return null
  if (set.append || !STATIC.test(set.value) || GLOB.test(set.value)) return null
  if (!statementStart(line, set.at) || !/^[ \t]*(?:[;\n]|$)/.test(line.slice(set.end))) return null
  return set.value.replace(/^(['"])(.*)\1$/s, '$2')
}

/** True when a word in `text` can name kubectl or helm: by name, or as a glob
 *  that matches either (`/x/kube*`). */
function names(text: string): boolean {
  if (TOOL_WORD.test(text)) return true
  return text.split(/\s+/).some(w => {
    const b = base(w.replace(/['"]/g, ''))
    if (!GLOB.test(b)) return false
    const re = b.replace(/\[!/g, '[^').replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
    try {
      return new RegExp(`^${re}$`).test('kubectl') || new RegExp(`^${re}$`).test('helm')
    } catch {
      return true
    }
  })
}

/** The line's statements: split at `;`, newline, `&&` and `||` outside quotes
 *  and substitutions; a pipeline stays whole. */
function statements(line: string): string[] {
  const out: string[] = []
  let start = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'" || c === '"' || c === '`' || (c === '$' && line[i + 1] === '(')) i = wordEnd(line, i) - 1
    else if (c === '\\') i++
    else if (c === ';' || c === '\n' || ((c === '&' || c === '|') && line[i + 1] === c)) {
      out.push(line.slice(start, i))
      start = i + (c === ';' || c === '\n' ? 1 : 2)
      i = start - 1
    }
  }
  return [...out, line.slice(start)]
}

const SETTER = /^(?:read|mapfile|readarray|declare|typeset|local|export|readonly|let|getopts)$/
const READER = /^(?:read|mapfile|readarray)$/
const NAMEREF = /^(?:declare|typeset|local)$/

/** The text of each command that sets NAME other than `NAME=value` (0719435
 *  and 362a5d3 reviews): `read` and kin, `printf -v`, a `for`/`select` header,
 *  `${NAME:=v}`, a `declare -n` nameref (as `$TARGET`). Only real commands count; a quoted `"read K"` does not. Its
 *  own argv is the evidence; a reader's input (a pipe, `<<<`, `< f`) may sit
 *  elsewhere in its statement, so a reader gives the whole statement. */
function setters(name: string, line: string): string[] {
  const out: string[] = []
  for (const stmt of statements(line)) {
    for (const { argv, head } of commands(stmt)) {
      const sets =
        (SETTER.test(head) && argv.slice(1).some(a => a === name || a.startsWith(`${name}=`) || a.startsWith(`${name}+=`))) ||
        (head === 'printf' && argv.some((a, i) => a === `-v${name}` || (a === '-v' && argv[i + 1] === name))) ||
        (head === 'select' && argv[1] === name) ||
        (argv[0] === name && (argv.length === 1 || argv[1] === 'in')) // `for NAME in ...`: shell.ts drops the `for`
      if (sets && NAMEREF.test(head) && argv.slice(1).some(a => /^-[a-zA-Z]*n/.test(a))) {
        // `declare -n R=K`: each value of R names the variable R reads, so its
        // evidence is `$K`; a value that is not a plain name fails closed to the line.
        for (const a of assigns(line).filter(a => a.name === name)) out.push(/^[A-Za-z_][A-Za-z0-9_]*$/.test(a.value) ? `$${a.value}` : line)
      } else if (sets) out.push(READER.test(head) ? stmt : argv.join(' '))
    }
  }
  for (const m of line.matchAll(new RegExp(String.raw`\$\{${name}:?=([^}]*)\}`, 'g'))) out.push(m[1])
  return out
}

/** The text that can say what the variables used in `text` hold: for each
 *  `$NAME`/`${NAME}` in it, the values of every `NAME=`/`NAME+=` on the line
 *  (an array whole, appends also joined in order) and the text of every other
 *  setter, followed recursively. A NAME the line never sets (`$EDITOR`) adds
 *  nothing. `${!NAME}` indirection fails closed to the whole line. */
function evidence(text: string, line: string, seen = new Set<string>()): string[] {
  if (text.includes('${!')) return [line]
  const out: string[] = []
  for (const m of text.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    const sets = assigns(line).filter(a => a.name === name)
    const values = sets.map(a => (line[a.end] === '(' ? line.slice(a.end, close(line, a.end) + 1) : a.value))
    if (sets.some(a => a.append)) values.push(values.join(''))
    for (const v of [...values, ...setters(name, line)]) out.push(v, ...evidence(v, line, seen))
  }
  return out
}

/** Every `$(...)` and backtick substitution in the line. */
function substitutions(line: string): string[] {
  const out = [...line.matchAll(/`[^`]*`/g)].map(m => m[0])
  for (let i = line.indexOf('$('); i >= 0; i = line.indexOf('$(', i + 1)) out.push(line.slice(i, close(line, i + 1) + 1))
  return out
}

/** True when this argv (wrappers stripped) runs a cluster-changing verb. */
function changes(argv: string[], line: string, depth: number): boolean {
  if (!argv.length || depth > 4) return false
  const head = base(argv[0])
  // `$K delete pod x`: a dynamic command word may expand to the tool. A plain
  // `K=kubectl` resolves it. Otherwise it fails closed when the word itself,
  // or what its variables can hold (evidence()), can name the tool; the rest
  // of the line (an unrelated `kubectl get`, a `helm/` path, `$PAGER`) does
  // not count (PR 929 reviews).
  if (/^[$`]/.test(argv[0])) {
    const value = resolve(argv[0], line)
    if (value !== null) return changes(strip([...value.split(/\s+/).filter(Boolean), ...argv.slice(1)]), line, depth + 1)
    // An unquoted `$(` ends the word at `$`: its text is a substitution.
    const word = argv[0].endsWith('$') ? [argv[0], ...substitutions(line)] : [argv[0]]
    return [...word, ...evidence(word.join(' '), line)].some(names)
  }
  if (head === 'kubectl') return !isRead(KUBECTL, argv)
  if (head === 'helm') return !isRead(HELM, argv)
  if (head === 'env' || head === '@env') {
    const nested = envSplit(argv)
    if (nested !== null) return isClusterChange(nested, depth + 1)
  }
  if (SHELLS.has(head)) {
    // `bash -c -- '<payload>'`: shell.ts reads the `--` as the payload.
    const i = argv.findIndex(a => /^-[a-z]*c[a-z]*$/.test(a))
    if (i > 0 && argv[i + 1] === '--' && i + 2 < argv.length) return isClusterChange(argv[i + 2], depth + 1)
  }
  return false
}

/** True when the line runs a kubectl or helm verb that changes the cluster. */
export function isClusterChange(line: string, depth = 0): boolean {
  if (depth > 4) return false
  const raw = line.replace(RAW_WORD, '$1$2@$3')
  const cmds = raw === line ? commands(line) : [...commands(line), ...commands(raw)]
  return cmds.some(c => changes(strip(c.argv), line, depth))
}

const under = (dir: string, roots: string[]) => roots.some(r => dir === r || dir.startsWith(r + '/'))
// A worktree of an infra repo is the infra seat too. Layout from
// the workspace layout: _worktrees/<harness>/<owner>/<repo>/<branch>.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const seatNames = INFRA_SEAT.map(p => esc(p.split('/').pop() ?? '')).join('|')
const INFRA_WORKTREE = new RegExp(`^${esc(TMP_ROOT)}/_worktrees/[^/]+/[^/]+/(?:${seatNames})/[^/]+(?:/|$)`)
const infraSeat = (dir: string) => under(dir, INFRA_SEAT) || INFRA_WORKTREE.test(dir)

export function cluster(on: On) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!isClusterChange(e.command)) return next(e)
    const cwd = await $.session.cwd()
    if (!under(cwd, SCOPE) || infraSeat(cwd)) return next(e)
    return { deny: CLUSTER_DENY }
  })
}
