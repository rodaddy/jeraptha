// rule-check: the dev-rules shared core for harnesses that are not Claude
// Code. One hook payload JSON on stdin, verdict out.
//
//   /opt/homebrew/opt/node@24/bin/node rule-check.ts --harness codex|pi
//
// codex: a PreToolUse payload. Deny prints {"decision":"block","reason"} on
//        stdout and exits 0, the shape ~/.codex/hooks/*-guard hooks use.
// pi:    {toolName, input, cwd} built by a Pi extension from the
//        tool_call event. Deny prints the reason on stdout and exits 2.
//
// FAIL OPEN: these are style rules, not safety gates. Malformed input, an
// unknown tool or any exception allows (exit 0) with one line on stderr.
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { noTmp, type NoTmpInput } from '../hooks/core/no-tmp.ts'
import { commands } from '../hooks/lib/shell.ts'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** Paths an apply_patch body touches: its Add, Update and Delete File lines, and Move to targets. */
export function patchPaths(text: string): string[] {
  return [...text.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+?)\s*$/gm)].map(m => m[1])
}

const PATCH_HEADS = new Set(['apply_patch', 'applypatch'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])

/**
 * Patch bodies a shell command hands to an executed `apply_patch`: its
 * argument, or the heredoc on its line. `apply_patch` must be a command word
 * (per commands()); patch text in comments, quoted strings or another
 * command's heredoc is data, not a patch (PR 914 review).
 */
export function shellPatches(command: string): string[] {
  const bodies: string[] = []
  for (const c of commands(command)) if (PATCH_HEADS.has(c.head)) bodies.push(c.argv.slice(1).join('\n'))
  const lines = command.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]
    const runs = commands(header).some(c => PATCH_HEADS.has(c.head))
    // Every heredoc opened on this line, in order; `<<<` is a here-string.
    for (const m of header.matchAll(/(?<!<)<<(-?)[ \t]*(['"]?)([^\s'"<>;&|()]+)\2/g)) {
      const body: string[] = []
      while (++i < lines.length && (m[1] ? lines[i].replace(/^\t+/, '') : lines[i]) !== m[3]) body.push(lines[i])
      if (runs) bodies.push(body.join('\n'))
    }
  }
  return bodies
}

/** One word, single-quoted so the shell reader sees it as exactly that word. */
const quote = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`

/**
 * A Codex shell command, string or argv. A shell argv (`bash -lc '<script>'`)
 * yields its script; any other argv is words, quoted so it is never re-parsed
 * as shell (`["echo", "a > /tmp/x"]` writes nothing; PR 914 review).
 */
function shellText(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length > 0 && v.every(a => typeof a === 'string')) {
    const k = v.findIndex(a => /^-[a-z]*c$/.test(a))
    if (SHELLS.has(basename(v[0])) && k > 0 && k + 1 < v.length) return v[k + 1]
    return v.map(quote).join(' ')
  }
  return undefined
}

/** The patch an argv `["apply_patch", "<patch>"]` carries, else undefined. */
function argvPatch(v: unknown): string | undefined {
  if (!Array.isArray(v) || !PATCH_HEADS.has(basename(String(v[0])))) return undefined
  return v.slice(1).filter(a => typeof a === 'string').join('\n')
}

/** Pi spells a path `@/x` or `file:///x` too; the core reads `~` against HOME. */
function piPath(p: string): string {
  const at = p.startsWith('@') ? p.slice(1) : p
  return at.startsWith('file://') ? fileURLToPath(at) : at
}

/**
 * realpathSync for the core: the real path; '' when nothing is there (the
 * core then asks the parent); null when a link is there but leads nowhere, so
 * the CLI denies a dangling link as the Claude hook does.
 */
function realpath(p: string): string | null {
  try {
    return realpathSync(p)
  } catch {
    return lstatSync(p, { throwIfNoEntry: false }) ? null : ''
  }
}

type Call = Omit<NoTmpInput, 'cwd' | 'tmpdir' | 'home' | 'realpath'>

/** Codex PreToolUse -> core calls, or undefined for a tool this does not read. */
function fromCodex(p: Rec): { cwd: string; calls: Call[] } | undefined {
  const name = str(p.tool_name ?? p.toolName ?? p.tool ?? p.name) ?? ''
  const raw = p.tool_input ?? p.toolInput ?? p.input ?? p.arguments
  const input: Rec = isRec(raw) ? raw : {}
  const cwd = str(p.cwd) ?? process.env.PWD ?? process.cwd()
  if (/^(functions\.)?apply_patch$/i.test(name)) {
    const text = typeof raw === 'string' ? raw : (str(input.input) ?? str(input.patch) ?? argvPatch(input.command) ?? shellText(input.command) ?? '')
    return { cwd, calls: patchPaths(text).map(path => ({ tool: 'write', path })) }
  }
  if (/^(bash|shell|local_shell|exec_command|functions\.exec_command)$/i.test(name)) {
    const argv = input.command ?? input.cmd ?? p.command
    const text = shellText(argv)
    if (text === undefined) return undefined
    // The command runs in its workdir. The core keeps the session cwd for its
    // scope and reads a literal `cd` as the base for relative targets.
    const wd = str(input.workdir)
    const workdir = wd ? resolve(cwd, wd) : undefined
    const command = workdir ? `cd ${quote(workdir)} && ${text}` : text
    // apply_patch run through the shell (`apply_patch <<'EOF'`, or argv) carries its paths in its body.
    const patch = argvPatch(argv)
    const paths = (patch === undefined ? shellPatches(text) : [patch])
      .flatMap(patchPaths)
      .map(path => (workdir ? resolve(workdir, path) : path))
    return { cwd, calls: [{ tool: 'bash', command }, ...paths.map(path => ({ tool: 'write', path }))] }
  }
  const file = { Write: 'write', Edit: 'edit', NotebookEdit: 'notebook' }[name]
  const path = str(input.file_path ?? input.filePath ?? input.path ?? input.notebook_path)
  if (file && path !== undefined) return { cwd, calls: [{ tool: file, path }] }
  return undefined
}

/** Pi {toolName, input, cwd} -> core calls. */
function fromPi(p: Rec): { cwd: string; calls: Call[] } | undefined {
  const name = str(p.toolName ?? p.tool_name)
  const input: Rec = isRec(p.input) ? p.input : isRec(p.tool_input) ? p.tool_input : {}
  const cwd = str(p.cwd) ?? process.cwd()
  if (name === 'bash' && typeof input.command === 'string') return { cwd, calls: [{ tool: 'bash', command: input.command }] }
  const raw = str(input.path ?? input.file_path)
  const path = raw === undefined ? undefined : piPath(raw)
  if ((name === 'write' || name === 'edit') && path !== undefined) return { cwd, calls: [{ tool: name, path }] }
  return undefined
}

export function main(argv: string[], stdin: string): { code: number; stdout: string; stderr: string } {
  const allow = (why: string) => ({ code: 0, stdout: '', stderr: why ? `rule-check: ${why} (allowed)\n` : '' })
  try {
    const k = argv.indexOf('--harness')
    const harness = k >= 0 ? argv[k + 1] : undefined
    if (harness !== 'codex' && harness !== 'pi') return allow(`unknown --harness ${harness ?? '(none)'}`)
    let payload: unknown
    try {
      payload = JSON.parse(stdin)
    } catch {
      return allow('malformed JSON on stdin')
    }
    if (!isRec(payload)) return allow('payload is not a JSON object')
    const mapped = harness === 'codex' ? fromCodex(payload) : fromPi(payload)
    if (!mapped) return allow('tool not read by any rule')
    for (const call of mapped.calls) {
      const v = noTmp({ ...call, cwd: mapped.cwd, tmpdir: process.env.TMPDIR, home: process.env.HOME, realpath })
      if (v) {
        return harness === 'codex'
          ? { code: 0, stdout: JSON.stringify({ decision: 'block', reason: v.deny }) + '\n', stderr: '' }
          : { code: 2, stdout: v.deny + '\n', stderr: '' }
      }
    }
    return allow('')
  } catch (err) {
    return allow(`error: ${(err as Error)?.message ?? String(err)}`.replace(/\s+/g, ' '))
  }
}

if (import.meta.main) {
  let stdin = ''
  try {
    stdin = readFileSync(0, 'utf8')
  } catch {
    // no stdin: main() reports it as malformed and allows
  }
  const r = main(process.argv.slice(2), stdin)
  process.stdout.write(r.stdout)
  process.stderr.write(r.stderr)
  process.exitCode = r.code
}
