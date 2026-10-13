import type { On } from 'claude-code'
import { commands } from '../lib/shell.ts'

// Rico rulings 2026-10-05: "We should never be running claude -p for anything.
// If you're running stuff locally, all you do is run Workflow agents." And
// Fable runs only when Rico selects it: a head once launched three Fable passes
// on its own reading of "kick it to a smarter model".
export const PRINT_DENY =
  'claude -p is never run (Rico ruling 2026-10-05): local work runs as Workflow agents'
export const FABLE_DENY =
  'Fable runs only when Rico selects it (2026-10-05); use opus or sonnet, or ask Rico'

import { inScope } from '../config.ts'

const CLAUDE = new Set(['claude', 'claudex'])
// A short-option cluster holding `p` is print mode too (`claude -cp x`).
const PRINT_CLUSTER = /^-[a-zA-Z]*p[a-zA-Z]*$/
const FABLE_PIN = /\bmodel\s*:\s*['"`](?:fable|claude-fable[\w.-]*)['"`]/i
const FABLE_MODEL = /^(?:fable|claude-fable)/i
// The calls that start a worker: agent() and the canonical router.
const WORKER_CALL = /\b(agent|routeWorkflowWorker)\s*\(/g

// Rico sets DEV_RULES_ALLOW_FABLE=1 when he launches a Fable session. A hooks
// module has no `process`, so the variable is read through $.env.
const fableAllowed = async ($: { env: { get: (name: string) => Promise<string | undefined> } }) =>
  (await $.env.get('DEV_RULES_ALLOW_FABLE')) === '1'

function isPrintArgv(argv: string[]): boolean {
  for (const a of argv.slice(1)) {
    if (a === '--') return false
    if (a === '-p' || a === '--print' || PRINT_CLUSTER.test(a)) return true
  }
  return false
}

/** True when the line launches claude or claudex in print mode, at any depth
 *  the shell reader unwraps (`bash -c`, `eval`, wrappers). */
export function isClaudePrint(line: string): boolean {
  return commands(line).some(c => CLAUDE.has(c.head) && isPrintArgv(c.argv))
}

/** Index of the quote that closes the string opening at `i` (or the end). */
function stringEnd(code: string, i: number): number {
  for (let j = i + 1; j < code.length; j++) {
    if (code[j] === '\\') j++
    else if (code[j] === code[i]) return j
  }
  return code.length
}

/** Top-level argument sources of the call whose `(` sits at `open`. Strings
 *  are skipped, so a paren or comma inside a prompt does not cut an argument. */
function callArgs(code: string, open: number): string[] {
  const args: string[] = []
  let depth = 0
  let start = open + 1
  for (let i = open; i < code.length; i++) {
    const c = code[i]
    if (c === '"' || c === "'" || c === '`') i = stringEnd(code, i)
    else if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') {
      if (--depth === 0) return [...args, code.slice(start, i)]
    } else if (c === ',' && depth === 1) {
      args.push(code.slice(start, i))
      start = i + 1
    }
  }
  return args
}

/** True when a Workflow script asks for Fable: an `agent()` options object, or
 *  a `routeWorkflowWorker()` route (its first argument), pins a Fable model.
 *  A `model:` elsewhere -- the router's route table -- does not count. */
export function hasFableModel(script: string): boolean {
  for (const m of script.matchAll(WORKER_CALL)) {
    const args = callArgs(script, m.index + m[0].length - 1)
    const asked = m[1] === 'agent' ? args.slice(1) : args.slice(0, 1)
    if (asked.some(a => a.trim().startsWith('{') && FABLE_PIN.test(a))) return true
  }
  return false
}

export function modelGate(on: On) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!isClaudePrint(e.command)) return next(e)
    if (!inScope(await $.session.cwd())) return next(e)
    return { deny: PRINT_DENY }
  })

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    if (await fableAllowed($)) return next(e)
    if (!inScope(await $.session.cwd())) return next(e)
    let script = e.script
    // scriptPath wins over script in the tool; an unreadable file is allowed.
    if (e.scriptPath) {
      try {
        script = await $.fs.read(e.scriptPath)
      } catch {
        return next(e)
      }
    }
    if (typeof script !== 'string' || !hasFableModel(script)) return next(e)
    return { deny: FABLE_DENY }
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (await fableAllowed($)) return next(e)
    if (typeof e.model !== 'string' || !FABLE_MODEL.test(e.model)) return next(e)
    if (!inScope(await $.session.cwd())) return next(e)
    return { deny: FABLE_DENY }
  })
}
