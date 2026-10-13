// A small shell reader for the dev-rules mod: enough to find each simple
// command in a Bash line and its real command word. It is NOT the gates'
// parser (the settings gate's own shell parser, which a mod may not import):
// when a rule cannot read a line it must fall through with next(e) and let
// the settings gates beneath decide.

export type Cmd = {
  /** Tokens with quotes removed; argv[0] is the command word. */
  argv: string[]
  /** Basename of the command word after wrappers and assignments. */
  head: string
  /** True when the command word is a $VAR, $(...) or backtick. */
  isDynamic: boolean
}

/**
 * Splits a line into tokens per simple command, quotes removed. A `$(...)`
 * or backtick inside double quotes stays part of its token (one argument),
 * and its command text is pushed onto `subs`, since bash still runs it
 * (PR 911 review). Single-quoted text is literal.
 */
function split(line: string, subs?: string[]): string[][] {
  const out: string[][] = []
  let cmd: string[] = []
  let tok = ''
  let has = false
  let quote: '' | "'" | '"' = ''
  // The open quote is `$'...'`: a `\` escapes the next character (`$'don\'t'`).
  let ansi = false
  const endTok = () => {
    if (has) cmd.push(tok)
    tok = ''
    has = false
  }
  const endCmd = () => {
    endTok()
    if (cmd.length) out.push(cmd)
    cmd = []
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = ''
      else if (c === '\\' && (quote === '"' || ansi) && i + 1 < line.length) tok += line[++i]
      else if (quote === '"' && (c === '`' || (c === '$' && line[i + 1] === '('))) {
        let j = i + 1
        if (c === '`') while (j < line.length && line[j] !== '`') j += line[j] === '\\' ? 2 : 1
        else j = closeOf(line, i + 1, '(', ')')
        const text = line.slice(i, j + 1)
        tok += text
        subs?.push(...expansions(text))
        i = j
      } else tok += c
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      ansi = c === "'" && isAnsiQuote(line, i)
      has = true
      continue
    }
    if (c === '\\' && i + 1 < line.length) {
      if (line[i + 1] === '\n') i++
      else {
        tok += line[++i]
        has = true
      }
      continue
    }
    if (c === ' ' || c === '\t') {
      endTok()
      continue
    }
    if (c === '#' && !has) {
      // An unquoted `#` starting a word comments out the rest of the line.
      while (i + 1 < line.length && line[i + 1] !== '\n') i++
      continue
    }
    if (c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')' || c === '`') {
      endCmd()
      continue
    }
    tok += c
    has = true
  }
  endCmd()
  return out
}

const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
/**
 * Wrappers that run the command after them: the short option letters and the
 * long options that take a value. A short value may be attached (`-uroot`) or
 * end a cluster (`-nu rico`); a long one may use `=` (`--user=x`).
 */
const WRAPPERS: Record<string, { short: string; long: string[] }> = {
  sudo: { short: 'ugCphUrtTDR', long: ['--user', '--group', '--close-from', '--prompt', '--host', '--other-user', '--role', '--type', '--command-timeout', '--chdir', '--chroot'] },
  doas: { short: 'uC', long: [] },
  env: { short: 'uCSP', long: ['--unset', '--chdir', '--split-string'] },
  command: { short: '', long: [] },
  exec: { short: 'a', long: [] },
  builtin: { short: '', long: [] },
  nohup: { short: '', long: [] },
  // `time` is a bash reserved word (`time -p`) and /usr/bin/time; both run what follows.
  time: { short: 'fo', long: ['--format', '--output'] },
  nice: { short: 'n', long: ['--adjustment'] },
  ionice: { short: 'cnp', long: ['--class', '--classdata', '--pid'] },
  stdbuf: { short: 'ioe', long: ['--input', '--output', '--error'] },
  xargs: { short: 'InPLdEsa', long: ['--max-args', '--max-procs', '--max-lines', '--delimiter', '--eof', '--max-chars', '--arg-file'] },
  timeout: { short: 'sk', long: ['--signal', '--kill-after'] },
}
/** Shell reserved words that can come before a command word. */
const RESERVED = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'for', 'case', 'esac', '{', '}', '!'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])

/**
 * Strips assignments, reserved words and wrappers with their options. Returns
 * the token list (an `env -S` payload split in place of its option, as env
 * itself does) and the index of the command word in it.
 */
function unwrapAt(tokens: string[]): { toks: string[]; at: number } {
  const toks = [...tokens]
  let i = 0
  while (i < toks.length) {
    const t = toks[i]
    if (ASSIGN.test(t) || RESERVED.has(t)) {
      i++
      continue
    }
    const base = t.split('/').pop() ?? t
    const spec = WRAPPERS[base]
    if (!spec) break
    i++
    while (i < toks.length && (toks[i].startsWith('-') || ASSIGN.test(toks[i]))) {
      const o = toks[i]
      if (o === '--') {
        i++
        break
      }
      let used = 1
      let value: string | undefined
      let opt = o
      if (o.startsWith('--')) {
        const eq = o.indexOf('=')
        if (eq > 0) {
          opt = o.slice(0, eq)
          value = o.slice(eq + 1)
        } else if (spec.long.includes(o)) {
          value = toks[i + 1]
          used = 2
        }
      } else if (o.startsWith('-')) {
        for (let k = 1; k < o.length; k++) {
          if (!spec.short.includes(o[k])) continue
          opt = `-${o[k]}`
          if (k + 1 < o.length) value = o.slice(k + 1)
          else {
            value = toks[i + 1]
            used = 2
          }
          break
        }
      }
      if (base === 'env' && (opt === '-S' || opt === '--split-string') && value !== undefined) {
        // env splits the payload into words and reads them as its own arguments.
        toks.splice(i, used, ...split(value).flat())
        continue
      }
      i += used
    }
    if (base === 'timeout') i++ // its duration
  }
  return { toks, at: i }
}

function unwrap(tokens: string[]): string[] {
  const { toks, at } = unwrapAt(tokens)
  return toks.slice(at)
}

/** Commands that run a heredoc body fed to them: shells, interpreters, a remote shell, eval. */
const EXECUTORS = /^(?:bash|sh|zsh|dash|ksh|fish|ssh|xargs|eval|source|\.|python[0-9.]*|node|perl|ruby)$/

/** True when any simple command in `text` is an executor, its wrappers included (`cat <<EOF | xargs` feeds xargs). */
function hasExecutor(text: string): boolean {
  return split(text).some(raw => {
    const { toks, at } = unwrapAt(raw)
    return toks.slice(0, at + 1).some(w => EXECUTORS.test(w.split('/').pop() ?? w))
  })
}

/**
 * The header's pipelines: split at top-level `;`, `&&`, `||` and `&`, never
 * at `|`, `|&`, a redirect's `&` (`2>&1`, `&>`), or inside quotes, `(...)` or
 * `{ ...; }`. Each comes with whether it holds a heredoc operator.
 */
function pipelines(header: string): { text: string; heredoc: boolean }[] {
  const out: { text: string; heredoc: boolean }[] = []
  let start = 0
  let depth = 0
  let heredoc = false
  const cut = (end: number, next: number) => {
    out.push({ text: header.slice(start, end), heredoc })
    start = next
    heredoc = false
  }
  for (let i = 0; i < header.length; i++) {
    const c = header[i]
    const prev = i ? header[i - 1] : ' '
    if (c === '\\') i++
    else if (c === "'") {
      const end = quoteEnd(header, i)
      i = end < 0 ? header.length : end
    } else if (c === '"') {
      while (++i < header.length && header[i] !== '"') if (header[i] === '\\') i++
    } else if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === '{' && /[\s;&|(]/.test(prev) && /[\s]/.test(header[i + 1] ?? '')) depth++
    else if (c === '}' && /[\s;&]/.test(prev)) depth = Math.max(0, depth - 1)
    else if (c === '<' && header[i + 1] === '<') {
      if (header[i + 2] === '<') i += 2
      else {
        heredoc = true
        i++
      }
    } else if (depth === 0 && c === ';') cut(i, i + 1)
    else if (depth === 0 && (c === '&' || c === '|') && header[i + 1] === c) {
      cut(i, i + 2)
      i++
    } else if (depth === 0 && c === '&' && !/[<>|]/.test(prev) && header[i + 1] !== '>') cut(i, i + 1)
  }
  cut(header.length, header.length)
  return out
}

/**
 * True when a heredoc's header line feeds its bodies to something that runs
 * them (PR 911 review): an executor in the pipeline that receives a heredoc
 * (`bash <<EOF`, `cat <<EOF | sh`, `sudo env bash <<EOF`), or a heredoc
 * pipeline ending in a pipe whose reader follows the body. An executor in a
 * separate `&&`, `;`, `||` or `&` command does not run the body. A header
 * whose heredoc cannot be placed falls back to the whole line, keeping the body.
 */
function feedsExecutor(header: string): boolean {
  const parts = pipelines(header)
  const fed = parts.filter(p => p.heredoc)
  if (!fed.length) return /\|&?\s*$/.test(header) || hasExecutor(header)
  const last = parts[parts.length - 1]
  if (last.heredoc && /\|&?\s*$/.test(last.text)) return true
  return fed.some(p => hasExecutor(p.text))
}

/**
 * The heredoc operator `<<[-]WORD` at `i`: its delimiter, `-` flag, whether
 * quoted, and the index after it. A `<<` is a heredoc only when a line equal
 * to its delimiter (tab-stripped for `<<-`) follows (PR 928 a4e6c4f review):
 * otherwise it is a shift or a pattern (`((1<<2))`, `$[1<<2]`, `${x//<</}`)
 * or a body that never ends, and the empty delimiter, ending after the `<<`,
 * leaves the rest to be read as shell text. A misread `<<` then hides nothing.
 */
function heredocAt(line: string, i: number): { delim: string; tabs: boolean; quoted: boolean; end: number } {
  const h = heredocWord(line, i)
  if (h.delim && terminated(line, i, h.delim, h.tabs)) return h
  return { delim: '', tabs: h.tabs, quoted: h.quoted, end: i + 2 }
}

/** Whether a line equal to `delim` (leading tabs stripped when `tabs`) follows the line holding `i`. */
function terminated(text: string, i: number, delim: string, tabs: boolean): boolean {
  for (let pos = text.indexOf('\n', i); pos >= 0; ) {
    const end = text.indexOf('\n', pos + 1)
    const line = text.slice(pos + 1, end < 0 ? text.length : end)
    if ((tabs ? line.replace(/^\t+/, '') : line) === delim) return true
    pos = end
  }
  return false
}

/** The word after the `<<[-]` at `i`, read as a heredoc delimiter, and the index after it. */
function heredocWord(line: string, i: number): { delim: string; tabs: boolean; quoted: boolean; end: number } {
  let j = i + 2
  const tabs = line[j] === '-'
  if (tabs) j++
  while (line[j] === ' ' || line[j] === '\t') j++
  let delim = ''
  let q = ''
  let quoted = false
  for (; j < line.length; j++) {
    const d = line[j]
    if (q) {
      if (d === q) q = ''
      else delim += d
    } else if (d === "'" || d === '"') {
      q = d
      quoted = true
    } else if (d === '\\' && j + 1 < line.length) {
      delim += line[++j]
      quoted = true
    } else if (/[\s;&|()<>]/.test(d)) break
    else delim += d
  }
  return { delim, tabs, quoted, end: j }
}

/** Whether the `'` at `i` opens an ANSI-C `$'...'` string, where a `\` escapes the next character. */
function isAnsiQuote(text: string, i: number): boolean {
  return text[i - 1] === '$' && text[i - 2] !== '\\'
}

/** Index of the `'` closing the one at `j`, or -1 when unclosed (`$'don\'t'` closes at its last quote). */
function quoteEnd(text: string, j: number): number {
  if (!isAnsiQuote(text, j)) return text.indexOf("'", j + 1)
  for (j++; j < text.length; j++) {
    if (text[j] === '\\') j++
    else if (text[j] === "'") return j
  }
  return -1
}

/** Where a command can start inside the text read so far: after `$(`, `;`, `&`, `|`, `{`, a newline or `then`/`do`/`else`. */
const COMMAND_START = /(?:^|[;&|(){}\n]|\b(?:then|do|else))[ \t]*$/

/**
 * Index of the bracket closing the one at `open` (end of text when unclosed).
 * Quote-aware (PR 911 lead verdict): a bracket inside '...', "..." or after a
 * `\` does not count, and a `$(...)` or backtick inside "..." is skipped whole,
 * so `"$(echo ')'; cmd)"` closes after `cmd`. In a command substitution
 * `$(...)` a heredoc body and a `#` comment are skipped too: an apostrophe
 * there is literal (PR 928 review); and a `case` pattern's `)` ends the
 * pattern, not the substitution (`"$(case $x in a) cmd;; esac)"`). A quote
 * left unclosed falls back to plain bracket counting, so it never swallows
 * the rest of the line.
 *
 * Threat model (Rico ruling 2026-10-05): this reader, like `stripHeredocs`,
 * stops an agent breaking a rule by mistake. It is best-effort, not bash's
 * parser: where it cannot tell, it fails toward reading text as commands (a
 * `<<` with no terminator line hides nothing, an unclosed quote counts plain
 * brackets), so a rule sees more, never less. Deliberate evasion (names built
 * by concatenation or escapes, eval of built strings, contrived quoting) is
 * out of scope.
 */
function closeOf(text: string, open: number, o: string, c: string): number {
  // Shell text, not `${...}` or arithmetic `((...))`: heredocs and comments apply.
  const sh = o === '(' && text[open + 1] !== '('
  const pending: { delim: string; tabs: boolean }[] = []
  // Open `case` statements, and what the innermost expects next: its `in`, a pattern, or nothing special.
  let cases = 0
  let want: '' | 'in' | 'pat' = ''
  let depth = 0
  for (let j = open; j < text.length; j++) {
    const ch = text[j]
    if (ch === '\\') j++
    else if (ch === "'") {
      const end = quoteEnd(text, j)
      if (end < 0) return closeOfPlain(text, open, o, c)
      j = end
    } else if (ch === '"') {
      for (j++; j < text.length && text[j] !== '"'; j++) {
        if (text[j] === '\\') j++
        else if (text[j] === '$' && text[j + 1] === '(') j = closeOf(text, j + 1, '(', ')')
        else if (text[j] === '`') while (++j < text.length && text[j] !== '`') if (text[j] === '\\') j++
      }
      if (j >= text.length) return closeOfPlain(text, open, o, c)
    } else if (ch === '`') {
      // A backtick body ends at the next unescaped backtick, in `((...))`, `${...}` and
      // shell text alike: a `#` or apostrophe inside it opens nothing (D1.3/1, PR 928 P1).
      while (++j < text.length && text[j] !== '`') if (text[j] === '\\') j++
    } else if (!sh && ch === '$' && text[j + 1] === '(' && text[j + 2] !== '(') {
      // A `$(...)` inside `((...))` or `${...}` is shell text: its comments and
      // heredoc bodies are skipped (PR 928 1c592dc review).
      j = closeOf(text, j + 1, '(', ')')
    } else if (sh && ch === '$' && text[j + 1] === '(' && text[j + 2] === '(') {
      // A nested `$((...))` is its own context: its `<<` is a shift (PR 928 34dca59 review).
      j = closeOf(text, j + 1, '(', ')')
    } else if (sh && ch === '$' && text[j + 1] === '{') {
      // A nested `${...}` too: `${x//<</}` holds no heredoc.
      j = closeOf(text, j + 1, '{', '}')
    } else if (sh && ch === '$' && text[j + 1] === '[') {
      // Arithmetic `$[...]`: its `<<` is a shift.
      j = closeOf(text, j + 1, '[', ']')
    } else if (sh && j > open && ch === '(' && text[j + 1] === '(') {
      // Every `((` is skipped to its `))` wherever it starts (PR 928 5e5d3c3 review): an
      // arithmetic command's `<<` is a shift, and a `((` that is two subshells is still
      // read as commands, only its `<<` is not taken as a heredoc.
      j = closeOf(text, j, '(', ')')
    } else if (sh && ch === '#' && /[\s;&|()]/.test(text[j - 1])) {
      while (j + 1 < text.length && text[j + 1] !== '\n') j++
    } else if (sh && ch === '<' && text[j + 1] === '<') {
      if (text[j + 2] === '<') j += 2 // a here-string
      else {
        const h = heredocAt(text, j)
        if (h.delim) pending.push(h)
        j = h.end - 1
      }
    } else if (sh && ch === '\n' && pending.length) {
      // Skip each body, in order, through its delimiter line.
      let pos = j + 1
      for (const { delim, tabs } of pending) {
        while (pos < text.length) {
          const end = text.indexOf('\n', pos)
          const line = text.slice(pos, end < 0 ? text.length : end)
          pos = end < 0 ? text.length : end + 1
          if ((tabs ? line.replace(/^\t+/, '') : line) === delim) break
        }
      }
      pending.length = 0
      j = pos - 1
    } else if (sh && cases && ch === ';' && (text[j + 1] === ';' || text[j + 1] === '&')) {
      // `;;`, `;&` or `;;&` ends a case body: a pattern comes next.
      want = 'pat'
      j++
    } else if (sh && want === 'pat' && (ch === '(' || ch === ')')) {
      // A pattern's brackets, `a)` or `(a)`, are not the substitution's.
      if (ch === ')') want = ''
    } else if (sh && /[A-Za-z_]/.test(ch) && !/[A-Za-z0-9_$]/.test(text[j - 1] ?? '')) {
      const m = /^(?:case|esac|in)(?![A-Za-z0-9_])/.exec(text.slice(j, j + 5))
      if (m) {
        const word = m[0]
        if (word === 'in' && want === 'in') want = 'pat'
        else if (word !== 'in' && COMMAND_START.test(text.slice(open, j))) {
          if (word === 'case') cases++
          else if (cases) cases--
          want = word === 'case' ? 'in' : ''
        }
        j += word.length - 1
      }
    } else if (ch === o) depth++
    else if (ch === c && --depth === 0) return j
  }
  return text.length - 1
}

/** Plain bracket counting from `open`, the reading before PR 928 (end of text when unclosed). */
function closeOfPlain(text: string, open: number, o: string, c: string): number {
  let depth = 0
  for (let j = open; j < text.length; j++) {
    if (text[j] === o) depth++
    else if (text[j] === c && --depth === 0) return j
  }
  return text.length - 1
}

/** The command text of each `$(...)`, backtick and `$((...))` in an unquoted heredoc body: those still run. */
function expansions(body: string): string[] {
  const out: string[] = []
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '\\') i++
    else if (c === '`') {
      let j = i + 1
      while (j < body.length && body[j] !== '`') j += body[j] === '\\' ? 2 : 1
      out.push(body.slice(i + 1, j))
      i = j
    } else if (c === '$' && body[i + 1] === '(') {
      const j = closeOf(body, i + 1, '(', ')')
      if (body[i + 2] === '(') out.push(...expansions(body.slice(i + 3, j)))
      else out.push(body.slice(i + 2, j))
      i = j
    }
  }
  return out
}

/**
 * The line with every literal heredoc body removed
 * round 12, PR 916 round 5). A literal body is data, never commands and never
 * redirect targets; the header line keeps its own words, so
 * `git worktree add /x <<EOF` is still read. A body is kept and read as shell
 * when its header feeds it to a shell or interpreter (`bash <<EOF`,
 * `cat <<EOF | sh`, `ssh host <<EOF`, `eval`, `source`, `xargs`). An unquoted
 * delimiter's body is dropped but its `$(...)`, backtick and `$((...))`
 * expansions are kept, one per line, since they still run. Handles `<<WORD`,
 * `<<'WORD'`, `<<"WORD"`, `<<-WORD` (tab-stripped terminator) and several
 * heredocs on one header. A double-quoted string is left whole: it is one
 * word to every reader (identity reads `"$(cat <<'EOF' ...)"` from it). A `<<`
 * with no terminator line is not a heredoc: what follows is read as commands. `<<<`, `$((1<<2))`,
 * `((a<<2))`, `let a=1<<2`, `${x//<</}` and comments are not heredocs.
 */
export function stripHeredocs(line: string): string {
  if (!line.includes('<<')) return line
  let out = ''
  // Context stack: 'sh' is shell text (top level or inside `$(`), '"' a double-quoted string.
  const stack: ('sh' | '"')[] = ['sh']
  const pending: { delim: string; tabs: boolean; quoted: boolean }[] = []
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (stack[stack.length - 1] === '"') {
      out += c
      if (c === '\\' && i + 1 < line.length) out += line[++i]
      else if (c === '"') stack.pop()
      continue
    }
    if (c === '\n' && pending.length) {
      // The bodies follow the header line, in the order their operators appeared.
      // The header runs back past `\`-newline continuations (`cat <<EOF \` then `| bash`).
      let from = out.lastIndexOf('\n')
      while (from > 0 && out[from - 1] === '\\') from = out.lastIndexOf('\n', from - 1)
      const run = feedsExecutor(out.slice(from + 1))
      out += c
      if (run) {
        // An executed body is commands: keep it and read on as shell text.
        pending.length = 0
        continue
      }
      let pos = i + 1
      for (const { delim, tabs, quoted } of pending) {
        const body: string[] = []
        while (pos < line.length) {
          const end = line.indexOf('\n', pos)
          const text = line.slice(pos, end < 0 ? line.length : end)
          pos = end < 0 ? line.length : end + 1
          if ((tabs ? text.replace(/^\t+/, '') : text) === delim) break
          body.push(text)
        }
        // An unquoted delimiter's body still runs its substitutions.
        if (!quoted) for (const cmd of expansions(body.join('\n'))) out += stripHeredocs(cmd) + '\n'
      }
      pending.length = 0
      i = pos - 1
      continue
    }
    let stop = i + 1
    if (c === "'") {
      const end = quoteEnd(line, i)
      stop = end < 0 ? line.length : end + 1
    } else if (c === '\\') stop = Math.min(i + 2, line.length)
    else if (c === '"') stack.push('"')
    else if (c === '#' && (i === 0 || /[\s;&|()]/.test(line[i - 1]))) {
      const end = line.indexOf('\n', i)
      stop = end < 0 ? line.length : end
    } else if (c === '$' && line[i + 1] === '(' && line[i + 2] === '(') {
      // Arithmetic `$((...))`: its `<<` is a shift.
      stop = Math.min(closeOf(line, i + 1, '(', ')') + 1, line.length)
    } else if (c === '$' && line[i + 1] === '{') {
      // Parameter expansion `${...}`: a `<<` inside it is a pattern.
      stop = Math.min(closeOf(line, i + 1, '{', '}') + 1, line.length)
    } else if (c === '$' && line[i + 1] === '[') {
      // Arithmetic `$[...]`: its `<<` is a shift.
      stop = Math.min(closeOf(line, i + 1, '[', ']') + 1, line.length)
    } else if (c === '$' && line[i + 1] === '(') {
      stop = i + 2
      stack.push('sh')
    } else if (c === '(' && line[i + 1] === '(') {
      // Every `((` is arithmetic for heredoc purposes, wherever it starts (PR 928 5e5d3c3 review).
      stop = Math.min(closeOf(line, i, '(', ')') + 1, line.length)
    } else if (/^let[ \t]/.test(line.slice(i, i + 4)) && (i === 0 || /[\s;&|(]/.test(line[i - 1]))) {
      // `let` arithmetic runs to the end of its command.
      const m = /[\n;&|]/.exec(line.slice(i))
      stop = m ? i + m.index : line.length
    } else if (c === ')' && stack.length > 1) stack.pop()
    else if (c === '<' && line[i + 1] === '<' && line[i + 2] === '<') stop = i + 3 // a here-string
    else if (c === '<' && line[i + 1] === '<') {
      const { delim, tabs, quoted, end } = heredocAt(line, i)
      if (delim) pending.push({ delim, tabs, quoted })
      stop = end
    }
    out += line.slice(i, stop)
    i = stop - 1
  }
  return out
}

/** Every simple command in a Bash line, wrappers stripped, `sh -c` payloads unwrapped. */
export function commands(line: string, depth = 0): Cmd[] {
  if (depth > 4) return []
  const out: Cmd[] = []
  const subs: string[] = []
  for (const raw of split(stripHeredocs(line), subs)) {
    const argv = unwrap(raw)
    if (!argv.length) continue
    const word = argv[0]
    const head = word.split('/').pop() ?? word
    out.push({ argv, head, isDynamic: /^\$|^`/.test(word) })
    if (SHELLS.has(head)) {
      const c = argv.findIndex(a => /^-[a-z]*c[a-z]*$/.test(a))
      if (c > 0 && c + 1 < argv.length) out.push(...commands(argv[c + 1], depth + 1))
    } else if (head === 'eval') {
      // eval re-reads its arguments as one command line.
      out.push(...commands(argv.slice(1).join(' '), depth + 1))
    } else if (head === 'watch') {
      // watch runs its arguments through `sh -c`.
      let i = 1
      while (i < argv.length && argv[i].startsWith('-')) i += argv[i] === '-n' || argv[i] === '--interval' ? 2 : 1
      out.push(...commands(argv.slice(i).join(' '), depth + 1))
    }
  }
  // Substitutions inside double quotes run too; commands() strips their heredocs.
  for (const sub of subs) out.push(...commands(sub, depth + 1))
  return out
}

/**
 * The `NAME=value` words a line sets ahead of a command word, wrappers
 * included (`env A=1 x`), and in an assignment-only command (`A=1`).
 * `export` and `declare` operands are argv words, for the caller to read.
 */
export function assignments(line: string, depth = 0): string[] {
  if (depth > 4) return []
  const out: string[] = []
  const subs: string[] = []
  for (const raw of split(stripHeredocs(line), subs)) {
    const { toks, at } = unwrapAt(raw)
    out.push(...toks.slice(0, at).filter(t => ASSIGN.test(t)))
  }
  for (const sub of subs) out.push(...assignments(sub, depth + 1))
  return out
}

/** Git's own options that come before the subcommand, and whether each takes a value. */
const GIT_OPT_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix', '--attr-source'])

/** The git subcommand of a `git ...` argv, past git's own options. */
export function gitSubcommand(argv: string[]): string | undefined {
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (GIT_OPT_WITH_VALUE.has(a)) {
      i++
      continue
    }
    if (a.startsWith('-')) continue
    return a
  }
  return undefined
}
