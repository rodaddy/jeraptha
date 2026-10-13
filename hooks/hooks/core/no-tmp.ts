import { assignments, commands, stripHeredocs } from '../lib/shell.ts'
import { SCOPE_ROOTS, TMP_ROOT } from '../config.ts'

// The no-tmp decision, harness-free (shared core).
// Standing rule: never /tmp. It is sandbox-local, invisible to runners and to
// Rico, and agents reach for it by reflex in one-line redirects. Writes into
// it are refused; reads stay open. Callers: the Claude mod adapter
// (rules/no-tmp.ts) and bin/rule-check.ts for Codex and Pi. No `claude-code`
// import and no engine `$` here: everything the rule needs comes in the input.

export const TMP_HELP =
  '/tmp is denied (standing rule): it is sandbox-local and invisible to runners and the operator. ' +
  'Write scratch under ' + TMP_ROOT + '/<project>/<repo>/ instead.'

export type NoTmpInput = {
  /** Normalised by the caller: `bash`, `write`, `edit`, `notebook`. Anything else is allowed. */
  tool: string
  /** The Bash line, for `bash`. */
  command?: string
  /** The target file, for `write`, `edit`, `notebook`. */
  path?: string
  /** The session's working directory; the rule applies only under SCOPES. */
  cwd: string
  /** The session's own TMPDIR; defaults to where macOS points it. */
  tmpdir?: string
  /** The session's HOME, for a target spelled with a leading `~`. */
  home?: string
  /**
   * Where an absolute path really lands; throws (or returns empty) when it does
   * not exist, and returns null when it exists but leads nowhere (a dangling
   * link), which denies: the write would land wherever the link points.
   */
  realpath?: (p: string) => string | null
}

const ROOTS = ['/tmp', '/private/tmp', '/private/var/folders']
const SCOPES = SCOPE_ROOTS
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const FILE_TOOLS = new Set(['write', 'edit', 'notebook'])

const isUnder = (p: string, roots: readonly string[]) =>
  roots.some(r => p === r || p.startsWith(r + '/'))

/** Folds `.`, `..` and repeated slashes of an absolute path, by spelling only. */
function normalize(abs: string): string {
  const out: string[] = []
  for (const part of abs.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

/** The path itself, then each parent up to (not including) `/`: the order `placed` asks realpath. */
function prefixes(abs: string): string[] {
  const out: string[] = []
  let dir = abs
  while (dir !== '/') {
    out.push(dir)
    const cut = dir.lastIndexOf('/')
    dir = cut <= 0 ? '/' : dir.slice(0, cut)
  }
  return out
}

/**
 * Where a path lands, following links: the file, else its nearest existing
 * folder plus the rest. null when a link on the way leads nowhere.
 */
function placed(abs: string, realpath: (p: string) => string | null): string | null | undefined {
  for (const dir of prefixes(abs)) {
    let real: string | null | undefined
    try {
      real = realpath(dir)
    } catch {
      real = undefined
    }
    if (real === null) return null
    if (real) return normalize(real + abs.slice(dir.length))
  }
  return undefined
}

/** Index of the `)` closing the `(` at `open`, quote-aware; the end of text when unclosed. */
function closeParen(text: string, open: number): number {
  let depth = 0
  for (let j = open; j < text.length; j++) {
    const c = text[j]
    if (c === '\\') j++
    else if (c === "'" || c === '"') {
      j++
      while (j < text.length && text[j] !== c) j += c === '"' && text[j] === '\\' ? 2 : 1
    } else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return j
  }
  return text.length
}

/** Index of the backtick closing the one at `open`; the end of text when unclosed. */
function closeTick(text: string, open: number): number {
  let j = open + 1
  while (j < text.length && text[j] !== '`') j += text[j] === '\\' ? 2 : 1
  return j
}

/**
 * Output redirect targets (`>`, `>>`, `>|`, `&>`, `N>`) of one line, read
 * quote-aware so a quoted `">"` is not one. `>&N` duplicates a descriptor and
 * `>(` is a process substitution: neither names a file. The body of every
 * `$(...)` and backtick, quoted or not, is read as its own line (it runs), and
 * its quotes stay inside it, its heredoc bodies are data; `$((...))` is arithmetic, where `>` compares.
 */
function redirectTargets(line: string, out: string[] = [], depth = 0): string[] {
  if (depth > 8) return out
  let dq = false
  const stop = /[\s;|&()<>]/
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '\\') i++
    else if (c === '"') dq = !dq
    else if (c === "'" && !dq) {
      const end = line.indexOf("'", i + 1)
      i = end < 0 ? line.length : end
    } else if (c === '$' && line[i + 1] === '(' && line[i + 2] === '(') i = closeParen(line, i + 1)
    else if (c === '$' && line[i + 1] === '(') {
      // Its heredoc bodies go first: they are data and may hold a lone quote or paren.
      const rest = stripHeredocs(line.slice(i + 2))
      const end = closeParen('(' + rest, 0) - 1
      redirectTargets(rest.slice(0, end), out, depth + 1)
      line = rest.slice(end + 1)
      i = -1
    } else if (c === '`') {
      const end = closeTick(line, i)
      redirectTargets(stripHeredocs(line.slice(i + 1, end)), out, depth + 1)
      i = end
    } else if (dq) continue
    else if (c === '>') {
      let j = i + 1
      if (line[j] === '>' || line[j] === '|') j++
      if (line[j] === '(') continue
      if (line[j] === '&') {
        j++
        if (/[0-9-]/.test(line[j] ?? '')) {
          i = j
          continue
        }
      }
      while (line[j] === ' ' || line[j] === '\t') j++
      const start = j
      let word = ''
      let q = ''
      for (; j < line.length; j++) {
        const d = line[j]
        if (q) {
          if (d === q) q = ''
          else word += d
        } else if (d === "'" || d === '"') q = d
        else if (stop.test(d)) break
        else word += d
      }
      if (word) out.push(word)
      // Read the target again as shell text: a substitution in it still runs.
      i = start - 1
    }
  }
  return out
}

/** The argv without its redirects: a `<in`, `<<<word`, `2>err` token, or a bare operator and its word. */
function withoutRedirects(argv: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? ''
    const m = /^[0-9]*(?:&>>?|<<<|<<-?|<>|<&?|>>|>\||>&?)(.*)$/s.exec(a)
    if (!m) out.push(a)
    else if (m[1] === '') i++
  }
  return out
}

/** The line a `bash -c`, `bash -c -- '...'` or `watch ...` command runs, if any. */
function payload(c: { argv: string[]; head: string }): string | undefined {
  if (SHELLS.has(c.head)) {
    const k = c.argv.findIndex(a => /^-[a-z]*c[a-z]*$/.test(a))
    if (k < 1) return undefined
    return c.argv[k + 1] === '--' ? c.argv[k + 2] : c.argv[k + 1]
  }
  if (c.head === 'watch') {
    let i = 1
    while (c.argv[i]?.startsWith('-')) i += c.argv[i] === '-n' || c.argv[i] === '--interval' ? 2 : 1
    return i < c.argv.length ? c.argv.slice(i).join(' ') : undefined
  }
  return undefined
}

/** The folder a `cd` or `pushd` changes to, past its options (`-P`, `-L`, `-e`, `--`). */
function cdTarget(argv: string[]): string | undefined {
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--') return argv[i + 1]
    const a = argv[i] ?? ''
    if (!/^-[A-Za-z@]+$/.test(a)) return a
  }
  return undefined
}

/** Brace expansion of the comma form (`/{tmp,x}/y`), at most 64 words; `${...}` is left alone. */
function braces(word: string): string[] {
  for (let i = 0; i < word.length; i++) {
    if (word[i] !== '{' || word[i - 1] === '$') continue
    const alts: string[] = []
    let depth = 0
    let from = i + 1
    for (let j = i + 1; j < word.length; j++) {
      if (word[j] === '{') depth++
      else if (word[j] === '}' && depth-- === 0) {
        if (!alts.length) break
        alts.push(word.slice(from, j))
        const head = word.slice(0, i)
        const rest = braces(word.slice(j + 1))
        return alts.flatMap(a => braces(head + a).flatMap(h => rest.map(r => h + r))).slice(0, 64)
      } else if (word[j] === ',' && depth === 0) {
        alts.push(word.slice(from, j))
        from = j + 1
      }
    }
  }
  return [word]
}

/** The paths a `tee`, `cp`, `mv` or `install` command writes. */
function writtenPaths(argv: string[], head: string): string[] {
  const args = argv.slice(1)
  if (head === 'tee') return args.filter(a => !a.startsWith('-'))
  const operands: string[] = []
  let target: string | undefined
  let isDirMode = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-t' || a === '--target-directory') target = args[++i]
    else if (a.startsWith('--target-directory=')) target = a.slice(a.indexOf('=') + 1)
    else if (head === 'install' && a === '-d') isDirMode = true
    else if (head === 'install' && ['-m', '-o', '-g', '-S'].includes(a)) i++
    else if (a.startsWith('-')) continue
    else operands.push(a)
  }
  if (target !== undefined) return [target]
  if (isDirMode) return operands
  return operands.length > 1 ? [operands[operands.length - 1]] : []
}

/**
 * Where a `mktemp` makes its file or folder: the `-p DIR` / `--tmpdir=DIR`
 * folder, else a template that names its own place (no `-t`), else TMPDIR or
 * /tmp. That last is refused whatever TMPDIR is (D3.1), so it reads as `/tmp`.
 */
function mktempPaths(argv: string[]): string[] {
  let dir: string | undefined
  let inTmp = false
  const operands: string[] = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '--version') return []
    if (a === '--') {
      operands.push(...argv.slice(i + 1))
      break
    }
    if (a === '--tmpdir') inTmp = true
    else if (a.startsWith('--tmpdir=')) dir = a.slice('--tmpdir='.length)
    else if (a.startsWith('--')) continue
    else if (a.length > 1 && a.startsWith('-')) {
      for (let k = 1; k < a.length; k++) {
        if (a[k] === 't') inTmp = true
        else if (a[k] === 'p') {
          dir = k + 1 < a.length ? a.slice(k + 1) : argv[++i]
          break
        }
      }
    } else operands.push(a)
  }
  if (dir !== undefined) return [dir || '/tmp']
  return inTmp || !operands.length ? ['/tmp'] : operands
}

/** Values given to TMPDIR: as an assignment (`TMPDIR=x cmd`, `env TMPDIR=x`) or an `export`/`declare` operand. */
function tmpdirValues(line: string, cmds: { argv: string[]; head: string }[]): string[] {
  const words = assignments(line)
  for (const c of cmds) if (['export', 'declare', 'typeset', 'local', 'readonly'].includes(c.head)) words.push(...c.argv.slice(1))
  return words.filter(w => w.startsWith('TMPDIR=')).map(w => w.slice('TMPDIR='.length))
}

/**
 * Every path a Bash line writes that this rule reads: redirects, tee/cp/mv/install
 * destinations, where a mktemp lands, a TMPDIR value, and a literal cd target
 * (a session working in /tmp is the thing banned).
 */
export function bashWriteTargets(line: string, depth = 0): { paths: string[]; cds: string[] } {
  const cmds = commands(line)
  // A heredoc body is data: only its header line's redirects count.
  const paths = redirectTargets(stripHeredocs(line))
  paths.push(...tmpdirValues(line, cmds))
  const cds: string[] = []
  for (const c of cmds) {
    // A `sh -c` or `watch` payload was quoted in the outer line: read it as its own line.
    const run = payload(c)
    if (run !== undefined && depth < 4) {
      const t = bashWriteTargets(run, depth + 1)
      paths.push(...t.paths)
      cds.push(...t.cds)
    }
    if (['tee', 'cp', 'mv', 'install'].includes(c.head)) paths.push(...writtenPaths(withoutRedirects(c.argv), c.head))
    if (c.head === 'mktemp') paths.push(...mktempPaths(withoutRedirects(c.argv)))
    const dir = c.head === 'cd' || c.head === 'pushd' ? cdTarget(c.argv) : undefined
    if (dir?.startsWith('/')) {
      cds.push(dir)
      paths.push(dir)
    }
  }
  return { paths, cds }
}

type Candidate = { abs: string; literal: boolean }

/**
 * The absolute spellings of every write target, one per (target, base) pair.
 * `$TMPDIR` is read as the session's own TMPDIR (Development points it under
 * _tmp, which tools may use: Rico ruling 2026-10-03), else as
 * /private/var/folders where macOS points it; any other variable part is read
 * only up to where it starts, and such a target is judged by spelling only.
 */
function candidates(input: NoTmpInput): Candidate[] {
  if (!isUnder(input.cwd, SCOPES)) return []
  let paths: string[]
  let bases: string[]
  if (input.tool === 'bash' && typeof input.command === 'string') {
    const t = bashWriteTargets(input.command)
    // A relative target is judged against the session cwd and any literal `cd` in the line.
    paths = t.paths
    bases = [input.cwd, ...t.cds]
  } else if (FILE_TOOLS.has(input.tool) && typeof input.path === 'string') {
    paths = [input.path]
    bases = [input.cwd]
  } else return []

  const tmpdir = (input.tmpdir || '/private/var/folders/T').replace(/\/$/, '')
  const out: Candidate[] = []
  for (const path of paths) {
    // `~` and `~/...` are HOME; `~user` is a variable part.
    const homed = input.home ? path.replace(/^~(?=\/|$)/, input.home.replace(/\/$/, '')) : path
    for (const spelled of braces(homed.replace(/^\$\{?TMPDIR\}?(?=\/|$)/, tmpdir))) {
      const dyn = spelled.search(/[$`*?[{]|^~/)
      const literal = dyn < 0 ? spelled : spelled.slice(0, dyn)
      if (!literal) continue
      for (const base of literal.startsWith('/') ? [''] : bases)
        out.push({ abs: normalize(base ? `${base}/${literal}` : literal), literal: dyn < 0 })
    }
  }
  return out
}

/**
 * Every absolute path the decision will hand to `realpath`, for a caller whose
 * link resolution is async (the Claude engine): resolve these first, then pass
 * a lookup as `realpath`.
 */
export function realpathQueries(input: Omit<NoTmpInput, 'realpath'>): string[] {
  return [...new Set(candidates(input).filter(c => c.literal).flatMap(c => prefixes(c.abs)))]
}

/** The no-tmp verdict: a deny reason when a write lands under a /tmp root, by spelling or real path; else null. */
export function noTmp(input: NoTmpInput): { deny: string } | null {
  for (const c of candidates(input)) {
    if (isUnder(c.abs, ROOTS)) return { deny: TMP_HELP }
    if (c.literal && input.realpath) {
      const real = placed(c.abs, input.realpath)
      if (real === null) return { deny: `${c.abs} is a link that leads nowhere, so where it writes is unknown. ${TMP_HELP}` }
      if (real !== undefined && isUnder(real, ROOTS)) return { deny: TMP_HELP }
    }
  }
  return null
}
