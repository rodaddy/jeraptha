import type { On } from 'claude-code'

// The judgment-call rulings ride the
// system prompt every turn instead of living in a file nobody opens.
export const SECTION_ID = 'dev-rules:rulings'
import { RULINGS, SCOPE_ROOTS as ROOTS } from '../config.ts'

export { RULINGS }

// claudex marks its sessions: the native profile sets CLAUDEX_ARBITER=1, the
// Codex routes point CLAUDE_CONFIG_DIR at ~/.claudex. Neither: Claude Code.
export function harnessLine(arbiter?: string, configDir?: string): string {
  const name = arbiter === '1' || /\/\.claudex\/?$/.test(configDir ?? '') ? 'Claudex' : 'Claude Code native'
  return `Harness: ${name}. Claudex is Claudex, Claude is Claude, Codex is Codex, Pi is Pi; rules for other harnesses do not apply here.`
}

export function rulings(on: On) {
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const cwd = await $.session.cwd()
    if (!ROOTS.some(root => cwd === root || cwd.startsWith(root + '/'))) return r
    const head = harnessLine(await $.env.get('CLAUDEX_ARBITER'), await $.env.get('CLAUDE_CONFIG_DIR'))
    const text = ['# Operator rulings (dev-rules)', head, ...RULINGS.map(l => `- ${l}`)].join('\n')
    return { sections: [...r.sections, { id: SECTION_ID, text, scope: 'session' as const }] }
  })
}
