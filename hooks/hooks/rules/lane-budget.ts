import type { On } from 'claude-code'

// Only watch loops are denied here (Rico ruling 2026-10-05). Earlier per-day
// and per-PR lane counts were removed: they belong to a review service's
// budget, not to the local machine.
export const LOOP_DENY =
  'no watch loops (Rico ruling 2026-10-05): wait on one notification, or poll no more often than every 30 minutes'

import { inScope } from '../config.ts'

/** True when a 5-field cron fires more often than every 30 minutes: minute
 *  `*`, `* /N` with N < 30, or a list or range with a gap under 30. An
 *  expression it cannot read is allowed. */
export function cronTooFrequent(cron: string): boolean {
  const minute = cron.trim().split(/\s+/)[0]
  if (!minute) return false
  const mins = new Set<number>()
  for (const part of minute.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
    if (!m) return false
    const step = m[4] ? Number(m[4]) : 1
    if (step < 1) return false
    const lo = m[1] === '*' ? 0 : Number(m[2])
    const hi = m[1] === '*' ? 59 : m[3] !== undefined ? Number(m[3]) : m[4] ? 59 : lo
    for (let i = lo; i <= hi && i < 60; i += step) mins.add(i)
  }
  const sorted = [...mins].sort((a, b) => a - b)
  return sorted.some((v, i) => i > 0 && v - sorted[i - 1]! < 30)
}

export function laneBudget(on: On) {
  on('tool.call', { tool: 'ScheduleWakeup' }, async ($, e, next) => {
    if (e.stop || typeof e.delaySeconds !== 'number' || e.delaySeconds >= 1800) return next(e)
    if (!inScope(await $.session.cwd())) return next(e)
    return { deny: LOOP_DENY }
  })

  on('tool.call', { tool: 'CronCreate' }, async ($, e, next) => {
    if (typeof e.cron !== 'string' || !cronTooFrequent(e.cron)) return next(e)
    if (!inScope(await $.session.cwd())) return next(e)
    return { deny: LOOP_DENY }
  })
}
