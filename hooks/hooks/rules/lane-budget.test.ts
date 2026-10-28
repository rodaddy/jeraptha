import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LOOP_DENY, cronTooFrequent } from './lane-budget.ts'

// Loads the mod folder as a session does: the rule is wired in
// hooks/register.ts. The session cwd is answered here with a fake.
const ran = { result: { ok: true } }
const DEV = '/work/dev'
const META = "export const meta = { name: 'x', description: 'x' }\n"

function world(on: On, cwd = DEV) {
  on('session.cwd', () => ({ value: cwd }))
  on('tool.call', { tool: 'Workflow' }, () => ran)
  on('tool.call', { tool: 'ScheduleWakeup' }, () => ran)
  on('tool.call', { tool: 'CronCreate' }, () => ran)
}

const launch = ($: { tool: { call: (a: never) => Promise<{ deny?: string; context?: string[] }> } }, prompt: string) =>
  $.tool.call({ tool: 'Workflow', script: META + `await agent(${JSON.stringify(prompt)}, { model: 'opus' })\n` } as never)

// Rico 2026-10-05: the lane counts were a review service's budgets, not local ones.
test('Workflow launches in Development are never denied or annotated, even past 25', async ($, on) => {
  world(on)
  for (let i = 0; i < 26; i++) {
    const r = await launch($, `review PR 934, lane ${i}`)
    expect(r.deny).toBeUndefined()
    expect(r.context ?? []).toEqual([])
  }
})

test('ScheduleWakeup under 30 minutes is denied, 1800 s allowed', async ($, on) => {
  world(on)
  const r1 = await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 600, reason: 'x', prompt: 'x' } as never)
  expect(r1.deny).toBe(LOOP_DENY)
  const r2 = await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 1800, reason: 'x', prompt: 'x' } as never)
  expect(r2.deny).toBeUndefined()
})

test('CronCreate every 5 minutes is denied, hourly allowed', async ($, on) => {
  world(on)
  const r1 = await $.tool.call({ tool: 'CronCreate', cron: '*/5 * * * *', prompt: 'x' } as never)
  expect(r1.deny).toBe(LOOP_DENY)
  const r2 = await $.tool.call({ tool: 'CronCreate', cron: '0 * * * *', prompt: 'x' } as never)
  expect(r2.deny).toBeUndefined()
})

test('cron minute field reading', () => {
  for (const c of ['* * * * *', '*/29 * * * *', '0,15 * * * *', '0-5 * * * *', '10-40/10 * * * *']) {
    expect(cronTooFrequent(c)).toBe(true)
  }
  for (const c of ['0 * * * *', '*/30 * * * *', '0,30 * * * *', '5 9 * * 1', 'garbage']) {
    expect(cronTooFrequent(c)).toBe(false)
  }
})

test('outside scope watch loops are allowed', async ($, on) => {
  world(on, '/Users/me/elsewhere')
  expect((await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 60, reason: 'x', prompt: 'x' } as never)).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'CronCreate', cron: '* * * * *', prompt: 'x' } as never)).deny).toBeUndefined()
})
