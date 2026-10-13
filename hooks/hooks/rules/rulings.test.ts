import type { On } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'
import { SECTION_ID } from './rulings.ts'

// An inline plugin may not import the rule (its register must be
// self-contained), so these tests drive the mod itself: rulings(on) must be
// wired in register.ts for them to pass.
const engine = { sections: [{ id: 'intro', text: 'core', scope: 'shared' as const }] }
// What the engine resolved for one render; the composer needs a model id.
const facts = {
  model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal' as const],
  tools: [], outputStyle: null, traits: [],
}

function world(on: On, cwd: string, env: Record<string, string> = {}) {
  on('prompt.compose', () => engine)
  on('session.cwd', () => ({ value: cwd }))
  mock.env(on, env)
}

test('adds one session section under the workspace, naming Claude Code native', async ($, on) => {
  world(on, '/work/dev/jeraptha/hooks')
  const { sections } = await $.prompt.compose(facts)
  expect(sections.map(s => s.id)).toEqual(['intro', SECTION_ID])
  const s = sections[1]
  expect(s.scope).toBe('session')
  expect(s.text).toContain('Harness: Claude Code native.')
  expect(s.text).toContain('Claudex is Claudex, Claude is Claude, Codex is Codex, Pi is Pi')
  for (const bit of ['model decision', 'read the headings', 'naming which rule and why', 'two-reviewer swarm',
    'one seat', 'own temp', 'share you own', 'generated wiki page', 'full plan-verify loop'])
    expect(s.text).toContain(bit)
  expect(s.text.split('\n').length).toBeLessThan(25)
})

test('applies under _tmp too', async ($, on) => {
  world(on, '/work/_tmp/development/x')
  expect((await $.prompt.compose(facts)).sections.map(s => s.id)).toContain(SECTION_ID)
})

test('names Claudex on the native claudex profile', async ($, on) => {
  world(on, '/work/dev', { CLAUDEX_ARBITER: '1' })
  const s = (await $.prompt.compose(facts)).sections.find(x => x.id === SECTION_ID)
  expect(s?.text).toContain('Harness: Claudex.')
})

test('names Claudex on a Codex-routed claudex session', async ($, on) => {
  world(on, '/work/dev', { CLAUDE_CONFIG_DIR: '/Users/me/.claudex' })
  const s = (await $.prompt.compose(facts)).sections.find(x => x.id === SECTION_ID)
  expect(s?.text).toContain('Harness: Claudex.')
})

for (const [label, env] of [
  ['another config dir', { CLAUDE_CONFIG_DIR: '/Users/me/.claude' }],
  ['a dir merely named claudex', { CLAUDE_CONFIG_DIR: '/Users/me/claudex' }],
  ['arbiter not 1', { CLAUDEX_ARBITER: '0' }],
] as const) {
  test(`stays Claude Code native: ${label}`, async ($, on) => {
    world(on, '/work/dev', env)
    const s = (await $.prompt.compose(facts)).sections.find(x => x.id === SECTION_ID)
    expect(s?.text).toContain('Harness: Claude Code native.')
  })
}

for (const cwd of ['/Users/me', '/work/dev-old', '/work/_tmpx']) {
  test(`leaves the prompt alone outside scope: ${cwd}`, async ($, on) => {
    world(on, cwd)
    expect(await $.prompt.compose(facts)).toEqual(engine)
  })
}
