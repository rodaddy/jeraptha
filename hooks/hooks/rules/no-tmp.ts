import type { EngineInterface, On } from 'claude-code'
import { noTmp as decide, realpathQueries, type NoTmpInput } from '../core/no-tmp.ts'

// Claude adapter over the shared no-tmp core (hooks/core/no-tmp.ts): it maps
// the engine's tool calls to the core input, resolves links through the
// engine's async fs.stat up front, and hands the core a sync lookup.
async function verdict($: EngineInterface, input: Omit<NoTmpInput, 'cwd' | 'tmpdir' | 'home' | 'realpath'>) {
  const cwd = await $.session.cwd().catch(() => undefined)
  if (cwd === undefined) return null
  const tmpdir = (await $.env.get('TMPDIR').catch(() => undefined)) || undefined
  const home = (await $.env.get('HOME').catch(() => undefined)) || undefined
  const base = { ...input, cwd, tmpdir, home }
  // A path that stats but has no realPath exists and leads nowhere (a dangling link): null.
  const real = new Map<string, string | null>()
  await Promise.all(
    realpathQueries(base).map(async p => {
      const stat = await $.fs.stat(p, { resolve: true }).catch(() => undefined)
      if (stat) real.set(p, stat.realPath || null)
    }),
  )
  return decide({ ...base, realpath: p => (real.has(p) ? (real.get(p) ?? null) : '') })
}

export function noTmp(on: On) {
  const files: Array<[string, 'file_path' | 'notebook_path', string]> = [
    ['Write', 'file_path', 'write'],
    ['Edit', 'file_path', 'edit'],
    ['NotebookEdit', 'notebook_path', 'notebook'],
  ]
  for (const [tool, key, name] of files)
    on('tool.call', { tool }, async ($, e, next) => {
      const path = (e as unknown as Record<string, unknown>)[key]
      if (typeof path !== 'string') return next(e)
      return (await verdict($, { tool: name, path })) ?? next(e)
    })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    return (await verdict($, { tool: 'bash', command: e.command })) ?? next(e)
  })
}
