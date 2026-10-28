import type { On } from 'claude-code'

// Ruling: `X=git; $X status` should run as written, not be refused.
// Rule C8 (2026-09-29) took this substitution out of the gates' READING, so
// here the line itself is rewritten before the gates see it: they then judge
// the literal command that runs. Anything this reader is unsure of is passed
// on unchanged with next(e) for the gates to decide.

import { SCOPE_ROOTS as SCOPES } from '../config.ts'

// shell.ts drops token offsets, and a rewrite needs them, so this rule keeps
// its own small scanner: tokens with their raw text and span, grouped into
// simple commands with the separators around them and their paren depth.
type Tok = { raw: string; start: number; end: number }
type Cmd = { toks: Tok[]; before: string; after: string; depth: number }
const CONTINUES = new Set(['&&', '||', '|', '|&'])

function scan(line: string): Cmd[] | undefined {
  const cmds: Cmd[] = []
  let toks: Tok[] = []
  let depth = 0
  let before = ''
  let start = -1
  let quote = ''
  const endTok = (i: number) => {
    if (start >= 0) toks.push({ raw: line.slice(start, i), start, end: i })
    start = -1
  }
  const endCmd = (i: number, sep: string) => {
    endTok(i)
    const empty = !toks.length
    if (!empty) cmds.push({ toks, before, after: sep, depth })
    toks = []
    // A line break right after && || | continues that list: the next command
    // keeps the operator as its `before`, so it stays conditional.
    if (!(empty && sep === '\n' && CONTINUES.has(before))) before = sep
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = ''
      else if (c === '\\' && quote === '"') i++
      continue
    }
    if (c === "'" || c === '"') {
      if (start < 0) start = i
      quote = c
      continue
    }
    if (c === '\\') {
      if (start < 0) start = i
      i++
      continue
    }
    if (c === '#' && start < 0) {
      while (i + 1 < line.length && line[i + 1] !== '\n') i++
      continue
    }
    if (c === ' ' || c === '\t') {
      endTok(i)
      continue
    }
    if (c === '\n' || c === ';' || c === '|' || c === '&') {
      const two = line.slice(i, i + 2)
      const sep = two === '&&' || two === '||' || two === ';;' || two === '|&' ? two : c
      endCmd(i, sep)
      i += sep.length - 1
      continue
    }
    if (c === '(' || c === ')') {
      endCmd(i, c)
      depth += c === '(' ? 1 : -1
      continue
    }
    if (start < 0) start = i
  }
  if (quote) return undefined
  endCmd(line.length, '')
  return cmds
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s
// Control words make an assignment conditional or scoped: leave those lines alone.
const CONTROL = new Set(['if', 'then', 'else', 'elif', 'fi', 'while', 'until', 'for', 'do', 'done', 'case', 'esac', 'function', 'select', '{', '}', '!', '[[', 'coproc'])
const SAFE_WORD = /^[A-Za-z0-9_./:@%+,-][A-Za-z0-9_./:@%+=,-]*$/
// Words that mean something else in command position (bash and zsh reserved
// words); a value equal to one is quoted so it stays a plain command word.
const RESERVED = new Set([...CONTROL, 'in', 'time', ']]', 'repeat', 'foreach', 'end', 'nocorrect'])
// Commands that can set a variable without its name in the line: from a
// file, from a string, or from an expanded name. One of these between the
// assignment and the use leaves the line to the gates.
const SETTERS = new Set(['eval', 'source', '.', 'read', 'printf', 'declare', 'typeset', 'local', 'export',
  'readonly', 'mapfile', 'readarray', 'getopts', 'let', 'unset', 'builtin', 'command', 'vared', 'zparseopts', 'integer', 'float'])

/** The literal a raw assignment value stands for, or undefined when it is not one. */
function literal(raw: string): string | undefined {
  // No expansion ($ ` ~), no glob, no escapes or redirects, and no space even
  // quoted: zsh would not split it, bash would, so neither rewrite is safe.
  if (/[$`~*?[\\<>\s]/.test(raw)) return undefined
  let out = ''
  let quote = ''
  for (const c of raw) {
    if (quote) c === quote ? (quote = '') : (out += c)
    else if (c === "'" || c === '"') quote = c
    else out += c
  }
  return out === '' ? undefined : out
}

/** The value as a shell word that reads back as that one literal word. */
function asWord(value: string): string | undefined {
  // `A=b` unquoted would parse as an assignment, `if` as a reserved word.
  if (SAFE_WORD.test(value) && !ASSIGN.test(value) && !RESERVED.has(value)) return value
  return value.includes("'") ? undefined : `'${value}'`
}

/** The NAME of a `$NAME` or `${NAME}` token, else undefined. */
function varName(raw: string): string | undefined {
  const m = /^\$\{([^}]*)\}$/.exec(raw) ?? /^\$(.*)$/.exec(raw)
  return m && NAME.test(m[1]) ? m[1] : undefined
}

/** Whether `cmd` is a standalone `NAME=v ...` or `export NAME=v ...` command. */
function isStandaloneAssignment(cmd: Cmd): boolean {
  const toks = cmd.toks[0].raw === 'export' ? cmd.toks.slice(1) : cmd.toks
  return toks.length > 0 && toks.every(t => ASSIGN.test(t.raw))
}

/** Whether `cmd` may set a variable without naming it, as far as this reader can tell. */
// A command word this rule already rewrote counts as its literal value, so
// `A=git B=wt; $A x; $B y` still rewrites both.
function setsUnseen(cmd: Cmd, name: string, edits: Edit[]): boolean {
  const word = cmd.toks.find(t => !ASSIGN.test(t.raw))
  if (!word) return false
  const value = edits.find(e => e.start === word.start)?.value ?? word.raw
  if (/[$`]/.test(value)) return varName(value) !== name
  return SETTERS.has(value.replace(/['"\\]/g, ''))
}

/** Whether `cmd` is a setter builtin (declare, typeset, ...) that names NAME. */
function declares(cmd: Cmd, name: string): boolean {
  const word = cmd.toks.find(t => !ASSIGN.test(t.raw))
  if (!word || !SETTERS.has(word.raw.replace(/['"\\]/g, ''))) return false
  return cmd.toks.some(t => t !== word && (t.raw === name || t.raw.startsWith(`${name}=`)))
}

type Edit = { start: number; end: number; name: string; value: string; word: string }

function findEdits(line: string): Edit[] {
  if (line.includes('<<')) return [] // a heredoc body is not commands
  const cmds = scan(line)
  if (!cmds) return []
  const edits: Edit[] = []
  for (let u = 0; u < cmds.length; u++) {
    const words = cmds[u].toks
    const at = words.findIndex(t => !ASSIGN.test(t.raw))
    if (at < 0) continue
    const use = words[at]
    const name = varName(use.raw)
    if (!name) continue
    if (cmds.slice(0, u + 1).some(c => CONTROL.has(c.toks[0].raw))) continue
    // The nearest earlier token that assigns NAME, in a standalone assignment.
    let found: { cmd: Cmd; tok: Tok; at: number } | undefined
    for (let c = u; c >= 0 && !found; c--) {
      for (const tok of [...cmds[c].toks].reverse()) {
        if (tok.start < use.start && tok.raw.startsWith(`${name}=`)) {
          found = { cmd: cmds[c], tok, at: c }
          break
        }
      }
    }
    if (!found || found.cmd === cmds[u] || !isStandaloneAssignment(found.cmd)) continue
    // Assigned more than once before the use: the spec leaves that to the gates.
    const assigns = cmds.slice(0, u + 1).flatMap(c => c.toks).filter(t => t.start < use.start && t.raw.startsWith(`${name}=`))
    if (assigns.length !== 1) continue
    // It must run unconditionally in this shell, before the use.
    const { cmd, tok, at: from } = found
    if (cmd.depth !== 0 || !['', ';', '\n', '&'].includes(cmd.before)) continue
    if (!['&&', '||', ';', '\n'].includes(cmd.after)) continue
    // Nothing between may touch NAME again: no reassignment, read, unset, ${NAME:=}.
    const between = line.slice(tok.end, use.start)
    const mention = new RegExp(`(?<!\\$\\{)(?<![\\w$])${name}(?!\\w)|\\$\\{${name}:{0,2}=`)
    if (mention.test(between)) continue
    // Nor set it without naming it (eval, source, read "$N", ...), nor run a
    // command word that is not literal and so could be any of those.
    if (cmds.slice(from + 1, u).some(c => setsUnseen(c, name, edits))) continue
    // A declare/typeset/local of NAME before the assignment can give it an
    // attribute (-n nameref, -i integer, -u/-l case) that changes what `$NAME`
    // expands to: `declare -n R; R=K; $R` runs $K, not K.
    if (cmds.slice(0, from).some(c => declares(c, name))) continue
    // IFS set in the line splits `$NAME` in bash (not zsh): leave it alone.
    if (/(?<!\w)IFS(?!\w)/.test(line.slice(0, use.start))) continue
    const value = literal(tok.raw.slice(name.length + 1))
    const word = value === undefined ? undefined : asWord(value)
    if (value === undefined || word === undefined) continue
    edits.push({ start: use.start, end: use.end, name, value, word })
  }
  return edits
}

/** The line with every qualifying `$NAME` command word replaced, and what changed. */
export function rewriteLiteralWords(line: string): { command: string; notes: string[] } | undefined {
  const edits = findEdits(line)
  if (!edits.length) return undefined
  let command = line
  for (const e of [...edits].reverse()) command = command.slice(0, e.start) + e.word + command.slice(e.end)
  const notes = [...new Set(edits.map(e => `rewrote $${e.name} to ${e.value}: write literal command words`))]
  return { command, notes }
}

export function literalWord(on: On) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    // No cwd (an engine without session.cwd): unsure, so pass on unchanged
    // rather than let a throw skip the gates registered after this rule.
    const cwd = await $.session.cwd().catch(() => undefined)
    if (cwd === undefined || !SCOPES.some(s => cwd === s || cwd.startsWith(`${s}/`))) return next(e)
    const r = rewriteLiteralWords(e.command)
    if (!r) return next(e)
    const out = await next({ ...e, command: r.command })
    if (out.deny !== undefined) return out
    return { ...out, context: [...(out.context ?? []), ...r.notes] }
  })
}
