import type { On } from 'claude-code'
import { commands, stripHeredocs } from '../lib/shell.ts'

// Operator ruling 2026-10-02, restated 2026-10-03: Rico must see every worker.
// A Workflow holding several agents shows as one row, and a backgrounded
// `claude -p` shows as nothing; both hide lanes. Headless sessions (no
// surface, e.g. overnight -p runs) have nobody watching and are exempt.
export const ONE_LANE =
  'one lane per Workflow call, so each lane is its own visible row; ' +
  'launch the others as separate Workflow calls (at most 6 at once)'
export const HIDDEN_AGENT = 'a hidden background agent; run it as a Workflow lane'

import { SCOPE_ROOTS as ROOTS } from '../config.ts'
const AGENT_CLIS = new Set(['claude', 'claudex', 'codex', 'pi'])
const PRINT_FLAGS = new Set(['-p', '--print', 'exec'])

// Spec scope: Development or _tmp. Not in shared shell.ts, so kept here.
function inScope(cwd: string): boolean {
  return ROOTS.some(r => cwd === r || cwd.startsWith(r + '/'))
}

/**
 * The script with comments blanked and string/template text blanked, so only
 * code is left. A template's `${...}` is code and kept. Regex literals are not
 * recognised; line breaks are kept so positions still line up.
 */
export function codeOnly(src: string): string {
  let out = ''
  // '`' is template text, '${' a template expression, '{' a brace inside one.
  const stack: string[] = []
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const top = stack[stack.length - 1]
    if (top === '`') {
      if (c === '\\') {
        out += blank(src.slice(i, i + 2))
        i++
      } else if (c === '`') {
        stack.pop()
        out += c
      } else if (c === '$' && src[i + 1] === '{') {
        stack.push('${')
        out += '${'
        i++
      } else out += blank(c)
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i)
      const stop = end < 0 ? src.length : end
      out += blank(src.slice(i, stop))
      i = stop - 1
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      out += blank(src.slice(i, stop))
      i = stop - 1
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      out += c + blank(src.slice(i + 1, j)) + (j < src.length ? src[j] : '')
      i = j
    } else {
      if (c === '`') stack.push('`')
      else if (c === '{' && stack.length) stack.push('{')
      else if (c === '}' && (top === '{' || top === '${')) stack.pop()
      out += c
    }
  }
  return out
}

const AGENT = /(?<![\w.$])agent\s*\(/g

/** Positions of the `agent(` call sites in a Workflow script's code (not `fooagent(` or `x.agent(`). */
function agentSites(code: string): number[] {
  return [...code.matchAll(AGENT)].map(m => m.index ?? 0)
}

/** Counts `agent(` call sites in a Workflow script, comments and strings excluded. */
export function agentCalls(script: string): number {
  return agentSites(codeOnly(script)).length
}

/** Index of the bracket closing the one at `open` (end of text when unclosed). */
function closeOf(code: string, open: number): number {
  const o = code[open]
  const c = o === '(' ? ')' : '}'
  let depth = 0
  for (let j = open; j < code.length; j++) {
    if (code[j] === o) depth++
    else if (code[j] === c && --depth === 0) return j
  }
  return code.length
}

/** End of the single statement starting at `from`: the first `;` or line break outside brackets. */
function statementEnd(code: string, from: number): number {
  let depth = 0
  for (let j = from; j < code.length; j++) {
    const c = code[j]
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') {
      if (--depth < 0) return j
    } else if (depth === 0 && (c === ';' || c === '\n') && j > from) return j
  }
  return code.length
}

/**
 * The [start, end) ranges of code that may run more than once: the arguments
 * of `.map(`, `.forEach(`, `parallel(` and `pipeline(`, and the bodies of
 * `for`, `while` and `do` loops.
 */
function repeatRanges(code: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of code.matchAll(/(?:\.\s*(?:map|forEach)|(?<![\w.$])(?:parallel|pipeline))\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1
    out.push([open, closeOf(code, open)])
  }
  for (const m of code.matchAll(/(?<![\w.$])(?:for|while)\s*(?:await\s*)?\(/g)) {
    const head = closeOf(code, (m.index ?? 0) + m[0].length - 1)
    let b = head + 1
    while (b < code.length && /\s/.test(code[b])) b++
    out.push([b, code[b] === '{' ? closeOf(code, b) : statementEnd(code, b)])
  }
  for (const m of code.matchAll(/(?<![\w.$])do\s*\{/g)) {
    const open = (m.index ?? 0) + m[0].length - 1
    out.push([open, closeOf(code, open)])
  }
  return out
}

/** True when a Workflow script may start more than one agent: several call sites, or one that repeats. */
export function manyAgents(script: string): boolean {
  const code = codeOnly(script)
  const sites = agentSites(code)
  if (sites.length > 1) return true
  if (sites.length === 0) return false
  return repeatRanges(code).some(([s, e]) => sites[0] > s && sites[0] < e)
}

/** True when the line runs claude/claudex/codex/pi in print or exec mode (`codex e` too). */
export function isPrintAgent(line: string): boolean {
  return commands(line).some(
    c => AGENT_CLIS.has(c.head) && c.argv.slice(1).some(a => PRINT_FLAGS.has(a) || (c.head === 'codex' && a === 'e')),
  )
}

/**
 * The text of each command list a single `&` sends to the background. The
 * list runs back to the previous `;`, line break, group start or background `&`;
 * `&&`, `&>`, `>&`, `<&` and `|&` are not background operators.
 */
export function backgrounded(line: string): string[] {
  const text = stripHeredocs(line)
  const out: string[] = []
  let start = 0
  // Where each enclosing `(`/`{` group's own list began: `(claude -p x) &` backgrounds the group.
  const outer: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'") {
      const end = text.indexOf("'", i + 1)
      i = end < 0 ? text.length : end
    } else if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      i = j
    } else if (c === '\\') i++
    else if (c === '#' && (i === 0 || /[\s;&|()]/.test(text[i - 1]))) {
      const end = text.indexOf('\n', i)
      i = end < 0 ? text.length : end - 1
    } else if (c === '(' || c === '{') {
      outer.push(start)
      start = i + 1
    } else if (c === ')' || c === '}') start = outer.pop() ?? i + 1
    else if (c === ';' || c === '\n') start = i + 1
    else if (c === '&') {
      if (text[i + 1] === '&') i++
      else if (text[i + 1] === '>' || /[<>|]/.test(text[i - 1] ?? '')) continue
      else {
        out.push(text.slice(start, i))
        start = i + 1
      }
    }
  }
  return out
}

export function visibleLanes(on: On) {
  // Session state is read only on the deny path, as in the Bash hook below,
  // so an ordinary Workflow call never depends on it.
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    let script = e.script
    // scriptPath wins over script in the tool; read it so a re-run cannot slip past.
    if (e.scriptPath) {
      try {
        script = await $.fs.read(e.scriptPath)
      } catch {
        return next(e)
      }
    }
    // A named workflow's text is not readable here: the gates decide.
    if (typeof script !== 'string') return next(e)
    if (!manyAgents(script)) return next(e)
    if (!inScope(await $.session.cwd())) return next(e)
    if ((await $.session.surfaces()).length === 0) return next(e)
    return { deny: ONE_LANE }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const hidden =
      e.run_in_background === true ? isPrintAgent(e.command) : backgrounded(e.command).some(isPrintAgent)
    if (!hidden) return next(e)
    if (!inScope(await $.session.cwd())) return next(e)
    if ((await $.session.surfaces()).length === 0) return next(e)
    return { deny: HIDDEN_AGENT }
  })
}
